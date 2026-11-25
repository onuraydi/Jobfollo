import { afterEach, describe, expect, it } from "vitest";
import {
  DatabaseNewerThanAppError,
  InvalidMigrationSetError,
  MigrationChecksumMismatchError,
  MigrationError,
  MigrationFailedError,
  builtInMigrations,
  computeChecksum,
  runMigrations,
  type Clock,
  type Migration,
} from "../src/index.js";
import { createSqliteExecutor, type TestSqliteExecutor } from "./support/sqlite-executor.js";

const fixedClock: Clock = {
  nowIso: () => "2026-03-10T09:00:00.000Z",
};

describe("runMigrations", () => {
  let db: TestSqliteExecutor | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it("applies built-in migrations on a fresh DB and records checksum and timestamp", async () => {
    db = createSqliteExecutor();

    const result = await runMigrations(db, builtInMigrations, fixedClock);
    expect(result).toEqual({ applied: [1, 2, 3], currentVersion: 3 });

    const rows = await db.select<{
      version: number;
      name: string;
      checksum: string;
      applied_at: string;
    }>("SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version");

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      version: 1,
      name: "0001_init",
      checksum: await computeChecksum(builtInMigrations[0]!.sql),
      applied_at: "2026-03-10T09:00:00.000Z",
    });
    expect(rows[1]).toEqual({
      version: 2,
      name: "0002_item_details",
      checksum: await computeChecksum(builtInMigrations[1]!.sql),
      applied_at: "2026-03-10T09:00:00.000Z",
    });
    expect(rows[2]).toEqual({
      version: 3,
      name: "0003_application_type",
      checksum: await computeChecksum(builtInMigrations[2]!.sql),
      applied_at: "2026-03-10T09:00:00.000Z",
    });
  });

  it("is a no-op when re-run on an already-migrated DB", async () => {
    db = createSqliteExecutor();

    await runMigrations(db, builtInMigrations, fixedClock);
    const second = await runMigrations(db, builtInMigrations, {
      nowIso: () => "2026-03-11T09:00:00.000Z",
    });

    expect(second).toEqual({ applied: [], currentVersion: 3 });

    const rows = await db.select<{ applied_at: string }>(
      "SELECT applied_at FROM schema_migrations WHERE version = 1",
    );
    expect(rows[0]?.applied_at).toBe("2026-03-10T09:00:00.000Z");
  });

  it("normalizes CRLF to LF when computing checksums", async () => {
    db = createSqliteExecutor();
    const lfMigration: Migration = {
      version: 1,
      name: "0001_lf",
      sql: "CREATE TABLE t (id TEXT PRIMARY KEY);\n-- statement-break\nCREATE INDEX idx_t ON t(id);\n",
    };
    const crlfMigration: Migration = {
      version: 1,
      name: "0001_lf",
      sql: lfMigration.sql.replaceAll("\n", "\r\n"),
    };

    expect(await computeChecksum(lfMigration.sql)).toBe(
      await computeChecksum(crlfMigration.sql),
    );

    await runMigrations(db, [lfMigration], fixedClock);
    const rerun = await runMigrations(db, [crlfMigration], fixedClock);
    expect(rerun).toEqual({ applied: [], currentVersion: 1 });
  });

  it("refuses to start when an applied migration checksum has changed", async () => {
    db = createSqliteExecutor();

    await runMigrations(db, builtInMigrations, fixedClock);

    const tampered: Migration[] = [
      {
        ...builtInMigrations[0]!,
        sql: `${builtInMigrations[0]!.sql}\n-- tampered`,
      },
      builtInMigrations[1]!,
      builtInMigrations[2]!,
    ];

    let caught: unknown;
    try {
      await runMigrations(db, tampered, fixedClock);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MigrationError);
    expect(caught).toBeInstanceOf(MigrationChecksumMismatchError);
    expect((caught as Error).name).toBe("MigrationChecksumMismatchError");
  });

  it("refuses to start when the DB schema version is newer than the app knows", async () => {
    db = createSqliteExecutor();

    const nextVersion = builtInMigrations.length + 1;
    const vNext: Migration = {
      version: nextVersion,
      name: `000${nextVersion}_extra`,
      sql: "CREATE TABLE extra (id TEXT PRIMARY KEY)",
    };

    await runMigrations(db, [...builtInMigrations, vNext], fixedClock);

    let caught: unknown;
    try {
      await runMigrations(db, builtInMigrations, fixedClock);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MigrationError);
    expect(caught).toBeInstanceOf(DatabaseNewerThanAppError);
    expect((caught as Error).name).toBe("DatabaseNewerThanAppError");
  });

  it("rolls back a failing migration completely including schema_migrations", async () => {
    db = createSqliteExecutor();

    const failing: Migration = {
      version: 1,
      name: "0001_broken",
      sql: [
        "CREATE TABLE partial_table (id TEXT PRIMARY KEY)",
        "-- statement-break",
        "THIS IS INVALID SQL",
      ].join("\n"),
    };

    let caught: unknown;
    try {
      await runMigrations(db, [failing], fixedClock);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MigrationError);
    expect(caught).toBeInstanceOf(MigrationFailedError);
    expect((caught as Error).name).toBe("MigrationFailedError");
    expect((caught as Error).cause).toBeDefined();

    const tables = await db.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'partial_table'",
    );
    expect(tables).toEqual([]);

    const applied = await db.select("SELECT version FROM schema_migrations");
    expect(applied).toEqual([]);
  });

  it("rejects duplicate or gapped migration versions with InvalidMigrationSetError", async () => {
    db = createSqliteExecutor();

    const dup: Migration[] = [
      { version: 1, name: "0001_a", sql: "CREATE TABLE a (id TEXT)" },
      { version: 1, name: "0001_b", sql: "CREATE TABLE b (id TEXT)" },
    ];
    let errDup: unknown;
    try {
      await runMigrations(db, dup, fixedClock);
    } catch (error) {
      errDup = error;
    }
    expect(errDup).toBeInstanceOf(MigrationError);
    expect(errDup).toBeInstanceOf(InvalidMigrationSetError);
    expect((errDup as Error).name).toBe("InvalidMigrationSetError");

    const gap: Migration[] = [
      { version: 1, name: "0001_a", sql: "CREATE TABLE a (id TEXT)" },
      { version: 3, name: "0003_c", sql: "CREATE TABLE c (id TEXT)" },
    ];
    let errGap: unknown;
    try {
      await runMigrations(db, gap, fixedClock);
    } catch (error) {
      errGap = error;
    }
    expect(errGap).toBeInstanceOf(InvalidMigrationSetError);
  });

  it("applies only pending migrations incrementally", async () => {
    db = createSqliteExecutor();

    await runMigrations(db, builtInMigrations, fixedClock);

    const nextVersion = builtInMigrations.length + 1;
    const vNext: Migration = {
      version: nextVersion,
      name: `000${nextVersion}_extra`,
      sql: "CREATE TABLE extra (id TEXT PRIMARY KEY)",
    };

    const result = await runMigrations(db, [...builtInMigrations, vNext], fixedClock);
    expect(result).toEqual({ applied: [nextVersion], currentVersion: nextVersion });
  });
});

describe("0001_init.sql schema constraints", () => {
  let db: TestSqliteExecutor | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  async function openMigratedDb(): Promise<TestSqliteExecutor> {
    db = createSqliteExecutor();
    await runMigrations(db, builtInMigrations, fixedClock);
    return db;
  }

  it.each([
    "2026-02-29",
    "2026-13-01",
    "2026-3-1",
    "not-a-date",
    "2026-03-01T00:00:00Z",
  ])("rejects invalid item.start_date: %s", async (badDate) => {
    const conn = await openMigratedDb();
    await expect(
      conn.batch([
        {
          sql: "INSERT INTO item (id, title, workflow_id, start_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          params: ["i1", "Acme", "job-application-networking", badDate, "2026-03-01T00:00:00Z", "2026-03-01T00:00:00Z"],
        },
      ]),
    ).rejects.toThrow();
  });

  it("accepts valid leap day and enforces nullable step_record.completed_on", async () => {
    const conn = await openMigratedDb();

    await conn.batch([
      {
        sql: "INSERT INTO item (id, title, workflow_id, start_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        params: ["i1", "Leap Co", "job-application-networking", "2028-02-29", "2028-02-29T00:00:00Z", "2028-02-29T00:00:00Z"],
      },
      {
        sql: "INSERT INTO step_record (item_id, step_key, completed_on, skipped) VALUES (?, ?, ?, ?)",
        params: ["i1", "apply", null, 1],
      },
      {
        sql: "INSERT INTO step_record (item_id, step_key, completed_on, skipped) VALUES (?, ?, ?, ?)",
        params: ["i1", "followup_1", "2028-03-07", 0],
      },
    ]);

    await expect(
      conn.batch([
        {
          sql: "INSERT INTO step_record (item_id, step_key, completed_on, skipped) VALUES (?, ?, ?, ?)",
          params: ["i1", "bad_step", "2026-02-29", 0],
        },
      ]),
    ).rejects.toThrow();
  });

  it("rejects invalid contact.status and invalid step_record.skipped", async () => {
    const conn = await openMigratedDb();

    await conn.batch([
      {
        sql: "INSERT INTO item (id, title, workflow_id, start_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        params: ["i1", "Acme", "job-application-networking", "2026-03-01", "2026-03-01T00:00:00Z", "2026-03-01T00:00:00Z"],
      },
    ]);

    await expect(
      conn.batch([
        {
          sql: "INSERT INTO contact (id, item_id, name, status, created_at) VALUES (?, ?, ?, ?, ?)",
          params: ["c1", "i1", "Jane", "unknown_status", "2026-03-01T00:00:00Z"],
        },
      ]),
    ).rejects.toThrow();

    await expect(
      conn.batch([
        {
          sql: "INSERT INTO step_record (item_id, step_key, completed_on, skipped) VALUES (?, ?, ?, ?)",
          params: ["i1", "apply", null, 2],
        },
      ]),
    ).rejects.toThrow();
  });

  it("enforces at most one sent reminder_log per date while allowing multiple failures", async () => {
    const conn = await openMigratedDb();

    await conn.batch([
      {
        sql: "INSERT INTO reminder_log (id, date, status, attempt, error, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        params: ["r1", "2026-03-10", "failed", 1, "SMTP timeout", "2026-03-10T09:00:00Z"],
      },
      {
        sql: "INSERT INTO reminder_log (id, date, status, attempt, error, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        params: ["r2", "2026-03-10", "failed", 2, "SMTP timeout", "2026-03-10T09:05:00Z"],
      },
      {
        sql: "INSERT INTO reminder_log (id, date, status, attempt, error, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        params: ["r3", "2026-03-10", "sent", 3, null, "2026-03-10T09:10:00Z"],
      },
    ]);

    await expect(
      conn.batch([
        {
          sql: "INSERT INTO reminder_log (id, date, status, attempt, error, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          params: ["r4", "2026-03-10", "sent", 4, null, "2026-03-10T09:15:00Z"],
        },
      ]),
    ).rejects.toThrow();
  });

  it("enforces foreign keys and cascades deletes from item to contact and step_record", async () => {
    const conn = await openMigratedDb();

    await expect(
      conn.batch([
        {
          sql: "INSERT INTO contact (id, item_id, name, status, created_at) VALUES (?, ?, ?, ?, ?)",
          params: ["c1", "missing-item", "Jane", "pending", "2026-03-01T00:00:00Z"],
        },
      ]),
    ).rejects.toThrow();

    await conn.batch([
      {
        sql: "INSERT INTO item (id, title, workflow_id, start_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        params: ["i1", "Acme", "job-application-networking", "2026-03-01", "2026-03-01T00:00:00Z", "2026-03-01T00:00:00Z"],
      },
      {
        sql: "INSERT INTO contact (id, item_id, name, status, created_at) VALUES (?, ?, ?, ?, ?)",
        params: ["c1", "i1", "Jane", "pending", "2026-03-01T00:00:00Z"],
      },
      {
        sql: "INSERT INTO step_record (item_id, step_key, completed_on, skipped) VALUES (?, ?, ?, ?)",
        params: ["i1", "apply", "2026-03-01", 0],
      },
    ]);

    await conn.batch([{ sql: "DELETE FROM item WHERE id = ?", params: ["i1"] }]);

    expect(await conn.select("SELECT id FROM contact")).toEqual([]);
    expect(await conn.select("SELECT step_key FROM step_record")).toEqual([]);
  });
});
