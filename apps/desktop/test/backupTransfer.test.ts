import { jobApplicationNetworking, type Workflow } from "@jobfollo/core";
import {
  builtInMigrations,
  createItemRepository,
  createWorkflowRepository,
  runMigrations,
} from "@jobfollo/data";
import {
  createAdvancingClock,
  createSequentialIds,
  createSqliteExecutor,
  type TestSqliteExecutor,
} from "@jobfollo/data/testing";
import { afterEach, describe, expect, it } from "vitest";
import {
  createBackupPayload,
  parseBackupJson,
  restoreBackup,
} from "../src/transfer/index.js";

describe("JSON backup and restore", () => {
  let dbA: TestSqliteExecutor | undefined;
  let dbB: TestSqliteExecutor | undefined;

  afterEach(() => {
    dbA?.close();
    dbB?.close();
    dbA = undefined;
    dbB = undefined;
  });

  it("round-trips custom workflows, items, contacts, completed steps, outcomes, notes, and archive state across databases", async () => {
    dbA = createSqliteExecutor(":memory:");
    const clockA = createAdvancingClock();
    const idsA = createSequentialIds("ba");
    await runMigrations(dbA, builtInMigrations, clockA);
    const workflowsA = createWorkflowRepository(dbA, { clock: clockA, idGenerator: idsA });
    const itemsA = createItemRepository(dbA, workflowsA, { clock: clockA, idGenerator: idsA });

    const customWf: Workflow = {
      id: "custom-grant-v1",
      name: "Özel Hibe Akışı",
      steps: [
        { key: "draft", title: "Taslak hazırla", anchor: "start", offsetDays: 0 },
        { key: "submit", title: "Gönder", anchor: "step:draft", offsetDays: 3 },
      ],
      stopOutcomes: ["negative", "offer"],
    };
    await workflowsA.save(customWf);

    const item1 = await itemsA.create({
      title: "TÜBİTAK 1512",
      role: "Girişimci",
      channel: "Portal",
      workflowId: customWf.id,
      startDate: "2026-03-10",
      notes: "Belgeler hazır.",
      contacts: [
        {
          name: "Dr. Ali",
          profileUrl: "https://example.com/ali",
          status: "accepted",
        },
      ],
    });
    await itemsA.completeStep(item1.id, "draft", "2026-03-11");
    await itemsA.setOutcome(item1.id, "reply");

    const item2 = await itemsA.create({
      title: "Archived Application",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-01",
    });
    await itemsA.archive(item2.id);

    const payload = await createBackupPayload({
      workflows: workflowsA,
      items: itemsA,
      clock: clockA,
    });
    const json = JSON.stringify(payload);

    // Ensure no credentials or settings keys exist in the backup
    expect(json).not.toContain("smtp");
    expect(json).not.toContain("password");

    const parsed = parseBackupJson(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Restore into a completely fresh SQLite database
    dbB = createSqliteExecutor(":memory:");
    const clockB = createAdvancingClock();
    const idsB = createSequentialIds("bb");
    await runMigrations(dbB, builtInMigrations, clockB);
    const workflowsB = createWorkflowRepository(dbB, { clock: clockB, idGenerator: idsB });
    const itemsB = createItemRepository(dbB, workflowsB, { clock: clockB, idGenerator: idsB });

    const summary = await restoreBackup(
      { workflows: workflowsB, items: itemsB },
      parsed.payload,
    );
    expect(summary).toEqual({ workflowsRestored: 1, itemsRestored: 2 });

    const restoredWf = await workflowsB.get("custom-grant-v1");
    expect(restoredWf?.name).toBe("Özel Hibe Akışı");
    expect(restoredWf?.steps).toHaveLength(2);

    const restoredItems = await itemsB.list({ includeArchived: true });
    expect(restoredItems).toHaveLength(2);

    const tubitak = restoredItems.find((i) => i.title === "TÜBİTAK 1512");
    expect(tubitak?.outcome).toBe("reply");
    expect(tubitak?.notes).toBe("Belgeler hazır.");
    expect(tubitak?.contacts[0]?.name).toBe("Dr. Ali");
    expect(tubitak?.steps).toContainEqual({ stepKey: "draft", completedOn: "2026-03-11" });

    const archived = restoredItems.find((i) => i.title === "Archived Application");
    expect(archived?.archivedAt).toBeTruthy();
  });

  it("rejects malformed JSON, unsupported versions, and unsafe contact URLs", () => {
    expect(parseBackupJson("not json").ok).toBe(false);
    expect(parseBackupJson(JSON.stringify({ version: 99, customWorkflows: [], items: [] })).ok).toBe(
      false,
    );

    const unsafe = parseBackupJson(
      JSON.stringify({
        version: 1,
        exportedAt: "2026-03-10T10:00:00.000Z",
        customWorkflows: [],
        items: [
          {
            title: "Evil",
            workflowId: jobApplicationNetworking.id,
            startDate: "2026-03-10",
            archived: false,
            contacts: [{ name: "X", profileUrl: "javascript:alert(1)", status: "pending" }],
            steps: [],
          },
        ],
      }),
    );
    expect(unsafe.ok).toBe(false);
  });
});
