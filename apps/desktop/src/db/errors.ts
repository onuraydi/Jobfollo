import type { SqlErrorKind } from "./types.js";

const KNOWN_RUST_ERROR_KINDS: ReadonlySet<string> = new Set<SqlErrorKind>([
  "constraint",
  "busy",
  "sql",
  "io",
  "open",
  "invalid_argument",
  "forbidden",
  "limit",
]);

export class SqlExecutionError extends Error {
  readonly kind: SqlErrorKind;

  constructor(kind: SqlErrorKind, message: string) {
    super(message);
    this.name = "SqlExecutionError";
    this.kind = kind;
  }
}

export function mapInvokeError(err: unknown): SqlExecutionError {
  if (err instanceof SqlExecutionError) {
    return err;
  }

  if (typeof err === "object" && err !== null && !Array.isArray(err)) {
    const record = err as Record<string, unknown>;
    if (
      typeof record["kind"] === "string" &&
      KNOWN_RUST_ERROR_KINDS.has(record["kind"]) &&
      typeof record["message"] === "string"
    ) {
      return new SqlExecutionError(record["kind"] as SqlErrorKind, record["message"]);
    }
  }

  if (err instanceof Error) {
    const msg = err.message.trim();
    return new SqlExecutionError("ipc", msg.length > 0 ? msg : err.name);
  }

  if (typeof err === "string") {
    const msg = err.trim();
    return new SqlExecutionError("ipc", msg.length > 0 ? msg : "IPC call failed");
  }

  if (err === null || err === undefined) {
    return new SqlExecutionError("ipc", "IPC call failed with empty error");
  }

  if (typeof err === "number" || typeof err === "boolean" || typeof err === "bigint") {
    return new SqlExecutionError("ipc", `IPC call failed (${String(err)})`);
  }

  return new SqlExecutionError("ipc", "IPC call failed with non-contractual error payload");
}
