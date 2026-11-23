import type { Workflow } from "@jobfollo/core";
import { builtInTemplates, jobApplicationNetworking } from "@jobfollo/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  BuiltInWorkflowError,
  CorruptWorkflowError,
  InvalidWorkflowError,
  WorkflowInUseError,
  WorkflowNotFoundError,
  builtInMigrations,
  createWorkflowRepository,
  runMigrations,
  type Clock,
  type IdGenerator,
} from "../src/index.js";
import { createSqliteExecutor, type TestSqliteExecutor } from "./support/sqlite-executor.js";

function makeCustomWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: "custom-sales",
    name: "Sales outreach",
    steps: [
      { key: "email", title: "Send intro email", anchor: "start", offsetDays: 0 },
      { key: "followup", title: "Follow up", anchor: "step:email", offsetDays: 4 },
    ],
    stopOutcomes: ["reply", "won", "negative"],
    ...overrides,
  };
}

function makeSequenceClock(timestamps: string[]): Clock {
  let index = 0;
  return {
    nowIso: () => timestamps[Math.min(index++, timestamps.length - 1)]!,
  };
}

function makeSequenceIds(ids: string[]): IdGenerator {
  let index = 0;
  return {
    newId: () => ids[index++] ?? `id-${index}`,
  };
}

describe("WorkflowRepository", () => {
  let db: TestSqliteExecutor | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  async function setup(opts?: { clock?: Clock; idGenerator?: IdGenerator }) {
    db = createSqliteExecutor();
    const clock = opts?.clock ?? makeSequenceClock(["2026-03-10T09:00:00.000Z"]);
    await runMigrations(db, builtInMigrations, clock);
    const repo = createWorkflowRepository(db, {
      clock,
      idGenerator: opts?.idGenerator ?? makeSequenceIds(["copy-1", "copy-2"]),
    });
    return { db, repo };
  }

  it("resolves built-in templates from core via get(id) without DB rows", async () => {
    const { repo } = await setup();

    for (const template of builtInTemplates) {
      expect(await repo.get(template.id)).toEqual(template);
    }
    expect(await repo.get("does-not-exist")).toBeNull();
  });

  it("saves and loads a custom workflow deep-equal with derived name column", async () => {
    const { db: conn, repo } = await setup();
    const custom = makeCustomWorkflow();

    const saved = await repo.save(custom);
    expect(saved).toEqual(custom);
    expect(await repo.get(custom.id)).toEqual(custom);

    const rows = await conn.select<{ id: string; name: string }>(
      "SELECT id, name FROM workflow WHERE id = ?",
      [custom.id],
    );
    expect(rows).toEqual([{ id: "custom-sales", name: "Sales outreach" }]);
  });

  it("preserves created_at and updates updated_at on save() upsert", async () => {
    const clock = makeSequenceClock([
      "2026-03-10T09:00:00.000Z", // migration
      "2026-03-10T10:00:00.000Z", // first save
      "2026-03-12T15:30:00.000Z", // second save
    ]);
    const { db: conn, repo } = await setup({ clock });

    const original = makeCustomWorkflow();
    await repo.save(original);

    const updated = makeCustomWorkflow({ name: "Sales outreach v2" });
    await repo.save(updated);

    expect(await repo.get(original.id)).toEqual(updated);

    const rows = await conn.select<{
      name: string;
      created_at: string;
      updated_at: string;
    }>("SELECT name, created_at, updated_at FROM workflow WHERE id = ?", [original.id]);

    expect(rows).toEqual([
      {
        name: "Sales outreach v2",
        created_at: "2026-03-10T10:00:00.000Z",
        updated_at: "2026-03-12T15:30:00.000Z",
      },
    ]);
  });

  it("rejects saving a built-in workflow id without writing to DB", async () => {
    const { db: conn, repo } = await setup();

    await expect(repo.save(jobApplicationNetworking)).rejects.toThrow(BuiltInWorkflowError);

    const rows = await conn.select("SELECT id FROM workflow");
    expect(rows).toEqual([]);
  });

  it("rejects saving an invalid workflow with InvalidWorkflowError", async () => {
    const { repo } = await setup();

    const invalid = makeCustomWorkflow({
      steps: [
        { key: "a", title: "A", anchor: "step:b", offsetDays: -1 },
        { key: "b", title: "B", anchor: "step:a", offsetDays: 0 },
      ],
    });

    await expect(repo.save(invalid)).rejects.toThrow(InvalidWorkflowError);
  });

  it("lists built-ins first in listAll() and only custom rows in listCustom()", async () => {
    const { repo } = await setup();
    const w1 = makeCustomWorkflow({ id: "c-zeta", name: "Zeta flow" });
    const w2 = makeCustomWorkflow({ id: "c-alpha", name: "Alpha flow" });
    await repo.save(w1);
    await repo.save(w2);

    const custom = await repo.listCustom();
    expect(custom.invalid).toEqual([]);
    expect(custom.workflows.map((w) => w.id)).toEqual(["c-alpha", "c-zeta"]);

    const all = await repo.listAll();
    expect(all.slice(0, builtInTemplates.length)).toEqual(
      builtInTemplates.map((workflow) => ({ workflow, kind: "builtin" })),
    );
    expect(all.slice(builtInTemplates.length)).toEqual([
      { workflow: w2, kind: "custom" },
      { workflow: w1, kind: "custom" },
    ]);
  });

  it("duplicates a built-in or custom workflow into a new custom copy using IdGenerator", async () => {
    const { repo } = await setup({ idGenerator: makeSequenceIds(["wf-copy-1", "wf-copy-2"]) });

    const fromBuiltIn = await repo.duplicate(jobApplicationNetworking.id, "My Job Flow");
    expect(fromBuiltIn.id).toBe("wf-copy-1");
    expect(fromBuiltIn.name).toBe("My Job Flow");
    expect(fromBuiltIn.steps).toEqual(jobApplicationNetworking.steps);
    expect(fromBuiltIn.stopOutcomes).toEqual(jobApplicationNetworking.stopOutcomes);
    expect(await repo.get("wf-copy-1")).toEqual(fromBuiltIn);

    const fromCustom = await repo.duplicate("wf-copy-1", "My Job Flow v2");
    expect(fromCustom.id).toBe("wf-copy-2");
    expect(fromCustom.name).toBe("My Job Flow v2");
    expect(fromCustom.steps).toEqual(fromBuiltIn.steps);
  });

  it("rejects duplicate() for unknown sourceId or blank name", async () => {
    const { repo } = await setup();

    await expect(repo.duplicate("unknown-id", "Copy")).rejects.toThrow(WorkflowNotFoundError);
    await expect(repo.duplicate(jobApplicationNetworking.id, "   ")).rejects.toThrow(
      InvalidWorkflowError,
    );
  });

  describe("delete(id)", () => {
    it("deletes an unused custom workflow and returns true; returns false when not found", async () => {
      const { repo } = await setup();
      const custom = makeCustomWorkflow();
      await repo.save(custom);

      expect(await repo.delete(custom.id)).toBe(true);
      expect(await repo.get(custom.id)).toBeNull();
      expect(await repo.delete(custom.id)).toBe(false);
    });

    it("rejects deleting a built-in workflow id before touching DB", async () => {
      const { repo } = await setup();

      await expect(repo.delete(jobApplicationNetworking.id)).rejects.toThrow(
        BuiltInWorkflowError,
      );
    });

    it("rejects deleting a workflow referenced by an active or archived item", async () => {
      const { db: conn, repo } = await setup();
      const activeWf = makeCustomWorkflow({ id: "wf-active" });
      const archivedWf = makeCustomWorkflow({ id: "wf-archived" });
      await repo.save(activeWf);
      await repo.save(archivedWf);

      await conn.batch([
        {
          sql: "INSERT INTO item (id, title, workflow_id, start_date, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          params: ["i1", "Active Co", "wf-active", "2026-03-01", null, "2026-03-01T00:00:00Z", "2026-03-01T00:00:00Z"],
        },
        {
          sql: "INSERT INTO item (id, title, workflow_id, start_date, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          params: [
            "i2",
            "Archived Co",
            "wf-archived",
            "2026-03-01",
            "2026-03-05T00:00:00Z",
            "2026-03-01T00:00:00Z",
            "2026-03-05T00:00:00Z",
          ],
        },
      ]);

      await expect(repo.delete("wf-active")).rejects.toThrow(WorkflowInUseError);
      await expect(repo.delete("wf-archived")).rejects.toThrow(WorkflowInUseError);

      expect(await repo.get("wf-active")).toEqual(activeWf);
      expect(await repo.get("wf-archived")).toEqual(archivedWf);
    });
  });

  describe("corrupt stored rows", () => {
    it("throws CorruptWorkflowError on get(id) and reports invalid rows in listCustom()", async () => {
      const { db: conn, repo } = await setup();
      const valid = makeCustomWorkflow({ id: "wf-good", name: "Good" });
      await repo.save(valid);

      const badOffsetJson = JSON.stringify(
        makeCustomWorkflow({
          id: "wf-bad-offset",
          steps: [{ key: "s1", title: "S1", anchor: "start", offsetDays: -3 }],
        }),
      );
      const mismatchedIdJson = JSON.stringify(makeCustomWorkflow({ id: "other-id" }));

      await conn.batch([
        {
          sql: "INSERT INTO workflow (id, name, definition_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          params: ["wf-bad-json", "Bad JSON", "{not valid json", "2026-03-10T00:00:00Z", "2026-03-10T00:00:00Z"],
        },
        {
          sql: "INSERT INTO workflow (id, name, definition_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          params: ["wf-bad-offset", "Bad Offset", badOffsetJson, "2026-03-10T00:00:00Z", "2026-03-10T00:00:00Z"],
        },
        {
          sql: "INSERT INTO workflow (id, name, definition_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          params: ["wf-mismatch", "Mismatch", mismatchedIdJson, "2026-03-10T00:00:00Z", "2026-03-10T00:00:00Z"],
        },
      ]);

      await expect(repo.get("wf-bad-json")).rejects.toThrow(CorruptWorkflowError);
      await expect(repo.get("wf-bad-offset")).rejects.toThrow(CorruptWorkflowError);
      await expect(repo.get("wf-mismatch")).rejects.toThrow(CorruptWorkflowError);

      const list = await repo.listCustom();
      expect(list.workflows).toEqual([valid]);
      expect(list.invalid.map((e) => e.id).sort()).toEqual([
        "wf-bad-json",
        "wf-bad-offset",
        "wf-mismatch",
      ]);
      for (const entry of list.invalid) {
        expect(entry.reason.length).toBeGreaterThan(0);
      }
    });
  });
});
