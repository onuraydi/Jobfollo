import { diffDays } from "./date.js";
import { computeSchedule } from "./schedule.js";
import type { ISODate, Item, NextStep, StepInstance, Workflow } from "./types.js";

function isActionable(
  instance: StepInstance,
): instance is StepInstance & { dueDate: ISODate } {
  return (
    (instance.status === "overdue" ||
      instance.status === "due_today" ||
      instance.status === "pending") &&
    instance.dueDate !== undefined
  );
}

export function computeNextStep(
  item: Item,
  workflow: Workflow,
  today: ISODate,
): NextStep | null {
  const schedule = computeSchedule(item, workflow, today);

  let earliest: (StepInstance & { dueDate: ISODate }) | undefined;
  for (const instance of schedule) {
    if (!isActionable(instance)) {
      continue;
    }
    if (earliest === undefined || diffDays(earliest.dueDate, instance.dueDate) < 0) {
      earliest = instance;
    }
  }

  if (earliest === undefined) {
    return null;
  }

  const nextStep: NextStep = {
    stepKey: earliest.stepKey,
    title: earliest.title,
    dueDate: earliest.dueDate,
    daysLeft: diffDays(today, earliest.dueDate),
  };
  if (earliest.titles !== undefined) {
    nextStep.titles = { ...earliest.titles };
  }
  if (earliest.suggestsOutcome !== undefined) {
    nextStep.suggestsOutcome = earliest.suggestsOutcome;
  }
  return nextStep;
}
