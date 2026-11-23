import { afterEach, describe, expect, it } from "vitest";
import {
  AlreadySentError,
  builtInMigrations,
  createReminderLogRepository,
  runMigrations,
  type Clock,
  type IdGenerator,
} from "../src/index.js";
import { createSqliteExecutor, type TestSqliteExecutor } from "./support/sqlite-executor.js";

function makeSequenceClock(timestamps: string[]): Clock {
  let index = 0;
  return {
    nowIso: () => timestamps[Math.min(index++, timestamps.length - 1)]!,
  };
}

function makeSequenceIds(prefix = "log"): IdGenerator {
  let counter = 1;
  return {
    newId: () => `${prefix}-${counter++}`,
  };
}

describe("ReminderLogRepository", () => {
  let db: TestSqliteExecutor | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  async function setup(timestamps: string[] = ["2026-03-10T09:00:00.000Z"]) {
    db = createSqliteExecutor();
    const clock = makeSequenceClock(timestamps);
    const idGenerator = makeSequenceIds();
    await runMigrations(db, builtInMigrations, clock);
    const repo = createReminderLogRepository(db, { clock, idGenerator });
    return { db, repo };
  }

  it("records sent once per date, rejects duplicates with AlreadySentError, and returns MAX(date) for lastSentDate", async () => {
    const { repo } = await setup([
      "2026-03-10T09:00:00.000Z", // migration
      "2026-03-10T09:01:00.000Z", // sent 2026-03-10
      "2026-03-10T09:02:00.000Z", // sent 2026-03-08 (inserted later, earlier date!)
    ]);

    expect(await repo.wasSentOn("2026-03-10")).toBe(false);
    expect(await repo.lastSentDate()).toBeNull();

    await repo.recordSent("2026-03-10");
    expect(await repo.wasSentOn("2026-03-10")).toBe(true);
    expect(await repo.lastSentDate()).toBe("2026-03-10");

    await expect(repo.recordSent("2026-03-10", 2)).rejects.toThrow(AlreadySentError);

    // Inserting an older date later must not lower lastSentDate()
    await repo.recordSent("2026-03-08", 1);
    expect(await repo.lastSentDate()).toBe("2026-03-10");
  });

  it("allows repeated failures, allows failure after sent, counts failures, and normalizes error text", async () => {
    const { repo } = await setup([
      "2026-03-10T09:00:00.000Z", // migration
      "2026-03-10T09:01:00.000Z", // failure 1
      "2026-03-10T09:02:00.000Z", // failure 2 (whitespace/control chars)
      "2026-03-10T09:03:00.000Z", // sent
      "2026-03-10T09:04:00.000Z", // failure 3 (after sent, long error)
    ]);

    await repo.recordFailure("2026-03-10", "SMTP\r\nerror\t\x00timed out  ", 1);
    await repo.recordFailure("2026-03-10", "   \r\n\t  ", 2);
    await repo.recordSent("2026-03-10", 3);
    await repo.recordFailure("2026-03-10", "x".repeat(600), 4);

    expect(await repo.failureCountOn("2026-03-10")).toBe(3);
    expect(await repo.wasSentOn("2026-03-10")).toBe(true);

    const entries = await repo.recent(10);
    expect(entries).toHaveLength(4);
    expect(entries[0]).toStrictEqual({
      date: "2026-03-10",
      status: "failed",
      attempt: 4,
      createdAt: "2026-03-10T09:04:00.000Z",
      error: "x".repeat(500),
    });
    expect(entries[1]).toStrictEqual({
      date: "2026-03-10",
      status: "sent",
      attempt: 3,
      createdAt: "2026-03-10T09:03:00.000Z",
    });
    expect("error" in entries[1]!).toBe(false);
    expect(entries[2]?.error).toBe("Unknown error");
    expect(entries[3]?.error).toBe("SMTP error timed out");
  });

  it("orders recent() by created_at DESC, rowid DESC and enforces limit bounds", async () => {
    const { repo } = await setup([
      "2026-03-10T09:00:00.000Z", // migration
      "2026-03-10T10:00:00.000Z", // fail 1
      "2026-03-10T10:00:00.000Z", // fail 2 (same created_at, higher rowid -> newer)
      "2026-03-10T11:00:00.000Z", // fail 3
    ]);

    await repo.recordFailure("2026-03-10", "err-1", 1);
    await repo.recordFailure("2026-03-10", "err-2", 2);
    await repo.recordFailure("2026-03-10", "err-3", 3);

    const top2 = await repo.recent(2);
    expect(top2.map((e) => e.error)).toEqual(["err-3", "err-2"]);

    await expect(repo.recent(0)).rejects.toThrow(RangeError);
    await expect(repo.recent(201)).rejects.toThrow(RangeError);
    await expect(repo.recent(1.5)).rejects.toThrow(RangeError);
  });

  it("validates date and attempt inputs", async () => {
    const { repo } = await setup();

    await expect(repo.recordSent("2026-02-29")).rejects.toThrow(RangeError);
    await expect(repo.recordSent("2026-03-10", 0)).rejects.toThrow(RangeError);
    await expect(repo.recordSent("2026-03-10", 1.5)).rejects.toThrow(RangeError);

    await expect(repo.recordFailure("2026-02-29", "err", 1)).rejects.toThrow(RangeError);
    await expect(repo.recordFailure("2026-03-10", "err", 0)).rejects.toThrow(RangeError);

    await expect(repo.wasSentOn("2026-02-29")).rejects.toThrow(RangeError);
    await expect(repo.failureCountOn("2026-02-29")).rejects.toThrow(RangeError);
  });
});
