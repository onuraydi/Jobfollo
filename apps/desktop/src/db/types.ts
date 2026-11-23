export type InvokeFn = (
  cmd: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

export type SqlErrorKind =
  | "constraint"
  | "busy"
  | "sql"
  | "io"
  | "open"
  | "invalid_argument"
  | "forbidden"
  | "limit"
  | "ipc";
