import type { SqlBatchResult, SqlExecutor, SqlStatement, SqlValue } from "@jobfollo/data";
import { SqlExecutionError, mapInvokeError } from "./errors.js";
import type { InvokeFn } from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function validateParam(value: unknown, paramIndex: number, statementIndex?: number): SqlValue {
  const location =
    statementIndex !== undefined
      ? `Statement ${statementIndex}, parameter ${paramIndex}`
      : `Parameter ${paramIndex}`;

  if (value === null || typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new SqlExecutionError("invalid_argument", `${location} must be a finite number`);
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new SqlExecutionError(
        "invalid_argument",
        `${location} is an integer outside the safe range`,
      );
    }
    return value;
  }

  throw new SqlExecutionError(
    "invalid_argument",
    `${location} has unsupported type (${typeof value})`,
  );
}

function validateParams(params: readonly unknown[] | undefined, statementIndex?: number): SqlValue[] {
  if (params === undefined) {
    return [];
  }
  if (!Array.isArray(params)) {
    throw new SqlExecutionError("invalid_argument", "Parameters must be an array");
  }
  return params.map((value, idx) => validateParam(value, idx, statementIndex));
}

function validateSelectResponse<T>(raw: unknown): T[] {
  if (!Array.isArray(raw)) {
    throw new SqlExecutionError("ipc", "db_select returned a non-array response");
  }
  for (let i = 0; i < raw.length; i++) {
    if (!isPlainObject(raw[i])) {
      throw new SqlExecutionError("ipc", `db_select row ${i} is not a plain object`);
    }
  }
  return raw as T[];
}

function validateBatchResponse(raw: unknown, expectedLength: number): SqlBatchResult[] {
  if (!Array.isArray(raw)) {
    throw new SqlExecutionError("ipc", "db_batch returned a non-array response");
  }
  if (raw.length !== expectedLength) {
    throw new SqlExecutionError(
      "ipc",
      `db_batch response length mismatch: expected ${expectedLength}, got ${raw.length}`,
    );
  }

  const results: SqlBatchResult[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (!isPlainObject(entry)) {
      throw new SqlExecutionError("ipc", `db_batch result ${i} is not an object`);
    }
    const rowsAffected = entry["rowsAffected"];
    if (
      typeof rowsAffected !== "number" ||
      !Number.isFinite(rowsAffected) ||
      !Number.isInteger(rowsAffected) ||
      rowsAffected < 0
    ) {
      throw new SqlExecutionError(
        "ipc",
        `db_batch result ${i} has invalid rowsAffected value`,
      );
    }
    results.push({ rowsAffected });
  }
  return results;
}

export function createTauriSqlExecutor(invoke: InvokeFn): SqlExecutor {
  return {
    async select<T = Record<string, SqlValue>>(
      sql: string,
      params?: SqlValue[],
    ): Promise<T[]> {
      const validatedParams = validateParams(params);
      let raw: unknown;
      try {
        raw = await invoke("db_select", { sql, params: validatedParams });
      } catch (err) {
        throw mapInvokeError(err);
      }
      return validateSelectResponse<T>(raw);
    },

    async batch(statements: SqlStatement[]): Promise<SqlBatchResult[]> {
      if (statements.length === 0) {
        return [];
      }

      const payloadStatements = statements.map((stmt, idx) => ({
        sql: stmt.sql,
        params: validateParams(stmt.params, idx),
      }));

      let raw: unknown;
      try {
        raw = await invoke("db_batch", { statements: payloadStatements });
      } catch (err) {
        throw mapInvokeError(err);
      }
      return validateBatchResponse(raw, statements.length);
    },
  };
}

export async function getDataLocation(invoke: InvokeFn): Promise<string> {
  let raw: unknown;
  try {
    raw = await invoke("data_location");
  } catch (err) {
    throw mapInvokeError(err);
  }
  if (typeof raw !== "string") {
    throw new SqlExecutionError("ipc", "data_location returned a non-string response");
  }
  return raw;
}
