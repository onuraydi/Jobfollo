import type { ValidationError } from "@jobfollo/core";
import type { FieldValidationIssue } from "./types.js";

export class CorruptWorkflowError extends Error {
  readonly workflowId: string;
  readonly reason: string;

  constructor(workflowId: string, reason: string) {
    super(`Stored workflow "${workflowId}" is corrupt: ${reason}`);
    this.name = "CorruptWorkflowError";
    this.workflowId = workflowId;
    this.reason = reason;
  }
}

export class InvalidWorkflowError extends Error {
  readonly errors: readonly ValidationError[];

  constructor(errors: readonly ValidationError[]) {
    super(`Invalid workflow: ${errors.map((e) => e.message).join("; ")}`);
    this.name = "InvalidWorkflowError";
    this.errors = errors;
  }
}

export class BuiltInWorkflowError extends Error {
  readonly workflowId: string;

  constructor(workflowId: string, action: "save" | "delete") {
    super(`Cannot ${action} built-in workflow "${workflowId}".`);
    this.name = "BuiltInWorkflowError";
    this.workflowId = workflowId;
  }
}

export class WorkflowInUseError extends Error {
  readonly workflowId: string;

  constructor(workflowId: string) {
    super(`Cannot delete workflow "${workflowId}" because one or more items reference it.`);
    this.name = "WorkflowInUseError";
    this.workflowId = workflowId;
  }
}

export class WorkflowNotFoundError extends Error {
  readonly workflowId: string;

  constructor(workflowId: string) {
    super(`Workflow "${workflowId}" was not found.`);
    this.name = "WorkflowNotFoundError";
    this.workflowId = workflowId;
  }
}

export class ItemNotFoundError extends Error {
  readonly itemId: string;

  constructor(itemId: string) {
    super(`Item "${itemId}" was not found.`);
    this.name = "ItemNotFoundError";
    this.itemId = itemId;
  }
}

export class ItemValidationError extends Error {
  readonly issues: readonly FieldValidationIssue[];

  constructor(issues: readonly FieldValidationIssue[]) {
    super(`Item validation failed: ${issues.map((i) => `${i.field}: ${i.message}`).join("; ")}`);
    this.name = "ItemValidationError";
    this.issues = issues;
  }
}

export class StepNotInWorkflowError extends Error {
  readonly itemId: string;
  readonly workflowId: string;
  readonly stepKey: string;

  constructor(itemId: string, workflowId: string, stepKey: string) {
    super(`Step "${stepKey}" does not exist in workflow "${workflowId}" for item "${itemId}".`);
    this.name = "StepNotInWorkflowError";
    this.itemId = itemId;
    this.workflowId = workflowId;
    this.stepKey = stepKey;
  }
}

export class ContactNotFoundError extends Error {
  readonly itemId: string;
  readonly contactId: string;

  constructor(itemId: string, contactId: string) {
    super(`Contact "${contactId}" was not found on item "${itemId}".`);
    this.name = "ContactNotFoundError";
    this.itemId = itemId;
    this.contactId = contactId;
  }
}

export class UnknownSettingError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`Unknown setting key "${key}".`);
    this.name = "UnknownSettingError";
    this.key = key;
  }
}

export class SettingValidationError extends Error {
  readonly issues: readonly FieldValidationIssue[];

  constructor(issues: readonly FieldValidationIssue[]) {
    super(
      `Setting validation failed: ${issues.map((i) => `${i.field}: ${i.message}`).join("; ")}`,
    );
    this.name = "SettingValidationError";
    this.issues = issues;
  }
}

export class AlreadySentError extends Error {
  readonly date: string;

  constructor(date: string) {
    super(`Digest was already marked as sent on "${date}".`);
    this.name = "AlreadySentError";
    this.date = date;
  }
}
