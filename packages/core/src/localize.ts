import type { Locale, LocalizedText, Workflow, WorkflowStep } from "./types.js";

export function localizedText(
  plain: string,
  map: LocalizedText | undefined,
  locale: Locale,
): string {
  const candidate = map?.[locale];
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate;
  }
  return plain;
}

export function stepTitle(
  step: Pick<WorkflowStep, "title" | "titles">,
  locale: Locale,
): string {
  return localizedText(step.title, step.titles, locale);
}

export function workflowName(
  workflow: Pick<Workflow, "name" | "names">,
  locale: Locale,
): string {
  return localizedText(workflow.name, workflow.names, locale);
}
