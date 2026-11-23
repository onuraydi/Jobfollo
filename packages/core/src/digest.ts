import { isValidISODate } from "./date.js";
import { computeNextStep } from "./next-step.js";
import type {
  BuildDigestOptions,
  Digest,
  DigestRow,
  ISODate,
  Item,
  Workflow,
} from "./types.js";

function compareDigestRows(a: DigestRow, b: DigestRow): number {
  if (a.daysLeft !== b.daysLeft) {
    return a.daysLeft - b.daysLeft;
  }
  const titleOrder = a.itemTitle.localeCompare(b.itemTitle, "en", {
    sensitivity: "base",
  });
  if (titleOrder !== 0) {
    return titleOrder;
  }
  return a.itemId.localeCompare(b.itemId, "en");
}

export function buildDigest(
  items: readonly Item[],
  workflows: readonly Workflow[],
  today: ISODate,
  opts: BuildDigestOptions = {},
): Digest {
  if (!isValidISODate(today)) {
    throw new RangeError(`Invalid today ISO date: "${today}"`);
  }

  const upcomingDays = opts.upcomingDays ?? 0;
  if (
    typeof upcomingDays !== "number" ||
    !Number.isInteger(upcomingDays) ||
    upcomingDays < 0
  ) {
    throw new RangeError(
      `upcomingDays must be a non-negative integer, got: ${String(upcomingDays)}`,
    );
  }

  const workflowsById = new Map<string, Workflow>();
  for (const workflow of workflows) {
    workflowsById.set(workflow.id, workflow);
  }

  const overdue: DigestRow[] = [];
  const dueToday: DigestRow[] = [];
  const upcoming: DigestRow[] = [];

  for (const item of items) {
    const workflow = workflowsById.get(item.workflowId);
    if (!workflow) {
      throw new Error(`Unknown workflow "${item.workflowId}" for item "${item.id}"`);
    }

    const next = computeNextStep(item, workflow, today);
    if (next === null) {
      continue;
    }

    const row: DigestRow = {
      itemId: item.id,
      itemTitle: item.title,
      stepKey: next.stepKey,
      stepTitle: next.title,
      dueDate: next.dueDate,
      daysLeft: next.daysLeft,
    };
    if (next.suggestsOutcome !== undefined) {
      row.suggestsOutcome = next.suggestsOutcome;
    }

    if (row.daysLeft < 0) {
      overdue.push(row);
    } else if (row.daysLeft === 0) {
      dueToday.push(row);
    } else if (row.daysLeft <= upcomingDays) {
      upcoming.push(row);
    }
  }

  overdue.sort(compareDigestRows);
  dueToday.sort(compareDigestRows);
  upcoming.sort(compareDigestRows);

  return {
    date: today,
    overdue,
    today: dueToday,
    upcoming,
    isEmpty: overdue.length === 0 && dueToday.length === 0 && upcoming.length === 0,
  };
}
