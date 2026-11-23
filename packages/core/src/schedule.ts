import { addDays, diffDays, isValidISODate } from "./date.js";
import type {
  ISODate,
  Item,
  StepInstance,
  StepRecord,
  StepStatus,
  Workflow,
  WorkflowStep,
} from "./types.js";

const STEP_ANCHOR_PREFIX = "step:";

function resolveAnchorDate(
  step: WorkflowStep,
  item: Item,
  recordsByKey: ReadonlyMap<string, StepRecord>,
): ISODate | undefined {
  if (step.anchor === "start") {
    return item.startDate;
  }
  if (step.anchor.startsWith(STEP_ANCHOR_PREFIX)) {
    const anchorKey = step.anchor.slice(STEP_ANCHOR_PREFIX.length);
    return recordsByKey.get(anchorKey)?.completedOn;
  }
  return undefined;
}

function isRunIfSatisfied(step: WorkflowStep, item: Item): boolean {
  if (!step.runIf) {
    return true;
  }
  const requiredStatus = step.runIf.contactStatus;
  return item.contacts.some((contact) => contact.status === requiredStatus);
}

function classifyDueDate(dueDate: ISODate, today: ISODate): StepStatus {
  const daysLeft = diffDays(today, dueDate);
  if (daysLeft < 0) {
    return "overdue";
  }
  if (daysLeft === 0) {
    return "due_today";
  }
  return "pending";
}

export function computeSchedule(
  item: Item,
  workflow: Workflow,
  today: ISODate,
): StepInstance[] {
  if (!isValidISODate(today)) {
    throw new RangeError(`Invalid today ISO date: "${today}"`);
  }
  if (!isValidISODate(item.startDate)) {
    throw new RangeError(`Invalid item.startDate ISO date: "${item.startDate}"`);
  }

  const recordsByKey = new Map<string, StepRecord>();
  for (const record of item.steps) {
    if (record.completedOn !== undefined && !isValidISODate(record.completedOn)) {
      throw new RangeError(
        `Invalid completedOn ISO date for step "${record.stepKey}": "${record.completedOn}"`,
      );
    }
    recordsByKey.set(record.stepKey, record);
  }

  return workflow.steps.map((step): StepInstance => {
    const record = recordsByKey.get(step.key);
    const anchorDate = resolveAnchorDate(step, item, recordsByKey);
    const dueDate = anchorDate !== undefined ? addDays(anchorDate, step.offsetDays) : undefined;

    let status: StepStatus;
    if (record?.completedOn !== undefined) {
      status = "done";
    } else if (record?.skipped) {
      status = "skipped";
    } else if (dueDate === undefined) {
      status = "blocked";
    } else if (!isRunIfSatisfied(step, item)) {
      status = "skipped";
    } else {
      status = classifyDueDate(dueDate, today);
    }

    const instance: StepInstance = {
      stepKey: step.key,
      title: step.title,
      status,
    };
    if (dueDate !== undefined) {
      instance.dueDate = dueDate;
    }
    if (record?.completedOn !== undefined) {
      instance.completedOn = record.completedOn;
    }
    if (step.suggestsOutcome !== undefined) {
      instance.suggestsOutcome = step.suggestsOutcome;
    }
    return instance;
  });
}
