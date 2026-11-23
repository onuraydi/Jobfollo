import type { ValidationError } from "@jobfollo/core";

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
