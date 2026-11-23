import type { Contact, ContactStatus } from "@jobfollo/core";
import type { FieldValidationIssue } from "./types.js";

export const MAX_SHORT_TEXT = 200;
export const MAX_NOTES = 20_000;

export const VALID_CONTACT_STATUSES: ReadonlySet<string> = new Set<ContactStatus>([
  "pending",
  "accepted",
  "not_accepted",
]);

export const OUTCOME_ID_RE = /^[a-z][a-z0-9_]{0,31}$/;

export function isValidProfileUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateTitle(title: unknown, issues: FieldValidationIssue[]): string {
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

export function validateOptionalText(
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

export function validateContactName(
  name: unknown,
  field: string,
  issues: FieldValidationIssue[],
): string {
  if (typeof name !== "string" || name.trim().length === 0) {
    issues.push({ field, message: "Contact name is required." });
    return "";
  }
  const trimmed = name.trim();
  if (trimmed.length > MAX_SHORT_TEXT) {
    issues.push({
      field,
      message: `Contact name must be at most ${MAX_SHORT_TEXT} characters.`,
    });
  }
  return trimmed;
}

export function validateContactStatus(
  status: unknown,
  field: string,
  issues: FieldValidationIssue[],
): void {
  if (typeof status !== "string" || !VALID_CONTACT_STATUSES.has(status)) {
    issues.push({
      field,
      message: `Invalid contact status "${String(status)}".`,
    });
  }
}

export function validateProfileUrl(
  profileUrl: unknown,
  field: string,
  issues: FieldValidationIssue[],
): void {
  if (profileUrl === undefined || profileUrl === null) {
    return;
  }
  if (typeof profileUrl !== "string" || !isValidProfileUrl(profileUrl)) {
    issues.push({
      field,
      message: "Profile URL must be an absolute http:// or https:// URL.",
    });
  }
}

export function validateContactFields(
  contact: Contact,
  prefix: string,
  issues: FieldValidationIssue[],
): void {
  validateContactName(contact.name, `${prefix}.name`, issues);
  validateContactStatus(contact.status, `${prefix}.status`, issues);
  validateProfileUrl(contact.profileUrl, `${prefix}.profileUrl`, issues);
}

export function validateOutcome(outcome: unknown, issues: FieldValidationIssue[]): void {
  if (outcome === null) {
    return;
  }
  if (typeof outcome !== "string" || !OUTCOME_ID_RE.test(outcome)) {
    issues.push({
      field: "outcome",
      message: "Outcome must match ^[a-z][a-z0-9_]{0,31}$ or be null.",
    });
  }
}
