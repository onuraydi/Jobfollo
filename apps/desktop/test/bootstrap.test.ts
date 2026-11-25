import { jobApplicationNetworking } from "@jobfollo/core";
import {
  DatabaseNewerThanAppError,
  InvalidMigrationSetError,
  MigrationChecksumMismatchError,
  MigrationFailedError,
  builtInMigrations,
  runMigrations,
  type Migration,
  type SqlExecutor,
  type SqlStatement,
  type SqlValue,
} from "@jobfollo/data";
import { createAdvancingClock, createSqliteExecutor } from "@jobfollo/data/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bootstrap,
  classifyBootError,
  createBootController,
  createCryptoIdGenerator,
  type CryptoLike,
} from "../src/boot/index.js";
import { SqlExecutionError, createTauriSqlExecutor, getDataLocation, type InvokeFn } from "../src/db/index.js";

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function createFakeInvokeBackedBySqlite(
  sqlite: SqlExecutor,
  dataDir = "C:\\Users\\demo\\AppData\\Roaming\\io.github.onuraydi.jobfollo",
): InvokeFn {
  return async (cmd, args) => {
    if (cmd === "db_select") {
      return sqlite.select(
        args?.["sql"] as string,
        (args?.["params"] as SqlValue[] | undefined) ?? [],
      );
    }
    if (cmd === "db_batch") {
      return sqlite.batch(args?.["statements"] as SqlStatement[]);
    }
    if (cmd === "data_location") {
      return dataDir;
    }
    throw new Error(`Unknown command: ${cmd}`);
  };
}

describe("bootstrap & services", () => {
  const closers: Array<() => void> = [];

  afterEach(() => {
    while (closers.length > 0) {
      closers.pop()?.();
    }
  });

  function openInMemory() {
    const db = createSqliteExecutor(":memory:");
    closers.push(() => db.close());
    return db;
  }

  it("boots cleanly through Tauri SQL executor + in-memory SQLite and wires working repositories", async () => {
    const sqlite = openInMemory();
    const invoke = createFakeInvokeBackedBySqlite(sqlite, "C:\\app\\data");
    const executor = createTauriSqlExecutor(invoke);
    const clock = createAdvancingClock();

    const result = await bootstrap({
      executor,
      migrations: builtInMigrations,
      env: globalThis.crypto,
      clock,
      getDataLocation: () => getDataLocation(invoke),
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.services.dataLocation).toBe("C:\\app\\data");
    expect(result.services.localToday(new Date(2026, 2, 10))).toBe("2026-03-10");

    const created = await result.services.items.create({
      title: "Boot Smoke Co",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-10",
    });
    expect(await result.services.items.get(created.id)).toStrictEqual(created);
  });

  it("returns unsupported_environment and never calls executor or getDataLocation when WebCrypto is unavailable", async () => {
    const selectSpy = vi.fn();
    const batchSpy = vi.fn();
    const dataLocationSpy = vi.fn(async () => "C:\\app\\data");
    const executor: SqlExecutor = { select: selectSpy, batch: batchSpy };

    const brokenEnvs: Array<[string, CryptoLike | undefined]> = [
      ["undefined crypto", undefined],
      ["missing getRandomValues", { subtle: globalThis.crypto.subtle }],
      ["missing subtle.digest", { getRandomValues: (a) => globalThis.crypto.getRandomValues(a) }],
      [
        "digest rejects",
        {
          getRandomValues: (a) => globalThis.crypto.getRandomValues(a),
          subtle: {
            digest: async () => {
              throw new Error("SubtleCrypto blocked on insecure origin");
            },
          },
        },
      ],
    ];

    for (const [_label, env] of brokenEnvs) {
      const result = await bootstrap({
        executor,
        migrations: builtInMigrations,
        env,
        clock: createAdvancingClock(),
        getDataLocation: dataLocationSpy,
      });

      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.error.kind).toBe("unsupported_environment");
        expect(result.dataLocation).toBeNull();
      }
    }

    expect(selectSpy).not.toHaveBeenCalled();
    expect(batchSpy).not.toHaveBeenCalled();
    expect(dataLocationSpy).not.toHaveBeenCalled();
  });

  it("treats getDataLocation failure as non-fatal and sets dataLocation to null", async () => {
    const sqlite = openInMemory();
    const result = await bootstrap({
      executor: sqlite,
      migrations: builtInMigrations,
      env: globalThis.crypto,
      clock: createAdvancingClock(),
      getDataLocation: async () => {
        throw new SqlExecutionError("ipc", "data_location unavailable");
      },
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.services.dataLocation).toBeNull();
    }
  });

  it("reports database_newer when the database has a newer migration version without touching data", async () => {
    const sqlite = openInMemory();
    const clock = createAdvancingClock();
    const nextVersion = builtInMigrations.length + 1;
    const vNext: Migration = {
      version: nextVersion,
      name: `000${nextVersion}_future`,
      sql: "CREATE TABLE future_tbl (id TEXT PRIMARY KEY)",
    };
    await runMigrations(sqlite, [...builtInMigrations, vNext], clock);

    const result = await bootstrap({
      executor: sqlite,
      migrations: builtInMigrations,
      env: globalThis.crypto,
      clock,
      getDataLocation: async () => "C:\\app\\data",
    });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.kind).toBe("database_newer");
      expect(result.dataLocation).toBe("C:\\app\\data");
    }

    // Verify DB was never reset or wiped
    const rows = await sqlite.select<{ version: number }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    expect(rows.map((r) => r.version)).toEqual(
      Array.from({ length: nextVersion }, (_, i) => i + 1),
    );
  });
});

describe("classifyBootError", () => {
  it("classifies every typed migration and SQL error strictly by instanceof and kind", () => {
    expect(classifyBootError(new DatabaseNewerThanAppError(3, 1)).kind).toBe("database_newer");
    expect(
      classifyBootError(new MigrationChecksumMismatchError(1, "0001_init", "aaa", "bbb")).kind,
    ).toBe("migration_checksum");
    expect(classifyBootError(new InvalidMigrationSetError("gap")).kind).toBe("migration_invalid");
    expect(
      classifyBootError(new MigrationFailedError(1, "0001_init", new Error("syntax"))).kind,
    ).toBe("migration_failed");

    expect(classifyBootError(new SqlExecutionError("open", "cannot open")).kind).toBe(
      "open_failed",
    );
    expect(classifyBootError(new SqlExecutionError("busy", "locked")).kind).toBe("database_busy");
    expect(classifyBootError(new SqlExecutionError("io", "disk full")).kind).toBe("database_io");
    expect(classifyBootError(new SqlExecutionError("ipc", "malformed")).kind).toBe("unknown");

    // Unwraps SqlExecutionError inside MigrationFailedError.cause
    expect(
      classifyBootError(
        new MigrationFailedError(1, "0001_init", new SqlExecutionError("busy", "locked")),
      ).kind,
    ).toBe("database_busy");

    // Plain Error with misleading message text must NEVER be matched by text
    expect(
      classifyBootError(new Error("database is locked checksum mismatch newer than app")).kind,
    ).toBe("unknown");
  });
});

describe("createCryptoIdGenerator", () => {
  it("uses crypto.randomUUID when available", () => {
    const gen = createCryptoIdGenerator({
      randomUUID: () => "11111111-1111-4111-8111-111111111111",
    });
    expect(gen.newId()).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("falls back to valid RFC 4122 UUID v4 built from getRandomValues when randomUUID is absent", () => {
    const gen = createCryptoIdGenerator({
      getRandomValues: (arr) => globalThis.crypto.getRandomValues(arr),
    });

    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const id = gen.newId();
      expect(id).toMatch(UUID_V4_RE);
      ids.add(id);
    }
    expect(ids.size).toBe(20);
  });
});

describe("single-flight boot controller", () => {
  it("shares one in-flight promise across concurrent callers and allows retryBoot to start a fresh run", async () => {
    let calls = 0;
    const runner = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return {
          status: "error" as const,
          error: { kind: "database_busy" as const, technicalDetails: "busy" },
          dataLocation: null,
        };
      }
      return {
        status: "error" as const,
        error: { kind: "open_failed" as const, technicalDetails: "still failed" },
        dataLocation: null,
      };
    });

    const controller = createBootController(runner);
    const p1 = controller.getBoot();
    const p2 = controller.getBoot();
    expect(p1).toBe(p2);

    const r1 = await p1;
    expect(runner).toHaveBeenCalledTimes(1);
    expect(r1.status).toBe("error");
    expect(controller.getSnapshot()).toBe(r1);

    // Calling getBoot() again after completion returns the same settled promise (StrictMode safe)
    const p3 = controller.getBoot();
    expect(p3).toBe(p1);
    expect(runner).toHaveBeenCalledTimes(1);

    // retryBoot() clears and triggers a second run
    const r2 = await controller.retryBoot();
    expect(runner).toHaveBeenCalledTimes(2);
    expect(r2.status).toBe("error");
    if (r2.status === "error") {
      expect(r2.error.kind).toBe("open_failed");
    }
  });
});
