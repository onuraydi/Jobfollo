import { computeNextStep, jobApplicationNetworking } from "@jobfollo/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ContactNotFoundError,
  ItemNotFoundError,
  ItemValidationError,
  StepNotInWorkflowError,
  builtInMigrations,
  createItemRepository,
  createWorkflowRepository,
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

function makeSequenceIds(prefix = "id"): IdGenerator {
  let counter = 1;
  return {
    newId: () => `${prefix}-${counter++}`,
  };
}

describe("ItemRepository — steps, contacts and outcome", () => {
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
    const workflowRepo = createWorkflowRepository(db, { clock, idGenerator });
    const itemRepo = createItemRepository(db, workflowRepo, { clock, idGenerator });
    return { db, workflowRepo, itemRepo };
  }

  describe("completeStep and skipStep", () => {
    it("upserts on repeated completeStep and when switching between skipped and completed", async () => {
      const { itemRepo } = await setup([
        "2026-03-10T09:00:00.000Z", // migration
        "2026-03-10T10:00:00.000Z", // create
        "2026-03-10T11:00:00.000Z", // complete 1
        "2026-03-10T12:00:00.000Z", // complete 2 (update date)
        "2026-03-10T13:00:00.000Z", // skip (replaces completed)
        "2026-03-10T14:00:00.000Z", // complete again (replaces skipped)
      ]);

      const item = await itemRepo.create({
        title: "Acme",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
      });

      await itemRepo.completeStep(item.id, "apply", "2026-03-01");
      await itemRepo.completeStep(item.id, "apply", "2026-03-02");

      let loaded = await itemRepo.get(item.id);
      expect(loaded?.steps).toStrictEqual([{ stepKey: "apply", completedOn: "2026-03-02" }]);
      expect(loaded?.updatedAt).toBe("2026-03-10T12:00:00.000Z");

      await itemRepo.skipStep(item.id, "apply");
      loaded = await itemRepo.get(item.id);
      expect(loaded?.steps).toStrictEqual([{ stepKey: "apply", skipped: true }]);
      expect(loaded?.updatedAt).toBe("2026-03-10T13:00:00.000Z");

      await itemRepo.completeStep(item.id, "apply", "2026-03-03");
      loaded = await itemRepo.get(item.id);
      expect(loaded?.steps).toStrictEqual([{ stepKey: "apply", completedOn: "2026-03-03" }]);
      expect(loaded?.updatedAt).toBe("2026-03-10T14:00:00.000Z");
    });

    it("atomically completes check_accept and updates contactStatuses in ONE batch", async () => {
      const { db: conn, itemRepo } = await setup([
        "2026-03-10T09:00:00.000Z", // migration
        "2026-03-10T10:00:00.000Z", // create
        "2026-03-10T11:00:00.000Z", // complete check_accept
      ]);

      const item = await itemRepo.create({
        title: "Acme",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
        contacts: [{ name: "Jane Doe", status: "pending" }],
        steps: [
          { stepKey: "apply", completedOn: "2026-03-01" },
          { stepKey: "connect_request", completedOn: "2026-03-01" },
        ],
      });
      const contactId = item.contacts[0]!.id;

      const batchSpy = vi.spyOn(conn, "batch");
      await itemRepo.completeStep(item.id, "check_accept", "2026-03-02", {
        contactStatuses: [{ contactId, status: "accepted" }],
      });

      expect(batchSpy).toHaveBeenCalledTimes(1);

      const loaded = await itemRepo.get(item.id);
      expect(loaded?.contacts[0]?.status).toBe("accepted");
      expect(loaded?.updatedAt).toBe("2026-03-10T11:00:00.000Z");
      expect(computeNextStep(loaded!, jobApplicationNetworking, "2026-03-02")).toMatchObject({
        stepKey: "first_message",
        dueDate: "2026-03-02",
      });
    });

    it("rejects missing item, unknown stepKey, invalid date, or foreign contactId", async () => {
      const { itemRepo } = await setup();

      const item1 = await itemRepo.create({
        title: "Item 1",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
        contacts: [{ name: "Jane", status: "pending" }],
      });
      const item2 = await itemRepo.create({
        title: "Item 2",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
        contacts: [{ name: "Other", status: "pending" }],
      });

      await expect(
        itemRepo.completeStep("missing", "apply", "2026-03-01"),
      ).rejects.toThrow(ItemNotFoundError);
      await expect(
        itemRepo.skipStep("missing", "apply"),
      ).rejects.toThrow(ItemNotFoundError);

      await expect(
        itemRepo.completeStep(item1.id, "no_such_step", "2026-03-01"),
      ).rejects.toThrow(StepNotInWorkflowError);
      await expect(
        itemRepo.skipStep(item1.id, "no_such_step"),
      ).rejects.toThrow(StepNotInWorkflowError);

      await expect(
        itemRepo.completeStep(item1.id, "apply", "2026-02-29"),
      ).rejects.toThrow(ItemValidationError);

      await expect(
        itemRepo.completeStep(item1.id, "check_accept", "2026-03-02", {
          contactStatuses: [{ contactId: item2.contacts[0]!.id, status: "accepted" }],
        }),
      ).rejects.toThrow(ContactNotFoundError);
    });

    it("allows out-of-order completion and loads orphan step records after workflow edit", async () => {
      const { workflowRepo, itemRepo } = await setup();

      await workflowRepo.save({
        id: "wf-editable",
        name: "Editable",
        steps: [
          { key: "s1", title: "Step 1", anchor: "start", offsetDays: 0 },
          { key: "s2", title: "Step 2", anchor: "step:s1", offsetDays: 2 },
        ],
        stopOutcomes: ["done"],
      });

      const item = await itemRepo.create({
        title: "Flexible Co",
        workflowId: "wf-editable",
        startDate: "2026-03-10",
      });

      // Completing s2 before s1 and before startDate is allowed (no scheduling rules in data)
      await itemRepo.completeStep(item.id, "s2", "2026-03-01");

      // Edit workflow to remove s2 -> reading the item still loads the orphan step record
      await workflowRepo.save({
        id: "wf-editable",
        name: "Editable",
        steps: [{ key: "s1", title: "Step 1", anchor: "start", offsetDays: 0 }],
        stopOutcomes: ["done"],
      });

      const loaded = await itemRepo.get(item.id);
      expect(loaded?.steps).toStrictEqual([{ stepKey: "s2", completedOn: "2026-03-01" }]);
    });
  });

  describe("undoStep", () => {
    it("removes step record, restores schedule, preserves contact status, and returns false on no-op", async () => {
      const { itemRepo } = await setup([
        "2026-03-10T09:00:00.000Z", // migration
        "2026-03-10T10:00:00.000Z", // create
        "2026-03-10T11:00:00.000Z", // complete apply
        "2026-03-10T12:00:00.000Z", // undo apply
        "2026-03-10T13:00:00.000Z", // second undo (no-op -> must not bump updated_at)
      ]);

      const item = await itemRepo.create({
        title: "Undo Co",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
        contacts: [{ name: "Jane", status: "accepted" }],
      });

      await itemRepo.completeStep(item.id, "apply", "2026-03-01");
      let loaded = await itemRepo.get(item.id);
      expect(computeNextStep(loaded!, jobApplicationNetworking, "2026-03-01")?.stepKey).toBe(
        "connect_request",
      );

      expect(await itemRepo.undoStep(item.id, "apply")).toBe(true);
      loaded = await itemRepo.get(item.id);
      expect(loaded?.steps).toEqual([]);
      expect(loaded?.contacts[0]?.status).toBe("accepted");
      expect(loaded?.updatedAt).toBe("2026-03-10T12:00:00.000Z");
      expect(computeNextStep(loaded!, jobApplicationNetworking, "2026-03-01")?.stepKey).toBe(
        "apply",
      );

      expect(await itemRepo.undoStep(item.id, "apply")).toBe(false);
      loaded = await itemRepo.get(item.id);
      expect(loaded?.updatedAt).toBe("2026-03-10T12:00:00.000Z");

      await expect(itemRepo.undoStep("missing", "apply")).rejects.toThrow(ItemNotFoundError);
    });
  });

  describe("setOutcome", () => {
    it("sets and clears outcome, stops and resumes flow, allows non-stop outcomes and archived items", async () => {
      const { itemRepo } = await setup([
        "2026-03-10T09:00:00.000Z", // migration
        "2026-03-10T10:00:00.000Z", // create
        "2026-03-10T11:00:00.000Z", // set interview
        "2026-03-10T12:00:00.000Z", // clear outcome
        "2026-03-10T13:00:00.000Z", // archive
        "2026-03-10T14:00:00.000Z", // set non-stop outcome on archived item
      ]);

      const item = await itemRepo.create({
        title: "Outcome Co",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
      });

      await itemRepo.setOutcome(item.id, "interview");
      let loaded = await itemRepo.get(item.id);
      expect(loaded?.outcome).toBe("interview");
      expect(loaded?.updatedAt).toBe("2026-03-10T11:00:00.000Z");
      expect(computeNextStep(loaded!, jobApplicationNetworking, "2026-03-05")).toBeNull();

      await itemRepo.setOutcome(item.id, null);
      loaded = await itemRepo.get(item.id);
      expect("outcome" in loaded!).toBe(false);
      expect(loaded?.updatedAt).toBe("2026-03-10T12:00:00.000Z");
      expect(computeNextStep(loaded!, jobApplicationNetworking, "2026-03-05")?.stepKey).toBe(
        "apply",
      );

      await itemRepo.archive(item.id);
      await itemRepo.setOutcome(item.id, "on_hold_2");
      loaded = await itemRepo.get(item.id);
      expect(loaded?.outcome).toBe("on_hold_2");
      expect(loaded?.updatedAt).toBe("2026-03-10T14:00:00.000Z");
    });

    it.each(["", "Interview", "1bad", "has space", "has-dash", "a".repeat(33)])(
      "rejects invalid outcome id: %s",
      async (badOutcome) => {
        const { itemRepo } = await setup();
        const item = await itemRepo.create({
          title: "Acme",
          workflowId: jobApplicationNetworking.id,
          startDate: "2026-03-01",
        });

        await expect(itemRepo.setOutcome(item.id, badOutcome)).rejects.toThrow(
          ItemValidationError,
        );
      },
    );

    it("throws ItemNotFoundError on missing item", async () => {
      const { itemRepo } = await setup();
      await expect(itemRepo.setOutcome("missing", "reply")).rejects.toThrow(ItemNotFoundError);
    });
  });

  describe("contacts: addContact, updateContact, removeContact", () => {
    it("adds, updates, clears profileUrl, and removes contacts while bumping item.updated_at", async () => {
      const { db: conn, itemRepo } = await setup([
        "2026-03-10T09:00:00.000Z", // migration
        "2026-03-10T10:00:00.000Z", // create item
        "2026-03-10T11:00:00.000Z", // addContact
        "2026-03-10T12:00:00.000Z", // updateContact
        "2026-03-10T13:00:00.000Z", // empty updateContact (no-op)
        "2026-03-10T14:00:00.000Z", // removeContact
        "2026-03-10T15:00:00.000Z", // second removeContact (no-op)
      ]);

      const item = await itemRepo.create({
        title: "Contacts Co",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
      });

      const added = await itemRepo.addContact(item.id, {
        name: "  Jane Doe  ",
        profileUrl: "https://linkedin.com/in/jane",
      });
      expect(added).toStrictEqual({
        id: "id-2",
        name: "Jane Doe",
        profileUrl: "https://linkedin.com/in/jane",
        status: "pending",
      });

      let loaded = await itemRepo.get(item.id);
      expect(loaded?.contacts).toStrictEqual([added]);
      expect(loaded?.updatedAt).toBe("2026-03-10T11:00:00.000Z");

      await itemRepo.updateContact(item.id, added.id, {
        name: "Jane Updated",
        profileUrl: null,
        status: "accepted",
      });
      loaded = await itemRepo.get(item.id);
      expect(loaded?.contacts).toStrictEqual([
        { id: added.id, name: "Jane Updated", status: "accepted" },
      ]);
      expect(loaded?.updatedAt).toBe("2026-03-10T12:00:00.000Z");

      const batchSpy = vi.spyOn(conn, "batch");
      await itemRepo.updateContact(item.id, added.id, {});
      expect(batchSpy).not.toHaveBeenCalled();
      loaded = await itemRepo.get(item.id);
      expect(loaded?.updatedAt).toBe("2026-03-10T12:00:00.000Z");

      expect(await itemRepo.removeContact(item.id, added.id)).toBe(true);
      loaded = await itemRepo.get(item.id);
      expect(loaded?.contacts).toEqual([]);
      expect(loaded?.updatedAt).toBe("2026-03-10T13:00:00.000Z");

      expect(await itemRepo.removeContact(item.id, added.id)).toBe(false);
      loaded = await itemRepo.get(item.id);
      expect(loaded?.updatedAt).toBe("2026-03-10T13:00:00.000Z");
    });

    it("enforces item ownership and validation on contact mutations", async () => {
      const { itemRepo } = await setup();
      const item1 = await itemRepo.create({
        title: "Item 1",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
      });
      const item2 = await itemRepo.create({
        title: "Item 2",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
      });

      const c2 = await itemRepo.addContact(item2.id, { name: "Bob" });

      // Missing item
      await expect(itemRepo.addContact("missing", { name: "A" })).rejects.toThrow(
        ItemNotFoundError,
      );
      await expect(
        itemRepo.updateContact("missing", c2.id, { status: "accepted" }),
      ).rejects.toThrow(ItemNotFoundError);
      await expect(itemRepo.removeContact("missing", c2.id)).rejects.toThrow(ItemNotFoundError);

      // Contact belongs to another item
      await expect(
        itemRepo.updateContact(item1.id, c2.id, { status: "accepted" }),
      ).rejects.toThrow(ContactNotFoundError);
      await expect(itemRepo.updateContact(item1.id, c2.id, {})).rejects.toThrow(
        ContactNotFoundError,
      );
      expect(await itemRepo.removeContact(item1.id, c2.id)).toBe(false);
      expect((await itemRepo.get(item2.id))?.contacts).toHaveLength(1);

      // Validation errors
      await expect(
        itemRepo.addContact(item1.id, { name: "   ", profileUrl: "javascript:alert(1)" }),
      ).rejects.toThrow(ItemValidationError);
      await expect(
        itemRepo.updateContact(item2.id, c2.id, { profileUrl: "file:///etc/passwd" }),
      ).rejects.toThrow(ItemValidationError);
    });
  });
});
