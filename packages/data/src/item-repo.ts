import {
  isValidISODate,
  type Contact,
  type ContactStatus,
  type StepRecord,
} from "@jobfollo/core";
import { randomIdGenerator, systemClock } from "./defaults.js";
import { ItemNotFoundError, ItemValidationError } from "./errors.js";
import type {
  Clock,
  CreateItemInput,
  FieldValidationIssue,
  IdGenerator,
  ItemRepository,
  ListItemsOptions,
  SqlExecutor,
  SqlStatement,
  SqlValue,
  StoredContact,
  StoredItem,
  UpdateItemPatch,
  WorkflowRepository,
} from "./types.js";

const VALID_CONTACT_STATUSES: ReadonlySet<string> = new Set<ContactStatus>([
  "pending",
  "accepted",
  "not_accepted",
]);

const MAX_SHORT_TEXT = 200;
const MAX_NOTES = 20_000;

export function isValidProfileUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateContactFields(
  contact: Contact,
  prefix: string,
  issues: FieldValidationIssue[],
): void {
  if (typeof contact.name !== "string" || contact.name.trim().length === 0) {
    issues.push({ field: `${prefix}.name`, message: "Contact name is required." });
  } else if (contact.name.trim().length > MAX_SHORT_TEXT) {
    issues.push({
      field: `${prefix}.name`,
      message: `Contact name must be at most ${MAX_SHORT_TEXT} characters.`,
    });
  }

  if (typeof contact.status !== "string" || !VALID_CONTACT_STATUSES.has(contact.status)) {
    issues.push({
      field: `${prefix}.status`,
      message: `Invalid contact status "${String(contact.status)}".`,
    });
  }

  if (contact.profileUrl !== undefined) {
    if (typeof contact.profileUrl !== "string" || !isValidProfileUrl(contact.profileUrl)) {
      issues.push({
        field: `${prefix}.profileUrl`,
        message: "Profile URL must be an absolute http:// or https:// URL.",
      });
    }
  }
}

function validateTitle(title: unknown, issues: FieldValidationIssue[]): string {
  if (typeof title !== "string") {
    issues.push({ field: "title", message: "Title must be a string." });
    return "";
  }
  const trimmed = title.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_SHORT_TEXT) {
    issues.push({
      field: "title",
      message: `Title must be between 1 and ${MAX_SHORT_TEXT} characters.`,
    });
  }
  return trimmed;
}

function validateOptionalText(
  value: unknown,
  field: string,
  maxLength: number,
  issues: FieldValidationIssue[],
): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== "string") {
    issues.push({ field, message: `${field} must be a string.` });
    return;
  }
  if (value.length > maxLength) {
    issues.push({ field, message: `${field} must be at most ${maxLength} characters.` });
  }
}

interface ItemRow {
  id: string;
  title: string;
  role: string | null;
  channel: string | null;
  workflow_id: string;
  start_date: string;
  outcome: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ContactRow {
  id: string;
  item_id: string;
  name: string;
  profile_url: string | null;
  status: ContactStatus;
}

interface StepRecordRow {
  item_id: string;
  step_key: string;
  completed_on: string | null;
  skipped: number;
}

function mapContactRow(row: ContactRow): StoredContact {
  const contact: StoredContact = {
    id: row.id,
    name: row.name,
    status: row.status,
  };
  if (row.profile_url !== null) {
    contact.profileUrl = row.profile_url;
  }
  return contact;
}

function mapStepRow(row: StepRecordRow): StepRecord {
  const record: StepRecord = {
    stepKey: row.step_key,
  };
  if (row.completed_on !== null) {
    record.completedOn = row.completed_on;
  }
  if (row.skipped === 1) {
    record.skipped = true;
  }
  return record;
}

function mapItemRow(
  row: ItemRow,
  contacts: StoredContact[],
  steps: StepRecord[],
): StoredItem {
  const item: StoredItem = {
    id: row.id,
    title: row.title,
    workflowId: row.workflow_id,
    startDate: row.start_date,
    contacts,
    steps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.role !== null) {
    item.role = row.role;
  }
  if (row.channel !== null) {
    item.channel = row.channel;
  }
  if (row.outcome !== null) {
    item.outcome = row.outcome;
  }
  if (row.notes !== null) {
    item.notes = row.notes;
  }
  if (row.archived_at !== null) {
    item.archivedAt = row.archived_at;
  }
  return item;
}

export interface ItemRepositoryDeps {
  clock?: Clock;
  idGenerator?: IdGenerator;
}

export function createItemRepository(
  executor: SqlExecutor,
  workflowRepo: WorkflowRepository,
  deps: ItemRepositoryDeps = {},
): ItemRepository {
  const clock = deps.clock ?? systemClock;
  const idGenerator = deps.idGenerator ?? randomIdGenerator;

  async function create(input: CreateItemInput): Promise<StoredItem> {
    const issues: FieldValidationIssue[] = [];

    const title = validateTitle(input.title, issues);
    validateOptionalText(input.role, "role", MAX_SHORT_TEXT, issues);
    validateOptionalText(input.channel, "channel", MAX_SHORT_TEXT, issues);
    validateOptionalText(input.notes, "notes", MAX_NOTES, issues);

    if (typeof input.startDate !== "string" || !isValidISODate(input.startDate)) {
      issues.push({ field: "startDate", message: "startDate must be a valid YYYY-MM-DD date." });
    }

    if (typeof input.workflowId !== "string" || input.workflowId.trim().length === 0) {
      issues.push({ field: "workflowId", message: "workflowId is required." });
    } else {
      const workflow = await workflowRepo.get(input.workflowId);
      if (!workflow) {
        issues.push({
          field: "workflowId",
          message: `Unknown workflow "${input.workflowId}".`,
        });
      }
    }

    const inputContacts = input.contacts ?? [];
    for (let i = 0; i < inputContacts.length; i++) {
      validateContactFields(inputContacts[i]!, `contacts[${i}]`, issues);
    }

    const inputSteps = input.steps ?? [];
    const seenStepKeys = new Set<string>();
    for (let i = 0; i < inputSteps.length; i++) {
      const step = inputSteps[i]!;
      if (typeof step.stepKey !== "string" || step.stepKey.trim().length === 0) {
        issues.push({ field: `steps[${i}].stepKey`, message: "stepKey is required." });
      } else if (seenStepKeys.has(step.stepKey)) {
        issues.push({
          field: `steps[${i}].stepKey`,
          message: `Duplicate stepKey "${step.stepKey}".`,
        });
      } else {
        seenStepKeys.add(step.stepKey);
      }

      if (step.completedOn !== undefined && !isValidISODate(step.completedOn)) {
        issues.push({
          field: `steps[${i}].completedOn`,
          message: "completedOn must be a valid YYYY-MM-DD date.",
        });
      }
    }

    if (issues.length > 0) {
      throw new ItemValidationError(issues);
    }

    const itemId = idGenerator.newId();
    const now = clock.nowIso();

    const statements: SqlStatement[] = [
      {
        sql: `INSERT INTO item (
                id, title, role, channel, workflow_id, start_date,
                outcome, notes, archived_at, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)`,
        params: [
          itemId,
          title,
          input.role ?? null,
          input.channel ?? null,
          input.workflowId,
          input.startDate,
          input.notes ?? null,
          now,
          now,
        ],
      },
    ];

    const storedContacts: StoredContact[] = [];
    for (const c of inputContacts) {
      const contactId = idGenerator.newId();
      const contactName = c.name.trim();
      statements.push({
        sql: `INSERT INTO contact (id, item_id, name, profile_url, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        params: [contactId, itemId, contactName, c.profileUrl ?? null, c.status, now],
      });
      const storedContact: StoredContact = {
        id: contactId,
        name: contactName,
        status: c.status,
      };
      if (c.profileUrl !== undefined) {
        storedContact.profileUrl = c.profileUrl;
      }
      storedContacts.push(storedContact);
    }

    const storedSteps: StepRecord[] = [];
    for (const s of inputSteps) {
      const skippedFlag = s.skipped === true ? 1 : 0;
      statements.push({
        sql: `INSERT INTO step_record (item_id, step_key, completed_on, skipped)
              VALUES (?, ?, ?, ?)`,
        params: [itemId, s.stepKey, s.completedOn ?? null, skippedFlag],
      });
      const storedStep: StepRecord = { stepKey: s.stepKey };
      if (s.completedOn !== undefined) {
        storedStep.completedOn = s.completedOn;
      }
      if (skippedFlag === 1) {
        storedStep.skipped = true;
      }
      storedSteps.push(storedStep);
    }

    await executor.batch(statements);

    // Match SQLite ORDER BY step_key ASC returned by get() / list()
    storedSteps.sort((a, b) => (a.stepKey < b.stepKey ? -1 : a.stepKey > b.stepKey ? 1 : 0));

    const item: StoredItem = {
      id: itemId,
      title,
      workflowId: input.workflowId,
      startDate: input.startDate,
      contacts: storedContacts,
      steps: storedSteps,
      createdAt: now,
      updatedAt: now,
    };
    if (input.role !== undefined) {
      item.role = input.role;
    }
    if (input.channel !== undefined) {
      item.channel = input.channel;
    }
    if (input.notes !== undefined) {
      item.notes = input.notes;
    }
    return item;
  }

  async function get(id: string): Promise<StoredItem | null> {
    const itemRows = await executor.select<ItemRow>(
      `SELECT id, title, role, channel, workflow_id, start_date,
              outcome, notes, archived_at, created_at, updated_at
       FROM item WHERE id = ?`,
      [id],
    );
    const row = itemRows[0];
    if (!row) {
      return null;
    }

    const contactRows = await executor.select<ContactRow>(
      `SELECT id, item_id, name, profile_url, status
       FROM contact WHERE item_id = ?
       ORDER BY created_at ASC, rowid ASC`,
      [id],
    );
    const stepRows = await executor.select<StepRecordRow>(
      `SELECT item_id, step_key, completed_on, skipped
       FROM step_record WHERE item_id = ?
       ORDER BY step_key ASC`,
      [id],
    );

    return mapItemRow(row, contactRows.map(mapContactRow), stepRows.map(mapStepRow));
  }

  async function list(options: ListItemsOptions = {}): Promise<StoredItem[]> {
    const includeArchived = options.includeArchived ?? false;

    const itemRows = await executor.select<ItemRow>(
      includeArchived
        ? `SELECT id, title, role, channel, workflow_id, start_date,
                  outcome, notes, archived_at, created_at, updated_at
           FROM item
           ORDER BY created_at DESC, rowid DESC`
        : `SELECT id, title, role, channel, workflow_id, start_date,
                  outcome, notes, archived_at, created_at, updated_at
           FROM item
           WHERE archived_at IS NULL
           ORDER BY created_at DESC, rowid DESC`,
    );

    if (itemRows.length === 0) {
      return [];
    }

    const contactRows = await executor.select<ContactRow>(
      includeArchived
        ? `SELECT id, item_id, name, profile_url, status
           FROM contact
           ORDER BY created_at ASC, rowid ASC`
        : `SELECT c.id, c.item_id, c.name, c.profile_url, c.status
           FROM contact c
           INNER JOIN item i ON i.id = c.item_id
           WHERE i.archived_at IS NULL
           ORDER BY c.created_at ASC, c.rowid ASC`,
    );

    const stepRows = await executor.select<StepRecordRow>(
      includeArchived
        ? `SELECT item_id, step_key, completed_on, skipped
           FROM step_record
           ORDER BY step_key ASC`
        : `SELECT s.item_id, s.step_key, s.completed_on, s.skipped
           FROM step_record s
           INNER JOIN item i ON i.id = s.item_id
           WHERE i.archived_at IS NULL
           ORDER BY s.step_key ASC`,
    );

    const contactsByItem = new Map<string, StoredContact[]>();
    for (const c of contactRows) {
      const listForItem = contactsByItem.get(c.item_id);
      const mapped = mapContactRow(c);
      if (listForItem) {
        listForItem.push(mapped);
      } else {
        contactsByItem.set(c.item_id, [mapped]);
      }
    }

    const stepsByItem = new Map<string, StepRecord[]>();
    for (const s of stepRows) {
      const listForItem = stepsByItem.get(s.item_id);
      const mapped = mapStepRow(s);
      if (listForItem) {
        listForItem.push(mapped);
      } else {
        stepsByItem.set(s.item_id, [mapped]);
      }
    }

    return itemRows.map((row) =>
      mapItemRow(row, contactsByItem.get(row.id) ?? [], stepsByItem.get(row.id) ?? []),
    );
  }

  async function update(id: string, patch: UpdateItemPatch): Promise<StoredItem> {
    const issues: FieldValidationIssue[] = [];
    const setClauses: string[] = [];
    const params: SqlValue[] = [];

    if (patch.title !== undefined) {
      const trimmed = validateTitle(patch.title, issues);
      setClauses.push("title = ?");
      params.push(trimmed);
    }

    if (patch.role !== undefined) {
      validateOptionalText(patch.role, "role", MAX_SHORT_TEXT, issues);
      setClauses.push("role = ?");
      params.push(patch.role);
    }

    if (patch.channel !== undefined) {
      validateOptionalText(patch.channel, "channel", MAX_SHORT_TEXT, issues);
      setClauses.push("channel = ?");
      params.push(patch.channel);
    }

    if (patch.notes !== undefined) {
      validateOptionalText(patch.notes, "notes", MAX_NOTES, issues);
      setClauses.push("notes = ?");
      params.push(patch.notes);
    }

    if (patch.startDate !== undefined) {
      if (typeof patch.startDate !== "string" || !isValidISODate(patch.startDate)) {
        issues.push({ field: "startDate", message: "startDate must be a valid YYYY-MM-DD date." });
      }
      setClauses.push("start_date = ?");
      params.push(patch.startDate);
    }

    if (patch.workflowId !== undefined) {
      if (typeof patch.workflowId !== "string" || patch.workflowId.trim().length === 0) {
        issues.push({ field: "workflowId", message: "workflowId is required." });
      } else {
        const workflow = await workflowRepo.get(patch.workflowId);
        if (!workflow) {
          issues.push({
            field: "workflowId",
            message: `Unknown workflow "${patch.workflowId}".`,
          });
        }
      }
      setClauses.push("workflow_id = ?");
      params.push(patch.workflowId);
    }

    if (issues.length > 0) {
      throw new ItemValidationError(issues);
    }

    if (setClauses.length === 0) {
      const existing = await get(id);
      if (!existing) {
        throw new ItemNotFoundError(id);
      }
      return existing;
    }

    setClauses.push("updated_at = ?");
    params.push(clock.nowIso());
    params.push(id);

    const results = await executor.batch([
      {
        sql: `UPDATE item SET ${setClauses.join(", ")} WHERE id = ?`,
        params,
      },
    ]);

    if ((results[0]?.rowsAffected ?? 0) === 0) {
      throw new ItemNotFoundError(id);
    }

    const updated = await get(id);
    if (!updated) {
      throw new ItemNotFoundError(id);
    }
    return updated;
  }

  async function archive(id: string): Promise<void> {
    const now = clock.nowIso();
    const results = await executor.batch([
      {
        sql: `UPDATE item
              SET archived_at = COALESCE(archived_at, ?),
                  updated_at = CASE WHEN archived_at IS NULL THEN ? ELSE updated_at END
              WHERE id = ?`,
        params: [now, now, id],
      },
    ]);

    if ((results[0]?.rowsAffected ?? 0) === 0) {
      throw new ItemNotFoundError(id);
    }
  }

  async function unarchive(id: string): Promise<void> {
    const now = clock.nowIso();
    const results = await executor.batch([
      {
        sql: `UPDATE item
              SET archived_at = NULL,
                  updated_at = CASE WHEN archived_at IS NOT NULL THEN ? ELSE updated_at END
              WHERE id = ?`,
        params: [now, id],
      },
    ]);

    if ((results[0]?.rowsAffected ?? 0) === 0) {
      throw new ItemNotFoundError(id);
    }
  }

  async function remove(id: string): Promise<void> {
    const results = await executor.batch([
      {
        sql: "DELETE FROM item WHERE id = ?",
        params: [id],
      },
    ]);

    if ((results[0]?.rowsAffected ?? 0) === 0) {
      throw new ItemNotFoundError(id);
    }
  }

  return {
    create,
    get,
    list,
    update,
    archive,
    unarchive,
    delete: remove,
  };
}
