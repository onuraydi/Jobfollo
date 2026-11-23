import { systemClock } from "./defaults.js";
import type {
  Clock,
  Migration,
  MigrationRunResult,
  SqlExecutor,
  SqlStatement,
} from "./types.js";

const STATEMENT_BREAK_LINE = "-- statement-break";

const CREATE_SCHEMA_MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
)
`.trim();

function normalizeSql(sql: string): string {
  return sql.replaceAll("\r\n", "\n");
}

export function splitStatements(sql: string): string[] {
  const lines = normalizeSql(sql).split("\n");
  const statements: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line === STATEMENT_BREAK_LINE) {
      const chunk = current.join("\n").trim();
      if (chunk.length > 0) {
        statements.push(chunk);
      }
      current = [];
    } else {
      current.push(line);
    }
  }

  const trailing = current.join("\n").trim();
  if (trailing.length > 0) {
    statements.push(trailing);
  }

  return statements;
}

export async function computeChecksum(sql: string): Promise<string> {
  const normalized = normalizeSql(sql);
  const bytes = new TextEncoder().encode(normalized);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

interface AppliedMigrationRow {
  version: number;
  name: string;
  checksum: string;
  applied_at: string;
}

export async function runMigrations(
  executor: SqlExecutor,
  migrations: readonly Migration[],
  clock: Clock = systemClock,
): Promise<MigrationRunResult> {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  const seenVersions = new Set<number>();
  for (const migration of sorted) {
    if (!Number.isInteger(migration.version) || migration.version < 1) {
      throw new RangeError(
        `Migration version must be a positive integer, got ${String(migration.version)}`,
      );
    }
    if (seenVersions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    seenVersions.add(migration.version);
  }

  await executor.batch([{ sql: CREATE_SCHEMA_MIGRATIONS_SQL }]);

  const appliedRows = await executor.select<AppliedMigrationRow>(
    "SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version ASC",
  );

  const maxKnownVersion = sorted.length > 0 ? sorted[sorted.length - 1]!.version : 0;
  const maxAppliedVersion =
    appliedRows.length > 0 ? appliedRows[appliedRows.length - 1]!.version : 0;

  if (maxAppliedVersion > maxKnownVersion) {
    throw new Error(
      `Database schema version ${maxAppliedVersion} is newer than supported version ${maxKnownVersion}. Refusing to downgrade.`,
    );
  }

  const byVersion = new Map<number, Migration>();
  for (const migration of sorted) {
    byVersion.set(migration.version, migration);
  }

  const appliedByVersion = new Map<number, AppliedMigrationRow>();
  for (const row of appliedRows) {
    const known = byVersion.get(row.version);
    if (!known) {
      throw new Error(
        `Applied migration version ${row.version} (${row.name}) is missing from known migrations.`,
      );
    }
    const expectedChecksum = await computeChecksum(known.sql);
    if (row.checksum !== expectedChecksum) {
      throw new Error(
        `Checksum mismatch for applied migration ${row.version} (${row.name}): expected ${expectedChecksum}, found ${row.checksum}.`,
      );
    }
    appliedByVersion.set(row.version, row);
  }

  const newlyApplied: number[] = [];
  for (const migration of sorted) {
    if (appliedByVersion.has(migration.version)) {
      continue;
    }

    const statements: SqlStatement[] = splitStatements(migration.sql).map((sql) => ({ sql }));
    const checksum = await computeChecksum(migration.sql);
    statements.push({
      sql: "INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
      params: [migration.version, migration.name, checksum, clock.nowIso()],
    });

    await executor.batch(statements);
    newlyApplied.push(migration.version);
  }

  return {
    applied: newlyApplied,
    currentVersion: Math.max(maxAppliedVersion, ...newlyApplied),
  };
}
