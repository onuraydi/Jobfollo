/** Local calendar date, `YYYY-MM-DD`. */
export type ISODate = string;

export type ContactStatus = "pending" | "accepted" | "not_accepted";

/** `start` = the item's start date; `step:<key>` = completion date of that step. */
export type Anchor = "start" | `step:${string}`;

export interface WorkflowStep {
  key: string;
  title: string;
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

export interface NextStep {
  stepKey: string;
  title: string;
  dueDate: ISODate;
  /** Negative when overdue, 0 when due today. */
  daysLeft: number;
}
