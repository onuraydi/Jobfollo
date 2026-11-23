import { builtInTemplates, validateWorkflow, type Workflow } from "@jobfollo/core";
import { randomIdGenerator, systemClock } from "./defaults.js";
import {
  BuiltInWorkflowError,
  CorruptWorkflowError,
  InvalidWorkflowError,
  WorkflowInUseError,
  WorkflowNotFoundError,
} from "./errors.js";
import type {
  Clock,
  CustomWorkflowListResult,
  IdGenerator,
  InvalidStoredWorkflow,
  SqlExecutor,
  WorkflowListEntry,
  WorkflowRepository,
} from "./types.js";

const BUILT_IN_BY_ID: ReadonlyMap<string, Workflow> = new Map(
  builtInTemplates.map((workflow) => [workflow.id, workflow]),
);

function cloneWorkflow(workflow: Workflow): Workflow {
  return {
    id: workflow.id,
    name: workflow.name,
    steps: workflow.steps.map((step) => ({
      ...step,
      ...(step.runIf !== undefined ? { runIf: { ...step.runIf } } : {}),
    })),
    stopOutcomes: [...workflow.stopOutcomes],
  };
}

function parseAndValidateStoredWorkflow(
  rowId: string,
  definitionJson: string,
): { ok: true; workflow: Workflow } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(definitionJson);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `Malformed JSON: ${detail}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "Definition JSON must be an object." };
  }

  const candidate = parsed as Record<string, unknown>;
  if (!Array.isArray(candidate["steps"])) {
    return { ok: false, reason: "Definition JSON must include a steps array." };
  }
  if (!Array.isArray(candidate["stopOutcomes"])) {
    return { ok: false, reason: "Definition JSON must include a stopOutcomes array." };
  }
  if (candidate["id"] !== rowId) {
    return {
      ok: false,
      reason: `Definition id "${String(candidate["id"])}" does not match row id "${rowId}".`,
    };
  }

  const workflow = parsed as Workflow;
  const errors = validateWorkflow(workflow);
  if (errors.length > 0) {
    return { ok: false, reason: errors.map((e) => e.message).join("; ") };
  }

  return { ok: true, workflow: cloneWorkflow(workflow) };
}

interface WorkflowRow {
  id: string;
  definition_json: string;
}

export interface WorkflowRepositoryDeps {
  clock?: Clock;
  idGenerator?: IdGenerator;
}

export function createWorkflowRepository(
  executor: SqlExecutor,
  deps: WorkflowRepositoryDeps = {},
): WorkflowRepository {
  const clock = deps.clock ?? systemClock;
  const idGenerator = deps.idGenerator ?? randomIdGenerator;

  async function listCustom(): Promise<CustomWorkflowListResult> {
    const rows = await executor.select<WorkflowRow>(
      "SELECT id, definition_json FROM workflow ORDER BY name COLLATE NOCASE ASC, id ASC",
    );

    const workflows: Workflow[] = [];
    const invalid: InvalidStoredWorkflow[] = [];

    for (const row of rows) {
      const parsed = parseAndValidateStoredWorkflow(row.id, row.definition_json);
      if (parsed.ok) {
        workflows.push(parsed.workflow);
      } else {
        invalid.push({ id: row.id, reason: parsed.reason });
      }
    }

    return { workflows, invalid };
  }

  async function listAll(): Promise<WorkflowListEntry[]> {
    const builtIns: WorkflowListEntry[] = builtInTemplates.map((workflow) => ({
      workflow: cloneWorkflow(workflow),
      kind: "builtin",
    }));
    const { workflows: custom } = await listCustom();
    const customEntries: WorkflowListEntry[] = custom.map((workflow) => ({
      workflow,
      kind: "custom",
    }));
    return [...builtIns, ...customEntries];
  }

  async function get(id: string): Promise<Workflow | null> {
    const builtIn = BUILT_IN_BY_ID.get(id);
    if (builtIn) {
      return cloneWorkflow(builtIn);
    }

    const rows = await executor.select<WorkflowRow>(
      "SELECT id, definition_json FROM workflow WHERE id = ?",
      [id],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }

    const parsed = parseAndValidateStoredWorkflow(row.id, row.definition_json);
    if (!parsed.ok) {
      throw new CorruptWorkflowError(row.id, parsed.reason);
    }
    return parsed.workflow;
  }

  async function save(workflow: Workflow): Promise<Workflow> {
    if (BUILT_IN_BY_ID.has(workflow.id)) {
      throw new BuiltInWorkflowError(workflow.id, "save");
    }

    const errors = validateWorkflow(workflow);
    if (errors.length > 0) {
      throw new InvalidWorkflowError(errors);
    }

    const clean = cloneWorkflow(workflow);
    const definitionJson = JSON.stringify(clean);
    const now = clock.nowIso();

    await executor.batch([
      {
        sql: `INSERT INTO workflow (id, name, definition_json, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                definition_json = excluded.definition_json,
                updated_at = excluded.updated_at`,
        params: [clean.id, clean.name, definitionJson, now, now],
      },
    ]);

    return clean;
  }

  async function duplicate(sourceId: string, name: string): Promise<Workflow> {
    const source = await get(sourceId);
    if (!source) {
      throw new WorkflowNotFoundError(sourceId);
    }

    const copy: Workflow = {
      ...cloneWorkflow(source),
      id: idGenerator.newId(),
      name,
    };
    return save(copy);
  }

  async function remove(id: string): Promise<boolean> {
    if (BUILT_IN_BY_ID.has(id)) {
      throw new BuiltInWorkflowError(id, "delete");
    }

    const results = await executor.batch([
      {
        sql: "DELETE FROM workflow WHERE id = ? AND NOT EXISTS (SELECT 1 FROM item WHERE workflow_id = ?)",
        params: [id, id],
      },
    ]);

    if ((results[0]?.rowsAffected ?? 0) > 0) {
      return true;
    }

    const existing = await executor.select<{ id: string }>(
      "SELECT id FROM workflow WHERE id = ?",
      [id],
    );
    if (existing.length > 0) {
      throw new WorkflowInUseError(id);
    }

    return false;
  }

  return {
    listAll,
    listCustom,
    get,
    save,
    duplicate,
    delete: remove,
  };
}
