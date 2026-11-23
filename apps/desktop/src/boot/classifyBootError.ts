import {
  DatabaseNewerThanAppError,
  InvalidMigrationSetError,
  MigrationChecksumMismatchError,
  MigrationFailedError,
} from "@jobfollo/data";
import { SqlExecutionError } from "../db/index.js";
import type { BootError } from "./types.js";

function formatTechnicalDetails(err: unknown): string {
  if (err instanceof Error) {
    const parts = [`${err.name}: ${err.message}`];
    if (err instanceof SqlExecutionError) {
      parts.push(`kind=${err.kind}`);
    }
    if ("cause" in err && err.cause !== undefined) {
      parts.push(`cause: ${formatTechnicalDetails(err.cause)}`);
    }
    return parts.join(" | ");
  }
  if (typeof err === "string") {
    return err;
  }
  return `Non-Error thrown (${typeof err})`;
}

function classifySqlError(err: SqlExecutionError, technicalDetails: string): BootError {
  switch (err.kind) {
    case "open":
      return { kind: "open_failed", technicalDetails };
    case "busy":
      return { kind: "database_busy", technicalDetails };
    case "io":
      return { kind: "database_io", technicalDetails };
    case "constraint":
    case "sql":
    case "invalid_argument":
    case "forbidden":
    case "limit":
    case "ipc":
      return { kind: "unknown", technicalDetails };
  }
}

export function classifyBootError(err: unknown): BootError {
  const technicalDetails = formatTechnicalDetails(err);

  if (err instanceof DatabaseNewerThanAppError) {
    return {
      kind: "database_newer",
      dbVersion: err.dbVersion,
      appVersion: err.appVersion,
      technicalDetails,
    };
  }

  if (err instanceof MigrationChecksumMismatchError) {
    return {
      kind: "migration_checksum",
      version: err.version,
      migrationName: err.migrationName,
      technicalDetails,
    };
  }

  if (err instanceof InvalidMigrationSetError) {
    return { kind: "migration_invalid", technicalDetails };
  }

  if (err instanceof MigrationFailedError) {
    if (err.cause instanceof SqlExecutionError) {
      if (
        err.cause.kind === "open" ||
        err.cause.kind === "busy" ||
        err.cause.kind === "io"
      ) {
        return classifySqlError(err.cause, technicalDetails);
      }
    }
    return { kind: "migration_failed", technicalDetails };
  }

  if (err instanceof SqlExecutionError) {
    return classifySqlError(err, technicalDetails);
  }

  return { kind: "unknown", technicalDetails };
}
