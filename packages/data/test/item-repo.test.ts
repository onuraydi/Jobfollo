import { computeNextStep, jobApplicationNetworking } from "@jobfollo/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ItemNotFoundError,
  ItemValidationError,
  builtInMigrations,
  createItemRepository,
  createWorkflowRepository,
  runMigrations,
  type Clock,
  type IdGenerator,
  type SqlExecutor,
} from "../src/index.js";
import { createSqliteExecutor, type TestSqliteExecutor } from "./support/sqlite-executor.js";

function makeSequenceClock(timestamps: string[]): Clock {
  let index = 0;
  return {
    nowIso: () => timestamps[Math.min(index++, timestamps.length - 1)]!,
  };
}

function makeSequenceIds(prefix = "id"): IdGenerator {
  let counter = 1;
  return {
    newId: () => `${prefix}-${counter++}`,
  };
}

describe("ItemRepository", () => {
  let db: TestSqliteExecutor | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  async function setup(opts?: { clock?: Clock; idGenerator?: IdGenerator }) {
    db = createSqliteExecutor();
    const clock = opts?.clock ?? makeSequenceClock(["2026-03-10T09:00:00.000Z"]);
    const idGenerator = opts?.idGenerator ?? makeSequenceIds();
    const migrationTs = clock.nowIso();
    await runMigrations(db, builtInMigrations, { nowIso: () => migrationTs });
    const workflowRepo = createWorkflowRepository(db, { clock, idGenerator });
    const itemRepo = createItemRepository(db, workflowRepo, { clock, idGenerator });
    return { db, workflowRepo, itemRepo };
  }

  it("creates and loads a full item with strict equality and works directly with core computeNextStep", async () => {
    const { itemRepo } = await setup();

    const created = await itemRepo.create({
      title: "  Acme Corp  ",
      role: "Senior Engineer",
      channel: "LinkedIn",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-01",
      notes: "Referred by Alex",
      contacts: [
        { name: "Jane Doe", profileUrl: "https://linkedin.com/in/jane", status: "accepted" },
        { name: "Bob Smith", status: "pending" },
      ],
      steps: [
        { stepKey: "apply", completedOn: "2026-03-01", skipped: false },
        { stepKey: "connect_request", skipped: true },
      ],
    });

    expect(created).toStrictEqual({
      id: "id-1",
      title: "Acme Corp",
      role: "Senior Engineer",
      channel: "LinkedIn",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-01",
      notes: "Referred by Alex",
      contacts: [
        {
          id: "id-2",
          name: "Jane Doe",
          profileUrl: "https://linkedin.com/in/jane",
          status: "accepted",
        },
        {
          id: "id-3",
          name: "Bob Smith",
          status: "pending",
        },
      ],
      steps: [
        { stepKey: "apply", completedOn: "2026-03-01" },
        { stepKey: "connect_request", skipped: true },
      ],
      createdAt: "2026-03-10T09:00:00.000Z",
      updatedAt: "2026-03-10T09:00:00.000Z",
    });

    const loaded = await itemRepo.get(created.id);
    expect(loaded).toStrictEqual(created);

    // StoredItem is directly usable as a core Item
    expect(computeNextStep(loaded!, jobApplicationNetworking, "2026-03-08")).toMatchObject({
      stepKey: "followup_1",
      dueDate: "2026-03-08",
      daysLeft: 0,
    });
  });

  it("omits optional NULL columns on minimal items and returns null for missing id", async () => {
    const { itemRepo } = await setup();

    expect(await itemRepo.get("missing-id")).toBeNull();

    const created = await itemRepo.create({
      title: "Minimal Co",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-01",
    });

    const loaded = await itemRepo.get(created.id);
    expect(loaded).toStrictEqual(created);
    expect("role" in loaded!).toBe(false);
    expect("channel" in loaded!).toBe(false);
    expect("notes" in loaded!).toBe(false);
    expect("outcome" in loaded!).toBe(false);
    expect("archivedAt" in loaded!).toBe(false);
  });

  it("accepts custom workflow ids from WorkflowRepository and rejects unknown workflowId", async () => {
    const { workflowRepo, itemRepo } = await setup();
    await workflowRepo.save({
      id: "custom-flow",
      name: "Custom Flow",
      steps: [{ key: "ping", title: "Ping", anchor: "start", offsetDays: 2 }],
      stopOutcomes: ["done"],
    });

    const created = await itemRepo.create({
      title: "Custom Co",
      workflowId: "custom-flow",
      startDate: "2026-03-01",
    });
    expect(created.workflowId).toBe("custom-flow");

    await expect(
      itemRepo.create({
        title: "Bad Flow Co",
        workflowId: "nonexistent-workflow",
        startDate: "2026-03-01",
      }),
    ).rejects.toThrow(ItemValidationError);
  });

  it("inserts item, contacts, and steps in a single atomic batch call", async () => {
    const { db: conn, workflowRepo } = await setup();
    const batchSpy = vi.spyOn(conn, "batch");
    const repo = createItemRepository(conn, workflowRepo, {
      clock: makeSequenceClock(["2026-03-10T09:00:00.000Z"]),
      idGenerator: makeSequenceIds("b"),
    });

    await repo.create({
      title: "Batch Co",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-01",
      contacts: [{ name: "Alice", status: "pending" }],
      steps: [{ stepKey: "apply", completedOn: "2026-03-01" }],
    });

    expect(batchSpy).toHaveBeenCalledTimes(1);
  });

  it("collects all validation issues into a single ItemValidationError", async () => {
    const { itemRepo } = await setup();

    let caught: unknown;
    try {
      await itemRepo.create({
        title: "   ",
        role: "r".repeat(201),
        channel: "c".repeat(201),
        notes: "n".repeat(20001),
        workflowId: "unknown-wf",
        startDate: "2026-02-29",
        contacts: [
          { name: "Bad URL 1", profileUrl: "javascript:alert(1)", status: "pending" },
          { name: "Bad URL 2", profileUrl: "data:text/html,hi", status: "pending" },
          { name: "Bad URL 3", profileUrl: "file:///etc/passwd", status: "pending" },
          {
            name: "Bad Status",
            profileUrl: "http://example.com/ok",
            status: "weird" as "pending",
          },
        ],
        steps: [{ stepKey: "apply", completedOn: "2026-13-01" }],
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ItemValidationError);
    const fields = (caught as ItemValidationError).issues.map((i) => i.field);
    expect(fields).toContain("title");
    expect(fields).toContain("role");
    expect(fields).toContain("channel");
    expect(fields).toContain("notes");
    expect(fields).toContain("workflowId");
    expect(fields).toContain("startDate");
    expect(fields).toContain("contacts[0].profileUrl");
    expect(fields).toContain("contacts[1].profileUrl");
    expect(fields).toContain("contacts[2].profileUrl");
    expect(fields).toContain("contacts[3].status");
    expect(fields).toContain("steps[0].completedOn");
  });

  it("lists items ordered by created_at DESC, rowid DESC and contacts by created_at ASC, rowid ASC", async () => {
    const clock = makeSequenceClock([
      "2026-03-10T09:00:00.000Z", // migration
      "2026-03-10T10:00:00.000Z", // item 1
      "2026-03-10T10:00:00.000Z", // item 2 (same created_at, higher rowid -> comes before item 1)
      "2026-03-10T11:00:00.000Z", // item 3 (newer created_at -> comes first)
      "2026-03-10T12:00:00.000Z", // archive item 2
    ]);
    const { itemRepo } = await setup({ clock });

    const i1 = await itemRepo.create({
      title: "First",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-01",
      contacts: [
        { name: "Contact A", status: "pending" },
        { name: "Contact B", status: "accepted" },
      ],
    });
    const i2 = await itemRepo.create({
      title: "Second",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-02",
    });
    const i3 = await itemRepo.create({
      title: "Third",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-03",
    });

    const activeAll = await itemRepo.list();
    expect(activeAll.map((i) => i.id)).toEqual([i3.id, i2.id, i1.id]);
    expect(activeAll[2]?.contacts.map((c) => c.name)).toEqual(["Contact A", "Contact B"]);

    await itemRepo.archive(i2.id);

    const activeAfterArchive = await itemRepo.list();
    expect(activeAfterArchive.map((i) => i.id)).toEqual([i3.id, i1.id]);

    const includingArchived = await itemRepo.list({ includeArchived: true });
    expect(includingArchived.map((i) => i.id)).toEqual([i3.id, i2.id, i1.id]);
  });

  it("uses at most 3 SELECT calls in list() regardless of item count", async () => {
    const { db: conn, itemRepo } = await setup();

    for (let n = 0; n < 12; n++) {
      await itemRepo.create({
        title: `Company ${n}`,
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
        contacts: [{ name: `Person ${n}`, status: "pending" }],
        steps: [{ stepKey: "apply", completedOn: "2026-03-01" }],
      });
    }

    const selectSpy = vi.spyOn(conn as SqlExecutor, "select");
    const items = await itemRepo.list();
    expect(items).toHaveLength(12);
    expect(selectSpy.mock.calls.length).toBeLessThanOrEqual(3);
  });

  describe("update(id, patch)", () => {
    it("updates provided fields, leaves undefined unchanged, and clears null fields", async () => {
      const clock = makeSequenceClock([
        "2026-03-10T09:00:00.000Z", // migration
        "2026-03-10T10:00:00.000Z", // create
        "2026-03-11T14:00:00.000Z", // update
      ]);
      const { itemRepo } = await setup({ clock });

      const created = await itemRepo.create({
        title: "Old Title",
        role: "Engineer",
        channel: "Email",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
        notes: "Initial notes",
      });

      const updated = await itemRepo.update(created.id, {
        title: "  New Title  ",
        role: null,
        notes: null,
        startDate: "2026-03-05",
      });

      expect(updated).toStrictEqual({
        id: created.id,
        title: "New Title",
        channel: "Email",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-05",
        contacts: [],
        steps: [],
        createdAt: "2026-03-10T10:00:00.000Z",
        updatedAt: "2026-03-11T14:00:00.000Z",
      });
      expect(await itemRepo.get(created.id)).toStrictEqual(updated);
    });

    it("does not write or change updated_at on an empty patch, and throws ItemNotFoundError if missing", async () => {
      const clock = makeSequenceClock([
        "2026-03-10T09:00:00.000Z", // migration
        "2026-03-10T10:00:00.000Z", // create
        "2026-03-12T10:00:00.000Z", // would be used if written
      ]);
      const { db: conn, itemRepo } = await setup({ clock });

      const created = await itemRepo.create({
        title: "Unchanged Co",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
      });

      const batchSpy = vi.spyOn(conn, "batch");
      const same = await itemRepo.update(created.id, {});
      expect(batchSpy).not.toHaveBeenCalled();
      expect(same).toStrictEqual(created);

      await expect(itemRepo.update("missing-id", {})).rejects.toThrow(ItemNotFoundError);
    });

    it("throws ItemNotFoundError for missing id and ItemValidationError for invalid patch", async () => {
      const { itemRepo } = await setup();
      const created = await itemRepo.create({
        title: "Acme",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
      });

      await expect(itemRepo.update("missing-id", { title: "New" })).rejects.toThrow(
        ItemNotFoundError,
      );
      await expect(
        itemRepo.update(created.id, { title: "", startDate: "2026-02-29" }),
      ).rejects.toThrow(ItemValidationError);
    });
  });

  describe("archive / unarchive / delete", () => {
    it("archives and unarchives idempotently and get(id) still returns archived items", async () => {
      const clock = makeSequenceClock([
        "2026-03-10T09:00:00.000Z", // migration
        "2026-03-10T10:00:00.000Z", // create
        "2026-03-11T10:00:00.000Z", // first archive
        "2026-03-12T10:00:00.000Z", // second archive (idempotent -> no change)
        "2026-03-13T10:00:00.000Z", // first unarchive
        "2026-03-14T10:00:00.000Z", // second unarchive (idempotent -> no change)
      ]);
      const { itemRepo } = await setup({ clock });

      const created = await itemRepo.create({
        title: "Archive Co",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
      });

      await itemRepo.archive(created.id);
      const archived1 = await itemRepo.get(created.id);
      expect(archived1?.archivedAt).toBe("2026-03-11T10:00:00.000Z");
      expect(archived1?.updatedAt).toBe("2026-03-11T10:00:00.000Z");

      await itemRepo.archive(created.id);
      const archived2 = await itemRepo.get(created.id);
      expect(archived2).toStrictEqual(archived1);

      await itemRepo.unarchive(created.id);
      const unarchived1 = await itemRepo.get(created.id);
      expect("archivedAt" in unarchived1!).toBe(false);
      expect(unarchived1?.updatedAt).toBe("2026-03-13T10:00:00.000Z");

      await itemRepo.unarchive(created.id);
      const unarchived2 = await itemRepo.get(created.id);
      expect(unarchived2).toStrictEqual(unarchived1);
    });

    it("throws ItemNotFoundError on archive, unarchive, and delete for missing id", async () => {
      const { itemRepo } = await setup();

      await expect(itemRepo.archive("missing")).rejects.toThrow(ItemNotFoundError);
      await expect(itemRepo.unarchive("missing")).rejects.toThrow(ItemNotFoundError);
      await expect(itemRepo.delete("missing")).rejects.toThrow(ItemNotFoundError);
    });

    it("cascades delete to contacts and step records", async () => {
      const { db: conn, itemRepo } = await setup();
      const created = await itemRepo.create({
        title: "Delete Co",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
        contacts: [{ name: "Jane", status: "pending" }],
        steps: [{ stepKey: "apply", completedOn: "2026-03-01" }],
      });

      await itemRepo.delete(created.id);

      expect(await itemRepo.get(created.id)).toBeNull();
      expect(await conn.select("SELECT id FROM contact WHERE item_id = ?", [created.id])).toEqual(
        [],
      );
      expect(
        await conn.select("SELECT step_key FROM step_record WHERE item_id = ?", [created.id]),
      ).toEqual([]);
    });

    it("persists rich company/item detail fields and snoozeStep cleanly", async () => {
      const { itemRepo } = await setup();
      const created = await itemRepo.create({
        title: "Senior Backend Engineer",
        company: "Acme Türkiye",
        role: "Backend Engineer",
        channel: "LinkedIn",
        jobUrl: "https://careers.acme.example/jobs/123",
        location: "İstanbul",
        workMode: "hybrid",
        salaryRange: "120k-150k TRY",
        priority: "high",
        tags: ["Referanslı", "Favori", "favori"],
        cvVersion: "CV_Backend_2026.pdf",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-10",
      });

      expect(created.company).toBe("Acme Türkiye");
      expect(created.tags).toEqual(["Referanslı", "Favori"]);

      await itemRepo.snoozeStep(created.id, "apply", "2026-03-15");

      const loaded = await itemRepo.get(created.id);
      expect(loaded?.company).toBe("Acme Türkiye");
      expect(loaded?.jobUrl).toBe("https://careers.acme.example/jobs/123");
      expect(loaded?.location).toBe("İstanbul");
      expect(loaded?.workMode).toBe("hybrid");
      expect(loaded?.salaryRange).toBe("120k-150k TRY");
      expect(loaded?.priority).toBe("high");
      expect(loaded?.tags).toEqual(["Referanslı", "Favori"]);
      expect(loaded?.cvVersion).toBe("CV_Backend_2026.pdf");
      expect(loaded?.steps).toEqual([{ stepKey: "apply", snoozedUntil: "2026-03-15" }]);

      // Updating fields + clearing tags works
      const updated = await itemRepo.update(created.id, {
        company: "Acme Global",
        workMode: "remote",
        priority: "low",
        tags: null,
      });
      expect(updated.company).toBe("Acme Global");
      expect(updated.workMode).toBe("remote");
      expect(updated.priority).toBe("low");
      expect(updated.tags).toBeUndefined();
    });
  });
});
