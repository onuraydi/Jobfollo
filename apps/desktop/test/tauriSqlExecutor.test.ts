import { describe, expect, it, vi } from "vitest";
import fixtures from "../contract/ipc-fixtures.json";
import {
  SqlExecutionError,
  createTauriSqlExecutor,
  getDataLocation,
  type InvokeFn,
  type SqlErrorKind,
} from "../src/db/index.js";

describe("createTauriSqlExecutor & getDataLocation", () => {
  it("matches the shared IPC contract fixtures for batch, select, and data_location", async () => {
    const batchStatements = JSON.parse(fixtures.batch.requestStatementsJson) as Array<{
      sql: string;
      params?: Array<string | number | null>;
    }>;
    const batchResponse = JSON.parse(fixtures.batch.expectedResponseJson) as unknown;
    const selectResponse = JSON.parse(fixtures.select.expectedResponseJson) as unknown;

    const invoke = vi.fn<InvokeFn>(async (cmd) => {
      if (cmd === "db_batch") return batchResponse;
      if (cmd === "db_select") return selectResponse;
      if (cmd === "data_location") return fixtures.dataLocation.expectedResponse;
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const executor = createTauriSqlExecutor(invoke);

    const batchRes = await executor.batch(batchStatements);
    expect(JSON.stringify(batchRes)).toBe(fixtures.batch.expectedResponseJson);
    expect(invoke).toHaveBeenNthCalledWith(1, "db_batch", {
      statements: [
        { sql: batchStatements[0]!.sql, params: [] },
        { sql: batchStatements[1]!.sql, params: batchStatements[1]!.params },
      ],
    });

    const selectRes = await executor.select(fixtures.select.sql, fixtures.select.params);
    expect(JSON.stringify(selectRes)).toBe(fixtures.select.expectedResponseJson);
    expect(invoke).toHaveBeenNthCalledWith(2, "db_select", {
      sql: fixtures.select.sql,
      params: fixtures.select.params,
    });

    // Omitted params defaults to []
    await executor.select("SELECT 1");
    expect(invoke).toHaveBeenNthCalledWith(3, "db_select", {
      sql: "SELECT 1",
      params: [],
    });

    const loc = await getDataLocation(invoke);
    expect(loc).toBe(fixtures.dataLocation.expectedResponse);
    expect(invoke).toHaveBeenNthCalledWith(4, "data_location");
  });

  it("resolves empty batch to [] without calling invoke", async () => {
    const invoke = vi.fn<InvokeFn>();
    const executor = createTauriSqlExecutor(invoke);

    expect(await executor.batch([])).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["boolean true", true],
    ["boolean false", false],
    ["bigint", BigInt(42)],
    ["object", { secret: "SHOULD_NOT_LEAK" }],
    ["array", [1, 2]],
    ["unsafe positive integer", Number.MAX_SAFE_INTEGER + 1],
    ["unsafe negative integer", -Number.MAX_SAFE_INTEGER - 1],
  ])("rejects invalid parameter (%s) before calling IPC", async (_label, badParam) => {
    const invoke = vi.fn<InvokeFn>();
    const executor = createTauriSqlExecutor(invoke);

    let err: unknown;
    try {
      await executor.select("SELECT ?", [badParam as never]);
    } catch (e) {
      err = e;
    }

    expect(invoke).not.toHaveBeenCalled();
    expect(err).toBeInstanceOf(SqlExecutionError);
    expect((err as SqlExecutionError).kind).toBe("invalid_argument");
    expect((err as SqlExecutionError).message).not.toContain("SHOULD_NOT_LEAK");

    // Also guarded in batch
    await expect(
      executor.batch([{ sql: "INSERT INTO t VALUES (?)", params: [badParam as never] }]),
    ).rejects.toMatchObject({ kind: "invalid_argument" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(Object.entries(fixtures.errors))(
    "maps Rust IPC error kind %s verbatim into SqlExecutionError",
    async (expectedKind, payload) => {
      const invoke = vi.fn<InvokeFn>(async () => {
        throw payload;
      });
      const executor = createTauriSqlExecutor(invoke);

      let err: unknown;
      try {
        await executor.select("SELECT 1");
      } catch (e) {
        err = e;
      }

      expect(err).toBeInstanceOf(SqlExecutionError);
      expect((err as SqlExecutionError).kind).toBe(expectedKind as SqlErrorKind);
      expect((err as SqlExecutionError).message).toBe(payload.message);
    },
  );

  it.each([
    ["string rejection", "raw failure"],
    ["Error instance", new Error("boom")],
    ["null rejection", null],
    ["unknown kind object", { kind: "made_up", message: "nope" }],
    ["plain object", { code: 500 }],
    ["number rejection", 42],
  ])("maps non-contractual rejection (%s) to kind ipc without [object Object]", async (_label, rejection) => {
    const invoke = vi.fn<InvokeFn>(async () => {
      throw rejection;
    });
    const executor = createTauriSqlExecutor(invoke);

    let err: unknown;
    try {
      await executor.select("SELECT 1");
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(SqlExecutionError);
    expect((err as SqlExecutionError).kind).toBe("ipc");
    expect((err as SqlExecutionError).message.length).toBeGreaterThan(0);
    expect((err as SqlExecutionError).message).not.toContain("[object Object]");
  });

  it("rejects malformed responses with kind ipc", async () => {
    const badSelectResponses: unknown[] = [null, "ok", {}, [1], [null], [["nested"]]];
    for (const res of badSelectResponses) {
      const executor = createTauriSqlExecutor(async () => res);
      await expect(executor.select("SELECT 1")).rejects.toMatchObject({ kind: "ipc" });
    }

    const badBatchResponses: unknown[] = [
      null,
      [], // length mismatch for 1 statement
      [{ rowsAffected: -1 }],
      [{ rowsAffected: 1.5 }],
      [{ rowsAffected: "1" }],
      [{}],
    ];
    for (const res of badBatchResponses) {
      const executor = createTauriSqlExecutor(async () => res);
      await expect(
        executor.batch([{ sql: "DELETE FROM t" }]),
      ).rejects.toMatchObject({ kind: "ipc" });
    }

    await expect(getDataLocation(async () => 123)).rejects.toMatchObject({ kind: "ipc" });
    await expect(getDataLocation(async () => null)).rejects.toMatchObject({ kind: "ipc" });
  });

  it("never logs SQL parameters to console on success or failure", async () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "debug").mockImplementation(() => {}),
    ];

    try {
      const secret = "SENSITIVE_PARAM_TOKEN_XYZ";
      const okExecutor = createTauriSqlExecutor(async () => [{ v: secret }]);
      await okExecutor.select("SELECT ? AS v", [secret]);

      const failExecutor = createTauriSqlExecutor(async () => {
        throw fixtures.errors.constraint;
      });
      await failExecutor
        .batch([{ sql: "INSERT INTO t VALUES (?)", params: [secret] }])
        .catch(() => {});

      for (const spy of spies) {
        for (const call of spy.mock.calls) {
          expect(JSON.stringify(call)).not.toContain(secret);
        }
      }
    } finally {
      for (const spy of spies) {
        spy.mockRestore();
      }
    }
  });
});
