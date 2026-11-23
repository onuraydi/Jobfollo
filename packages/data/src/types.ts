import type {
  Contact,
  ContactStatus,
  ISODate,
  Item,
  StepRecord,
  Workflow,
} from "@jobfollo/core";

export type SqlValue = string | number | null;

export interface SqlStatement {
  sql: string;
  params?: SqlValue[];
}

export interface SqlBatchResult {
  rowsAffected: number;
}

export interface SqlExecutor {
  select<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Runs all statements in ONE transaction; all or nothing. */
  batch(statements: SqlStatement[]): Promise<SqlBatchResult[]>;
}

/** UTC ISO-8601 timestamp provider for created_at / updated_at columns. */
export interface Clock {
  nowIso(): string;
}

export interface IdGenerator {
  newId(): string;
}

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export interface MigrationRunResult {
  applied: number[];
  currentVersion: number;
}

export type WorkflowKind = "builtin" | "custom";

export interface WorkflowListEntry {
  workflow: Workflow;
  kind: WorkflowKind;
}

export interface InvalidStoredWorkflow {
  id: string;
  reason: string;
}

export interface CustomWorkflowListResult {
  workflows: Workflow[];
  invalid: InvalidStoredWorkflow[];
}

export interface WorkflowRepository {
  listAll(): Promise<WorkflowListEntry[]>;
  listCustom(): Promise<CustomWorkflowListResult>;
  get(id: string): Promise<Workflow | null>;
  save(workflow: Workflow): Promise<Workflow>;
  duplicate(sourceId: string, name: string): Promise<Workflow>;
  delete(id: string): Promise<boolean>;
}

export interface StoredContact extends Contact {
  id: string;
}

export interface StoredItem extends Item {
  contacts: StoredContact[];
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemInput {
  title: string;
  role?: string;
  channel?: string;
  workflowId: string;
  startDate: ISODate;
  notes?: string;
  contacts?: Contact[];
  steps?: StepRecord[];
}

export interface UpdateItemPatch {
  title?: string;
  role?: string | null;
  channel?: string | null;
  workflowId?: string;
  startDate?: ISODate;
  notes?: string | null;
}

export interface ListItemsOptions {
  includeArchived?: boolean;
}

export interface FieldValidationIssue {
  field: string;
  message: string;
}

export interface ContactStatusUpdate {
  contactId: string;
  status: ContactStatus;
}

export interface CompleteStepOptions {
  contactStatuses?: ContactStatusUpdate[];
}

export interface AddContactInput {
  name: string;
  profileUrl?: string;
  status?: ContactStatus;
}

export interface UpdateContactPatch {
  name?: string;
  profileUrl?: string | null;
  status?: ContactStatus;
}

export interface ItemRepository {
  create(input: CreateItemInput): Promise<StoredItem>;
  get(id: string): Promise<StoredItem | null>;
  list(options?: ListItemsOptions): Promise<StoredItem[]>;
  update(id: string, patch: UpdateItemPatch): Promise<StoredItem>;
  archive(id: string): Promise<void>;
  unarchive(id: string): Promise<void>;
  delete(id: string): Promise<void>;
  completeStep(
    itemId: string,
    stepKey: string,
    completedOn: ISODate,
    options?: CompleteStepOptions,
  ): Promise<void>;
  skipStep(itemId: string, stepKey: string): Promise<void>;
  undoStep(itemId: string, stepKey: string): Promise<boolean>;
  setOutcome(itemId: string, outcome: string | null): Promise<void>;
  addContact(itemId: string, input: AddContactInput): Promise<StoredContact>;
  updateContact(itemId: string, contactId: string, patch: UpdateContactPatch): Promise<void>;
  removeContact(itemId: string, contactId: string): Promise<boolean>;
}

export type ReminderLogStatus = "sent" | "failed";

export interface ReminderLogEntry {
  date: ISODate;
  status: ReminderLogStatus;
  attempt: number;
  createdAt: string;
  error?: string;
}

export interface ReminderLogRepository {
  recordSent(date: ISODate, attempt?: number): Promise<void>;
  recordFailure(date: ISODate, error: string, attempt: number): Promise<void>;
  wasSentOn(date: ISODate): Promise<boolean>;
  lastSentDate(): Promise<ISODate | null>;
  failureCountOn(date: ISODate): Promise<number>;
  recent(limit?: number): Promise<ReminderLogEntry[]>;
}
