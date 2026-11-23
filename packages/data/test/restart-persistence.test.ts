import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  blankWorkflow,
  buildDigest,
  computeNextStep,
  freelanceClientOutreach,
  grantScholarship,
  jobApplicationNetworking,
  renderDigest,
  type Workflow,
} from "@jobfollo/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  builtInMigrations,
  createItemRepository,
  createReminderLogRepository,
  createSettingsRepository,
  createWorkflowRepository,
  runMigrations,
  type Clock,
  type IdGenerator,
  type Migration,
  type StoredItem,
} from "../src/index.js";
import {
  createSqliteExecutor,
  withBatchFailure,
  type TestSqliteExecutor,
} from "./support/sqlite-executor.js";

const TODAY = "2026-11-10";

function createAdvancingClock(startEpochMs = Date.UTC(2026, 10, 10, 9, 0, 0)): Clock {
  let current = startEpochMs;
  return {
    nowIso(): string {
      const iso = new Date(current).toISOString();
      current += 1000;
      return iso;
    },
  };
}

function createSequentialIds(prefix = "id"): IdGenerator {
  let n = 1;
  return {
    newId: () => `${prefix}-${n++}`,
  };
}

describe("Phase 2 exit test — restart persistence & integration", () => {
  const openExecutors: TestSqliteExecutor[] = [];
  const tempDirs: string[] = [];

  function createTempDbPath(): string {
    const dir = mkdtempSync(join(tmpdir(), "jobfollo-data-test-"));
    tempDirs.push(dir);
    return join(dir, "jobfollo.sqlite");
  }

  function openDb(dbPath: string): TestSqliteExecutor {
    const exec = createSqliteExecutor(dbPath);
    openExecutors.push(exec);
    return exec;
  }

  function closeDb(exec: TestSqliteExecutor): void {
    const idx = openExecutors.indexOf(exec);
    if (idx !== -1) {
      openExecutors.splice(idx, 1);
    }
    exec.close();
  }

  afterEach(() => {
    while (openExecutors.length > 0) {
      openExecutors.pop()?.close();
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists the full dataset across restart and produces exact core schedules, digests, and renders", async () => {
    const dbPath = createTempDbPath();
    const clock = createAdvancingClock();
    const idGenerator = createSequentialIds("ent");

    const customWorkflow: Workflow = {
      id: "custom-demo",
      name: "Özel akış",
      steps: [
        { key: "a", title: "Adım A", anchor: "start", offsetDays: 0 },
        { key: "b", title: "Adım B", anchor: "step:a", offsetDays: 5 },
      ],
      stopOutcomes: ["negative"],
    };

    // --- Connection A: migrate and populate ---
    const connA = openDb(dbPath);
    const migrateA = await runMigrations(connA, builtInMigrations, clock);
    expect(migrateA).toEqual({ applied: [1], currentVersion: 1 });

    const wfRepoA = createWorkflowRepository(connA, { clock, idGenerator });
    const itemRepoA = createItemRepository(connA, wfRepoA, { clock, idGenerator });
    const settingsRepoA = createSettingsRepository(connA);
    const logRepoA = createReminderLogRepository(connA, { clock, idGenerator });

    await wfRepoA.save(customWorkflow);

    // 1. Acme Yazılım
    const acme = await itemRepoA.create({
      title: "Acme Yazılım",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-11-02",
      contacts: [{ name: "Ayşe Yılmaz", status: "pending" }],
    });
    await itemRepoA.completeStep(acme.id, "apply", "2026-11-02");
    await itemRepoA.completeStep(acme.id, "connect_request", "2026-11-02");
    await itemRepoA.completeStep(acme.id, "check_accept", "2026-11-03", {
      contactStatuses: [{ contactId: acme.contacts[0]!.id, status: "accepted" }],
    });

    // 2. Çağrı Teknoloji
    const cagri = await itemRepoA.create({
      title: "Çağrı Teknoloji",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-11-10",
    });

    // 3. Şirket Ltd
    const sirket = await itemRepoA.create({
      title: "Şirket Ltd",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-11-01",
      contacts: [{ name: "Mehmet Demir", status: "pending" }],
    });
    await itemRepoA.completeStep(sirket.id, "apply", "2026-11-01");
    await itemRepoA.completeStep(sirket.id, "connect_request", "2026-11-01");
    await itemRepoA.completeStep(sirket.id, "check_accept", "2026-11-02", {
      contactStatuses: [{ contactId: sirket.contacts[0]!.id, status: "not_accepted" }],
    });
    await itemRepoA.completeStep(sirket.id, "followup_1", "2026-11-08");

    // 4. Beta İş
    const beta = await itemRepoA.create({
      title: "Beta İş",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-11-03",
    });
    await itemRepoA.setOutcome(beta.id, "reply");

    // 5. Freelance: Logo projesi (anchor: "start", offsetDays: 3 -> 2026-11-07 + 3 = 2026-11-10)
    const freelance = await itemRepoA.create({
      title: "Freelance: Logo projesi",
      workflowId: freelanceClientOutreach.id,
      startDate: "2026-11-07",
    });
    await itemRepoA.completeStep(freelance.id, "send_proposal", "2026-11-07");

    // 6. Burs başvurusu
    const burs = await itemRepoA.create({
      title: "Burs başvurusu",
      workflowId: grantScholarship.id,
      startDate: "2026-11-03",
    });
    await itemRepoA.completeStep(burs.id, "submit", "2026-11-03");

    // 7. Genel görev
    const genel = await itemRepoA.create({
      title: "Genel görev",
      workflowId: blankWorkflow.id,
      startDate: "2026-11-01",
    });

    // 8. Eski başvuru (archived)
    const eski = await itemRepoA.create({
      title: "Eski başvuru",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-10-01",
    });
    await itemRepoA.archive(eski.id);

    // 9. Özel akış örneği
    const ozel = await itemRepoA.create({
      title: "Özel akış örneği",
      workflowId: customWorkflow.id,
      startDate: "2026-11-04",
    });
    await itemRepoA.completeStep(ozel.id, "a", "2026-11-04");

    // Settings & reminder log
    await settingsRepoA.setMany({
      language: "tr",
      theme: "dark",
      "reminders.enabled": true,
      "reminders.sendTime": "08:30",
      "reminders.recipient": "onur@example.com",
      "reminders.upcomingDays": 7,
      "smtp.host": "smtp.example.com",
      "smtp.port": 587,
      "smtp.security": "starttls",
      "smtp.username": "onur@example.com",
    });
    await logRepoA.recordFailure("2026-11-09", "Temporary timeout", 1);
    await logRepoA.recordSent("2026-11-09", 2);

    // Capture exact snapshots from connection A
    const allIds = [
      acme.id,
      cagri.id,
      sirket.id,
      beta.id,
      freelance.id,
      burs.id,
      genel.id,
      eski.id,
      ozel.id,
    ];
    const capturedFromA = new Map<string, StoredItem>();
    for (const id of allIds) {
      const loaded = await itemRepoA.get(id);
      expect(loaded).not.toBeNull();
      capturedFromA.set(id, loaded!);
    }

    const migrationsRowsA = await connA.select(
      "SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version",
    );

    closeDb(connA);

    // --- Connection B: reopen file database ---
    const connB = openDb(dbPath);
    const migrateB = await runMigrations(connB, builtInMigrations, clock);
    expect(migrateB).toEqual({ applied: [], currentVersion: 1 });

    const migrationsRowsB = await connB.select(
      "SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version",
    );
    expect(migrationsRowsB).toStrictEqual(migrationsRowsA);

    // SQLite integrity & foreign key checks
    const integrity = await connB.select<{ integrity_check: string }>("PRAGMA integrity_check");
    expect(integrity).toEqual([{ integrity_check: "ok" }]);
    const fkCheck = await connB.select("PRAGMA foreign_key_check");
    expect(fkCheck).toEqual([]);

    const wfRepoB = createWorkflowRepository(connB, { clock, idGenerator });
    const itemRepoB = createItemRepository(connB, wfRepoB, { clock, idGenerator });
    const settingsRepoB = createSettingsRepository(connB);
    const logRepoB = createReminderLogRepository(connB, { clock, idGenerator });

    // Custom workflow deep-equal
    expect(await wfRepoB.get(customWorkflow.id)).toStrictEqual(customWorkflow);

    // Every item loaded with get(id) is toStrictEqual to connection A
    for (const id of allIds) {
      expect(await itemRepoB.get(id)).toStrictEqual(capturedFromA.get(id));
    }

    // Settings & reminder log survive
    expect((await settingsRepoB.getAll()).values).toStrictEqual({
      language: "tr",
      theme: "dark",
      "reminders.enabled": true,
      "reminders.sendTime": "08:30",
      "reminders.recipient": "onur@example.com",
      "reminders.upcomingDays": 7,
      "smtp.host": "smtp.example.com",
      "smtp.port": 587,
      "smtp.security": "starttls",
      "smtp.username": "onur@example.com",
    });
    expect(await logRepoB.wasSentOn("2026-11-09")).toBe(true);
    expect(await logRepoB.wasSentOn("2026-11-10")).toBe(false);
    expect(await logRepoB.lastSentDate()).toBe("2026-11-09");

    // Verify list() excludes archived Eski başvuru
    const activeItems = await itemRepoB.list();
    expect(activeItems.map((i) => i.title)).not.toContain("Eski başvuru");
    expect(activeItems).toHaveLength(8);

    // Verify per-item computeNextStep hand-written expectations on 2026-11-10
    const workflows = (await wfRepoB.listAll()).map((entry) => entry.workflow);
    const byId = new Map(workflows.map((w) => [w.id, w]));

    const nextFor = async (id: string) => {
      const item = (await itemRepoB.get(id))!;
      return computeNextStep(item, byId.get(item.workflowId)!, TODAY);
    };

    expect(await nextFor(acme.id)).toMatchObject({
      stepKey: "first_message",
      dueDate: "2026-11-03",
      daysLeft: -7,
    });
    expect(await nextFor(cagri.id)).toMatchObject({
      stepKey: "apply",
      dueDate: "2026-11-10",
      daysLeft: 0,
    });
    expect(await nextFor(sirket.id)).toMatchObject({
      stepKey: "followup_2",
      dueDate: "2026-11-15",
      daysLeft: 5,
    });
    expect(await nextFor(beta.id)).toBeNull();
    expect(await nextFor(freelance.id)).toMatchObject({
      stepKey: "followup_1",
      dueDate: "2026-11-10",
      daysLeft: 0,
    });
    expect(await nextFor(burs.id)).toMatchObject({
      stepKey: "confirmation_check",
      dueDate: "2026-11-10",
      daysLeft: 0,
    });
    expect(await nextFor(genel.id)).toBeNull();
    expect(await nextFor(ozel.id)).toMatchObject({
      stepKey: "b",
      dueDate: "2026-11-09",
      daysLeft: -1,
    });

    // buildDigest with upcomingDays: 0
    const digest0 = buildDigest(activeItems, workflows, TODAY, { upcomingDays: 0 });
    expect(digest0.overdue.map((r) => r.itemTitle)).toEqual([
      "Acme Yazılım",
      "Özel akış örneği",
    ]);
    expect(digest0.today.map((r) => r.itemTitle)).toEqual([
      "Burs başvurusu",
      "Çağrı Teknoloji",
      "Freelance: Logo projesi",
    ]);
    expect(digest0.upcoming).toEqual([]);
    expect(digest0.isEmpty).toBe(false);

    // buildDigest with upcomingDays: 7
    const digest7 = buildDigest(activeItems, workflows, TODAY, { upcomingDays: 7 });
    expect(digest7.upcoming.map((r) => r.itemTitle)).toEqual(["Şirket Ltd"]);

    // renderDigest (en and tr)
    for (const locale of ["en", "tr"] as const) {
      const rendered = renderDigest(digest0, locale);
      expect(rendered.subject).toContain("3");
      expect(rendered.subject).toContain("2");

      for (const body of [rendered.text, rendered.html]) {
        const expectedOrder = [
          "Acme Yazılım",
          "Özel akış örneği",
          "Burs başvurusu",
          "Çağrı Teknoloji",
          "Freelance: Logo projesi",
        ];
        let lastIndex = -1;
        for (const title of expectedOrder) {
          const idx = body.indexOf(title);
          expect(idx).toBeGreaterThan(lastIndex);
          lastIndex = idx;
        }
        expect(body).not.toContain("Beta İş");
        expect(body).not.toContain("Genel görev");
        expect(body).not.toContain("Eski başvuru");
      }
    }

    // Delete across restart (Connection B -> Connection C)
    await itemRepoB.delete(acme.id);
    closeDb(connB);

    const connC = openDb(dbPath);
    const wfRepoC = createWorkflowRepository(connC, { clock, idGenerator });
    const itemRepoC = createItemRepository(connC, wfRepoC, { clock, idGenerator });

    expect(await itemRepoC.get(acme.id)).toBeNull();
    expect(await connC.select("SELECT id FROM contact WHERE item_id = ?", [acme.id])).toEqual([]);
    expect(
      await connC.select("SELECT step_key FROM step_record WHERE item_id = ?", [acme.id]),
    ).toEqual([]);
  });

  it("rolls back failed create and completeStep batches cleanly across restart", async () => {
    const dbPath = createTempDbPath();
    const clock = createAdvancingClock();
    const idGenerator = createSequentialIds("atom");

    const connA = withBatchFailure(openDb(dbPath));
    await runMigrations(connA, builtInMigrations, clock);
    const wfRepoA = createWorkflowRepository(connA, { clock, idGenerator });
    const itemRepoA = createItemRepository(connA, wfRepoA, { clock, idGenerator });

    // Fail on statement 2 (contact insert) during create -> item row must roll back
    connA.failOnBatchStatement(2);
    await expect(
      itemRepoA.create({
        title: "Should Roll Back",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-11-01",
        contacts: [{ name: "Ghost Contact", status: "pending" }],
        steps: [{ stepKey: "apply", completedOn: "2026-11-01" }],
      }),
    ).rejects.toThrow();

    // Now create a real item, then fail completeStep on statement 2 (contact status update)
    const realItem = await itemRepoA.create({
      title: "Real Item",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-11-01",
      contacts: [{ name: "Jane", status: "pending" }],
    });
    const originalUpdatedAt = realItem.updatedAt;

    connA.failOnBatchStatement(2);
    await expect(
      itemRepoA.completeStep(realItem.id, "check_accept", "2026-11-02", {
        contactStatuses: [{ contactId: realItem.contacts[0]!.id, status: "accepted" }],
      }),
    ).rejects.toThrow();

    closeDb(connA);

    // Reopen and verify zero partial rows
    const connB = openDb(dbPath);
    const wfRepoB = createWorkflowRepository(connB, { clock, idGenerator });
    const itemRepoB = createItemRepository(connB, wfRepoB, { clock, idGenerator });

    const allItems = await itemRepoB.list({ includeArchived: true });
    expect(allItems).toHaveLength(1);
    expect(allItems[0]!.id).toBe(realItem.id);
    expect(allItems[0]!.steps).toEqual([]);
    expect(allItems[0]!.contacts).toEqual([
      { id: realItem.contacts[0]!.id, name: "Jane", status: "pending" },
    ]);
    expect(allItems[0]!.updatedAt).toBe(originalUpdatedAt);
  });

  it("supports forward migration and refuses to start with an older app version", async () => {
    const dbPath = createTempDbPath();
    const clock = createAdvancingClock();
    const idGenerator = createSequentialIds("mig");

    // Step 1: migrate with only 0001 and create an item
    const conn1 = openDb(dbPath);
    await runMigrations(conn1, builtInMigrations, clock);
    const wfRepo1 = createWorkflowRepository(conn1, { clock, idGenerator });
    const itemRepo1 = createItemRepository(conn1, wfRepo1, { clock, idGenerator });
    const created = await itemRepo1.create({
      title: "Survives Upgrade",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-11-01",
    });
    closeDb(conn1);

    // Step 2: reopen with [0001, fixture 0002]
    const fixture0002: Migration = {
      version: 2,
      name: "0002_add_item_priority",
      sql: "ALTER TABLE item ADD COLUMN priority TEXT;",
    };
    const conn2 = openDb(dbPath);
    const upgradeResult = await runMigrations(conn2, [...builtInMigrations, fixture0002], clock);
    expect(upgradeResult).toEqual({ applied: [2], currentVersion: 2 });

    const wfRepo2 = createWorkflowRepository(conn2, { clock, idGenerator });
    const itemRepo2 = createItemRepository(conn2, wfRepo2, { clock, idGenerator });
    expect(await itemRepo2.get(created.id)).toStrictEqual(created);
    closeDb(conn2);

    // Step 3: reopen with older app knowing only [0001] -> must refuse
    const conn3 = openDb(dbPath);
    await expect(runMigrations(conn3, builtInMigrations, clock)).rejects.toThrow(/newer/i);
  });
});
