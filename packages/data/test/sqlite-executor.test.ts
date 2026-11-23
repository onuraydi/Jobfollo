import { afterEach, describe, expect, it } from "vitest";
import * as dataApi from "../src/index.js";
import { randomIdGenerator, systemClock } from "../src/index.js";
import { createSqliteExecutor, type TestSqliteExecutor } from "./support/sqlite-executor.js";

describe("createSqliteExecutor (test support)", () => {
  let db: TestSqliteExecutor | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it("supports parameterized select and batch statements with rowsAffected", async () => {
    db = createSqliteExecutor();

    await db.batch([
      { sql: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL)" },
      { sql: "INSERT INTO notes (id, body) VALUES (?, ?)", params: ["n1", "hello"] },
      { sql: "INSERT INTO notes (id, body) VALUES (?, ?)", params: ["n2", "world"] },
    ]);

    const updateResults = await db.batch([
      { sql: "UPDATE notes SET body = ? WHERE id = ?", params: ["updated", "n1"] },
      { sql: "DELETE FROM notes WHERE id = ?", params: ["n2"] },
    ]);
    expect(updateResults).toEqual([{ rowsAffected: 1 }, { rowsAffected: 1 }]);

    const rows = await db.select<{ id: string; body: string }>(
      "SELECT id, body FROM notes ORDER BY id",
    );
    expect(rows).toEqual([{ id: "n1", body: "updated" }]);
  });

  it("rolls back the entire batch when a later statement fails", async () => {
    db = createSqliteExecutor();

    await db.batch([
      { sql: "CREATE TABLE items (id TEXT PRIMARY KEY, title TEXT NOT NULL)" },
    ]);

    await expect(
      db.batch([
        { sql: "INSERT INTO items (id, title) VALUES (?, ?)", params: ["i1", "First"] },
        { sql: "INSERT INTO items (id, title) VALUES (?, ?)", params: ["i1", "Duplicate PK"] },
      ]),
    ).rejects.toThrow();

    const rows = await db.select("SELECT id FROM items");
    expect(rows).toEqual([]);
  });

  it("enforces PRAGMA foreign_keys = ON", async () => {
    db = createSqliteExecutor();

    await db.batch([
      { sql: "CREATE TABLE parent (id TEXT PRIMARY KEY)" },
      {
        sql: "CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent(id))",
      },
    ]);

    await expect(
      db.batch([
        {
          sql: "INSERT INTO child (id, parent_id) VALUES (?, ?)",
          params: ["c1", "missing-parent"],
        },
      ]),
    ).rejects.toThrow();
  });
});

describe("@jobfollo/data public surface and defaults", () => {
  it("does not export the Node SQLite test executor from src/index.ts", () => {
    expect("createSqliteExecutor" in dataApi).toBe(false);
  });

  it("provides default systemClock and randomIdGenerator", () => {
    const iso = systemClock.nowIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const id1 = randomIdGenerator.newId();
    const id2 = randomIdGenerator.newId();
    expect(id1.length).toBeGreaterThan(0);
    expect(id2.length).toBeGreaterThan(0);
    expect(id1).not.toBe(id2);
  });
});
