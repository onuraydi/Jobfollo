import type { ContactStatus, ValidationError, Workflow, WorkflowStep } from "./types.js";

const VALID_CONTACT_STATUSES: ReadonlySet<string> = new Set<ContactStatus>([
  "pending",
  "accepted",
  "not_accepted",
]);

const STEP_ANCHOR_PREFIX = "step:";
const LOCALE_KEY_RE = /^[a-z]{2}$/;
const MAX_LOCALIZED_TEXT_LENGTH = 200;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function validateLocalizedMap(
  map: unknown,
  fieldLabel: string,
  stepKey: string | undefined,
  errors: ValidationError[],
): void {
  if (!isPlainObject(map)) {
    errors.push({
      code: "invalid_localized_text",
      ...(stepKey !== undefined ? { stepKey } : {}),
      message: `${fieldLabel} must be a plain object mapping locale codes to strings.`,
    });
    return;
  }

  for (const [locale, value] of Object.entries(map)) {
    if (!LOCALE_KEY_RE.test(locale)) {
      errors.push({
        code: "invalid_localized_text",
        ...(stepKey !== undefined ? { stepKey } : {}),
        locale,
        message: `${fieldLabel} has invalid locale key "${locale}". Expected two lowercase ASCII letters.`,
      });
      continue;
    }

    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push({
        code: "invalid_localized_text",
        ...(stepKey !== undefined ? { stepKey } : {}),
        locale,
        message: `${fieldLabel}.${locale} must be a non-empty string.`,
      });
      continue;
    }

    if (value.includes("\r") || value.includes("\n")) {
      errors.push({
        code: "invalid_localized_text",
        ...(stepKey !== undefined ? { stepKey } : {}),
        locale,
        message: `${fieldLabel}.${locale} must be a single line (no CR/LF).`,
      });
      continue;
    }

    if (value.length > MAX_LOCALIZED_TEXT_LENGTH) {
      errors.push({
        code: "invalid_localized_text",
        ...(stepKey !== undefined ? { stepKey } : {}),
        locale,
        message: `${fieldLabel}.${locale} must be at most ${MAX_LOCALIZED_TEXT_LENGTH} characters.`,
      });
    }
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidRunIf(runIf: unknown): boolean {
  if (typeof runIf !== "object" || runIf === null || Array.isArray(runIf)) {
    return false;
  }
  const keys = Object.keys(runIf);
  if (keys.length !== 1 || keys[0] !== "contactStatus") {
    return false;
  }
  const value = (runIf as Record<string, unknown>)["contactStatus"];
  return typeof value === "string" && VALID_CONTACT_STATUSES.has(value);
}

function parseStepAnchorTarget(anchor: unknown): { valid: boolean; targetKey?: string } {
  if (anchor === "start") {
    return { valid: true };
  }
  if (typeof anchor !== "string" || !anchor.startsWith(STEP_ANCHOR_PREFIX)) {
    return { valid: false };
  }
  const targetKey = anchor.slice(STEP_ANCHOR_PREFIX.length);
  if (targetKey.trim().length === 0) {
    return { valid: false };
  }
  return { valid: true, targetKey };
}

function validateStepFields(
  step: WorkflowStep,
  existingKeys: ReadonlySet<string>,
  errors: ValidationError[],
): void {
  const stepKey = isNonEmptyString(step.key) ? step.key : undefined;

  if (!isNonEmptyString(step.title)) {
    errors.push({
      code: "empty_step_title",
      ...(stepKey !== undefined ? { stepKey } : {}),
      message: "Step title must be a non-empty string.",
    });
  }

  const anchorResult = parseStepAnchorTarget(step.anchor);
  if (!anchorResult.valid) {
    errors.push({
      code: "invalid_anchor",
      ...(stepKey !== undefined ? { stepKey } : {}),
      message: `Invalid anchor "${String(step.anchor)}". Expected "start" or "step:<key>".`,
    });
  } else if (
    anchorResult.targetKey !== undefined &&
    !existingKeys.has(anchorResult.targetKey)
  ) {
    errors.push({
      code: "unknown_anchor_step",
      ...(stepKey !== undefined ? { stepKey } : {}),
      message: `Anchor references unknown step "${anchorResult.targetKey}".`,
    });
  }

  if (
    typeof step.offsetDays !== "number" ||
    !Number.isInteger(step.offsetDays) ||
    step.offsetDays < 0
  ) {
    errors.push({
      code: "invalid_offset_days",
      ...(stepKey !== undefined ? { stepKey } : {}),
      message: `offsetDays must be a non-negative integer, got ${String(step.offsetDays)}.`,
    });
  }

  if (step.runIf !== undefined && !isValidRunIf(step.runIf)) {
    errors.push({
      code: "invalid_run_if",
      ...(stepKey !== undefined ? { stepKey } : {}),
      message: 'runIf must be an object with only "contactStatus" set to a valid status.',
    });
  }

  if (step.records !== undefined && step.records !== "contactStatus") {
    errors.push({
      code: "invalid_records",
      ...(stepKey !== undefined ? { stepKey } : {}),
      message: `Unsupported records value "${String(step.records)}". Expected "contactStatus".`,
    });
  }

  if (step.titles !== undefined) {
    validateLocalizedMap(step.titles, "titles", stepKey, errors);
  }
}

function detectAnchorCycles(
  anchorTargetByKey: ReadonlyMap<string, string>,
  errors: ValidationError[],
): void {
  const visited = new Set<string>();

  for (const startKey of anchorTargetByKey.keys()) {
    if (visited.has(startKey)) {
      continue;
    }

    const path = new Set<string>();
    let current: string | undefined = startKey;

    while (current !== undefined && !visited.has(current)) {
      if (path.has(current)) {
        errors.push({
          code: "anchor_cycle",
          stepKey: current,
          message: `Anchor cycle detected involving step "${current}".`,
        });
        break;
      }
      path.add(current);
      current = anchorTargetByKey.get(current);
    }

    for (const node of path) {
      visited.add(node);
    }
  }
}

export function validateWorkflow(workflow: Workflow): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isNonEmptyString(workflow.id)) {
    errors.push({
      code: "empty_workflow_id",
      message: "Workflow id must be a non-empty string.",
    });
  }

  if (!isNonEmptyString(workflow.name)) {
    errors.push({
      code: "empty_workflow_name",
      message: "Workflow name must be a non-empty string.",
    });
  }

  if (workflow.names !== undefined) {
    validateLocalizedMap(workflow.names, "names", undefined, errors);
  }

  const seenKeys = new Set<string>();
  for (const step of workflow.steps) {
    if (!isNonEmptyString(step.key)) {
      errors.push({
        code: "empty_step_key",
        message: "Step key must be a non-empty string.",
      });
    } else if (seenKeys.has(step.key)) {
      errors.push({
        code: "duplicate_step_key",
        stepKey: step.key,
        message: `Duplicate step key "${step.key}".`,
      });
    } else {
      seenKeys.add(step.key);
    }
  }

  const anchorTargetByKey = new Map<string, string>();
  for (const step of workflow.steps) {
    validateStepFields(step, seenKeys, errors);

    if (isNonEmptyString(step.key) && !anchorTargetByKey.has(step.key)) {
      const anchorResult = parseStepAnchorTarget(step.anchor);
      if (
        anchorResult.valid &&
        anchorResult.targetKey !== undefined &&
        seenKeys.has(anchorResult.targetKey)
      ) {
        anchorTargetByKey.set(step.key, anchorResult.targetKey);
      }
    }
  }

  detectAnchorCycles(anchorTargetByKey, errors);

  return errors;
}
