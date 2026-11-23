import { DatabaseSync } from "node:sqlite";
import type { SqlBatchResult, SqlExecutor, SqlStatement, SqlValue } from "../../src/types.js";

export interface TestSqliteExecutor extends SqlExecutor {
  close(): void;
}

export interface FailureInjectingExecutor extends TestSqliteExecutor {
  /** Causes the 1-based nth statement of the next batch() call to fail inside SQLite's transaction. */
  failOnBatchStatement(statementNumber: number): void;
}

export function withBatchFailure(inner: TestSqliteExecutor): FailureInjectingExecutor {
  let failAtIndex: number | null = null;

  return {
    select<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]> {
      return inner.select<T>(sql, params);
    },

    batch(statements: SqlStatement[]): Promise<SqlBatchResult[]> {
      if (failAtIndex === null) {
        return inner.batch(statements);
      }
      const target = failAtIndex;
      failAtIndex = null;
      if (target < 0 || target >= statements.length) {
        throw new RangeError(
          `failOnBatchStatement(${target + 1}) out of range for batch of length ${statements.length}`,
        );
      }
      const mutated = statements.map((stmt, idx) =>
        idx === target ? { sql: "INJECTED_BATCH_FAILURE_SYNTAX_ERROR" } : stmt,
      );
      return inner.batch(mutated);
    },

    close(): void {
      inner.close();
    },

    failOnBatchStatement(statementNumber: number): void {
      if (!Number.isInteger(statementNumber) || statementNumber < 1) {
        throw new RangeError(
          `statementNumber must be an integer >= 1, got ${String(statementNumber)}`,
        );
      }
      failAtIndex = statementNumber - 1;
    },
  };
}

export function createSqliteExecutor(filename = ":memory:"): TestSqliteExecutor {
  const db = new DatabaseSync(filename);
  let closed = false;
  db.exec("PRAGMA foreign_keys = ON;");
  if (filename !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }

  return {
    async select<T = Record<string, SqlValue>>(
      sql: string,
      params: SqlValue[] = [],
    ): Promise<T[]> {
      const stmt = db.prepare(sql);
      const rows = stmt.all(...params) as Record<string, SqlValue>[];
      return rows.map((row) => ({ ...row }) as T);
    },

    async batch(statements: SqlStatement[]): Promise<SqlBatchResult[]> {
      db.exec("BEGIN;");
      try {
        const results: SqlBatchResult[] = [];
        for (const statement of statements) {
          const stmt = db.prepare(statement.sql);
          const res = stmt.run(...(statement.params ?? []));
          results.push({ rowsAffected: Number(res.changes) });
        }
        db.exec("COMMIT;");
        return results;
      } catch (error) {
        db.exec("ROLLBACK;");
        throw error;
      }
    },

    close(): void {
      if (!closed) {
        closed = true;
        db.close();
      }
    },
  };
}
