import {
  isValidISODate,
  validateWorkflow,
  type Contact,
  type ContactStatus,
  type ISODate,
  type StepRecord,
  type Workflow,
} from "@jobfollo/core";
import type { AppServices } from "../boot/index.js";
import { isSafeHttpUrl } from "../lib/externalUrl.js";

export interface BackupItem {
  title: string;
  role?: string;
  channel?: string;
  workflowId: string;
  startDate: ISODate;
  outcome?: string;
  notes?: string;
  archived: boolean;
  contacts: Contact[];
  steps: StepRecord[];
}

export interface JobfolloBackupV1 {
  version: 1;
  exportedAt: string;
  customWorkflows: Workflow[];
  items: BackupItem[];
}

export type ParseBackupResult =
  | { ok: true; payload: JobfolloBackupV1 }
  | { ok: false; error: string };

export interface RestoreBackupSummary {
  workflowsRestored: number;
  itemsRestored: number;
}

const VALID_CONTACT_STATUSES = new Set<ContactStatus>([
  "pending",
  "accepted",
  "not_accepted",
]);

/**
 * Builds a portable, secret-free JSON backup containing all custom workflows
 * and all items (including archived items, contacts, step history, outcomes, and notes).
 */
export async function createBackupPayload(
  services: Pick<AppServices, "workflows" | "items" | "clock">,
): Promise<JobfolloBackupV1> {
  const [customResult, allItems] = await Promise.all([
    services.workflows.listCustom(),
    services.items.list({ includeArchived: true }),
  ]);

  const items: BackupItem[] = allItems.map((item) => ({
    title: item.title,
    role: item.role,
    channel: item.channel,
    workflowId: item.workflowId,
    startDate: item.startDate,
    outcome: item.outcome,
    notes: item.notes,
    archived: Boolean(item.archivedAt),
    contacts: item.contacts.map((c) => ({
      name: c.name,
      profileUrl: c.profileUrl,
      status: c.status,
    })),
    steps: item.steps.map((s) => ({
      stepKey: s.stepKey,
      completedOn: s.completedOn,
      skipped: s.skipped,
    })),
  }));

  return {
    version: 1,
    exportedAt: services.clock.nowIso(),
    customWorkflows: customResult.workflows,
    items,
  };
}

export function parseBackupJson(rawText: string): ParseBackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: "Invalid JSON file." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Backup root must be a JSON object." };
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.version !== 1) {
    return { ok: false, error: "Unsupported backup version." };
  }

  if (!Array.isArray(obj.customWorkflows) || !Array.isArray(obj.items)) {
    return { ok: false, error: "Backup must contain customWorkflows and items arrays." };
  }

  const customWorkflows: Workflow[] = [];
  for (let i = 0; i < obj.customWorkflows.length; i++) {
    const wf = obj.customWorkflows[i] as Workflow;
    const errors = validateWorkflow(wf);
    if (errors.length > 0) {
      return {
        ok: false,
        error: `Invalid custom workflow at index ${i}: ${errors[0]!.message}`,
      };
    }
    customWorkflows.push(wf);
  }

  const items: BackupItem[] = [];
  for (let i = 0; i < obj.items.length; i++) {
    const raw = obj.items[i];
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { ok: false, error: `Invalid item at index ${i}.` };
    }
    const rec = raw as Record<string, unknown>;
    if (typeof rec.title !== "string" || !rec.title.trim()) {
      return { ok: false, error: `Item at index ${i} is missing a title.` };
    }
    if (typeof rec.workflowId !== "string" || !rec.workflowId.trim()) {
      return { ok: false, error: `Item at index ${i} is missing a workflowId.` };
    }
    if (typeof rec.startDate !== "string" || !isValidISODate(rec.startDate)) {
      return { ok: false, error: `Item at index ${i} has an invalid startDate.` };
    }

    const contacts: Contact[] = [];
    if (Array.isArray(rec.contacts)) {
      for (const c of rec.contacts) {
        if (typeof c !== "object" || c === null) continue;
        const cRec = c as Record<string, unknown>;
        if (typeof cRec.name !== "string" || !cRec.name.trim()) continue;
        const profileUrl =
          typeof cRec.profileUrl === "string" && cRec.profileUrl.trim()
            ? cRec.profileUrl.trim()
            : undefined;
        if (profileUrl && !isSafeHttpUrl(profileUrl)) {
          return { ok: false, error: `Item at index ${i} contains an unsafe contact URL.` };
        }
        const status: ContactStatus =
          typeof cRec.status === "string" &&
          VALID_CONTACT_STATUSES.has(cRec.status as ContactStatus)
            ? (cRec.status as ContactStatus)
            : "pending";
        contacts.push({ name: cRec.name.trim(), profileUrl, status });
      }
    }

    const steps: StepRecord[] = [];
    if (Array.isArray(rec.steps)) {
      for (const s of rec.steps) {
        if (typeof s !== "object" || s === null) continue;
        const sRec = s as Record<string, unknown>;
        if (typeof sRec.stepKey !== "string" || !sRec.stepKey.trim()) continue;
        const completedOn =
          typeof sRec.completedOn === "string" && isValidISODate(sRec.completedOn)
            ? sRec.completedOn
            : undefined;
        const skipped = sRec.skipped === true ? true : undefined;
        steps.push({ stepKey: sRec.stepKey, completedOn, skipped });
      }
    }

    items.push({
      title: rec.title.trim(),
      role: typeof rec.role === "string" && rec.role.trim() ? rec.role.trim() : undefined,
      channel:
        typeof rec.channel === "string" && rec.channel.trim() ? rec.channel.trim() : undefined,
      workflowId: rec.workflowId.trim(),
      startDate: rec.startDate,
      outcome:
        typeof rec.outcome === "string" && rec.outcome.trim() ? rec.outcome.trim() : undefined,
      notes: typeof rec.notes === "string" && rec.notes.trim() ? rec.notes : undefined,
      archived: rec.archived === true,
      contacts,
      steps,
    });
  }

  return {
    ok: true,
    payload: {
      version: 1,
      exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : "",
      customWorkflows,
      items,
    },
  };
}

export async function restoreBackup(
  services: Pick<AppServices, "workflows" | "items">,
  payload: JobfolloBackupV1,
): Promise<RestoreBackupSummary> {
  let workflowsRestored = 0;
  for (const wf of payload.customWorkflows) {
    await services.workflows.save(wf);
    workflowsRestored++;
  }

  let itemsRestored = 0;
  for (const item of payload.items) {
    const created = await services.items.create({
      title: item.title,
      role: item.role,
      channel: item.channel,
      workflowId: item.workflowId,
      startDate: item.startDate,
      notes: item.notes,
      contacts: item.contacts,
      steps: item.steps,
    });
    if (item.outcome) {
      await services.items.setOutcome(created.id, item.outcome);
    }
    if (item.archived) {
      await services.items.archive(created.id);
    }
    itemsRestored++;
  }

  return { workflowsRestored, itemsRestored };
}
