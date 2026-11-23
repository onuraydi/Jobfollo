export type SqlValue = string | number | null;

export interface SqlStatement {
  sql: string;
  params?: SqlValue[];
}

export interface SqlBatchResult {
  rowsAffected: number;
}

export interface SqlExecutor {
  select<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Runs all statements in ONE transaction; all or nothing. */
  batch(statements: SqlStatement[]): Promise<SqlBatchResult[]>;
}

/** UTC ISO-8601 timestamp provider for created_at / updated_at columns. */
export interface Clock {
  nowIso(): string;
}

export interface IdGenerator {
  newId(): string;
}

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export interface MigrationRunResult {
  applied: number[];
  currentVersion: number;
}
