/** Local calendar date, `YYYY-MM-DD`. */
export type ISODate = string;

export type Locale = "tr" | "en";

export type LocalizedText = Partial<Record<Locale, string>>;

export type ContactStatus = "pending" | "accepted" | "not_accepted";

/** `start` = the item's start date; `step:<key>` = completion date of that step. */
export type Anchor = "start" | `step:${string}`;

export interface WorkflowStep {
  key: string;
  title: string;
  titles?: LocalizedText;
  anchor: Anchor;
  offsetDays: number;
  /** The user records the contact status when completing this step. */
  records?: "contactStatus";
  /** Step is skipped unless the item's contact status matches. */
  runIf?: { contactStatus: ContactStatus };
  /** When this step is reached, the app suggests marking this outcome. */
  suggestsOutcome?: string;
}

export interface Workflow {
  id: string;
  name: string;
  names?: LocalizedText;
  steps: WorkflowStep[];
  /** Outcomes that stop all pending steps. */
  stopOutcomes: string[];
}

export interface Contact {
  name: string;
  profileUrl?: string;
  status: ContactStatus;
}

export interface StepRecord {
  stepKey: string;
  completedOn?: ISODate;
  skipped?: boolean;
}

export interface Item {
  id: string;
  title: string;
  role?: string;
  channel?: string;
  workflowId: string;
  startDate: ISODate;
  contacts: Contact[];
  steps: StepRecord[];
  outcome?: string;
  notes?: string;
}

export type StepStatus =
  | "done"
  | "skipped"
  | "pending"
  | "overdue"
  | "due_today"
  | "blocked"
  | "stopped";

export interface StepInstance {
  stepKey: string;
  title: string;
  titles?: LocalizedText;
  dueDate?: ISODate;
  completedOn?: ISODate;
  status: StepStatus;
  suggestsOutcome?: string;
}

export interface NextStep {
  stepKey: string;
  title: string;
  titles?: LocalizedText;
  dueDate: ISODate;
  /** Negative when overdue, 0 when due today. */
  daysLeft: number;
  suggestsOutcome?: string;
}

export interface DigestRow {
  itemId: string;
  itemTitle: string;
  stepKey: string;
  stepTitle: string;
  stepTitles?: LocalizedText;
  dueDate: ISODate;
  /** Negative when overdue, 0 when due today, positive when upcoming. */
  daysLeft: number;
  suggestsOutcome?: string;
}

export interface BuildDigestOptions {
  /** Include steps due in the next N days (1..upcomingDays). Default: 0. */
  upcomingDays?: number;
}

export interface Digest {
  date: ISODate;
  overdue: DigestRow[];
  today: DigestRow[];
  upcoming: DigestRow[];
  isEmpty: boolean;
}

export interface RenderedDigest {
  subject: string;
  text: string;
  html: string;
}

/** Local wall-clock time in 24-hour `HH:MM` format (`00:00`..`23:59`). */
export type TimeOfDay = string;

export interface ShouldSendDigestInput {
  /** Whether daily email reminders are enabled in settings. */
  enabled: boolean;
  /** Today's local calendar date (`YYYY-MM-DD`). */
  today: ISODate;
  /** Current local wall-clock time (`HH:MM`). */
  nowTime: TimeOfDay;
  /** Configured daily send time (`HH:MM`). */
  sendTime: TimeOfDay;
  /** Whether a digest has already been successfully sent for `today`. */
  alreadySentToday: boolean;
  /** Number of failed send attempts already recorded for `today`. */
  failureCountToday: number;
  /** Maximum attempts allowed per day (default: 3). */
  maxAttemptsPerDay?: number;
  /** The digest computed for `today` (or its `isEmpty` flag). */
  digest: Pick<Digest, "isEmpty">;
  /** Whether to send an email even when the digest is empty (default: false). */
  sendIfEmpty?: boolean;
}

export type DigestSkipReason =
  | "disabled"
  | "invalid_date"
  | "invalid_time"
  | "already_sent"
  | "max_attempts_reached"
  | "before_send_time"
  | "empty_digest";

export type ShouldSendDigestResult =
  | { send: true }
  | { send: false; reason: DigestSkipReason };

export type ValidationErrorCode =
  | "empty_workflow_id"
  | "empty_workflow_name"
  | "empty_step_key"
  | "empty_step_title"
  | "duplicate_step_key"
  | "invalid_anchor"
  | "unknown_anchor_step"
  | "anchor_cycle"
  | "invalid_offset_days"
  | "invalid_run_if"
  | "invalid_records"
  | "invalid_localized_text";

export interface ValidationError {
  code: ValidationErrorCode;
  stepKey?: string;
  locale?: string;
  message: string;
}
