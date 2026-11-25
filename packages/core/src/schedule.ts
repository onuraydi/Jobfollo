import { addDays, adjustForWeekend, diffDays, isValidISODate } from "./date.js";
import type {
  ISODate,
  Item,
  ScheduleOptions,
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
  options: ScheduleOptions = {},
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
    if (record.snoozedUntil !== undefined && !isValidISODate(record.snoozedUntil)) {
      throw new RangeError(
        `Invalid snoozedUntil ISO date for step "${record.stepKey}": "${record.snoozedUntil}"`,
      );
    }
    recordsByKey.set(record.stepKey, record);
  }

  const isStopped =
    item.outcome !== undefined && workflow.stopOutcomes.includes(item.outcome);

  return workflow.steps.map((step): StepInstance => {
    const record = recordsByKey.get(step.key);
    const anchorDate = resolveAnchorDate(step, item, recordsByKey);
    let dueDate = anchorDate !== undefined ? addDays(anchorDate, step.offsetDays) : undefined;
    if (dueDate !== undefined && options.skipWeekends) {
      dueDate = adjustForWeekend(dueDate);
    }
    if (
      dueDate !== undefined &&
      record?.snoozedUntil !== undefined &&
      diffDays(dueDate, record.snoozedUntil) > 0
    ) {
      dueDate = record.snoozedUntil;
    }

    let status: StepStatus;
    if (record?.completedOn !== undefined) {
      status = "done";
    } else if (record?.skipped) {
      status = "skipped";
    } else if (dueDate !== undefined && !isRunIfSatisfied(step, item)) {
      status = "skipped";
    } else if (isStopped) {
      status = "stopped";
    } else if (dueDate === undefined) {
      status = "blocked";
    } else {
      status = classifyDueDate(dueDate, today);
    }

    const instance: StepInstance = {
      stepKey: step.key,
      title: step.title,
      status,
    };
    if (step.titles !== undefined) {
      instance.titles = { ...step.titles };
    }
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
