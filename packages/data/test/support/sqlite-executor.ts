import { DatabaseSync } from "node:sqlite";
import type { SqlBatchResult, SqlExecutor, SqlStatement, SqlValue } from "../../src/types.js";

export interface TestSqliteExecutor extends SqlExecutor {
  close(): void;
}

export function createSqliteExecutor(filename = ":memory:"): TestSqliteExecutor {
  const db = new DatabaseSync(filename);
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
      db.close();
    },
  };
}
