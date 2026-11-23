import {
  freelanceClientOutreach,
  jobApplicationNetworking,
} from "@jobfollo/core";
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
import { exportItemsToCsv, parseItemsFromCsv } from "../src/transfer/index.js";

describe("CSV export and import", () => {
  let dbA: TestSqliteExecutor | undefined;
  let dbB: TestSqliteExecutor | undefined;

  afterEach(() => {
    dbA?.close();
    dbB?.close();
    dbA = undefined;
    dbB = undefined;
  });

  it("exports UTF-8 BOM CSV with formula-injection protection and round-trips through a fresh SQLite database", async () => {
    dbA = createSqliteExecutor(":memory:");
    const clockA = createAdvancingClock();
    const idsA = createSequentialIds("ex");
    await runMigrations(dbA, builtInMigrations, clockA);
    const wfA = createWorkflowRepository(dbA, { clock: clockA, idGenerator: idsA });
    const itemsA = createItemRepository(dbA, wfA, { clock: clockA, idGenerator: idsA });

    const created1 = await itemsA.create({
      title: "Çağrı Teknoloji",
      role: "Kıdemli Geliştirici",
      channel: "LinkedIn",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-10",
      notes: "İstanbul ofisi,\n\"hızlı\" dönüş",
      contacts: [
        {
          name: "Ayşe Yılmaz",
          profileUrl: "https://linkedin.com/in/ayse",
          status: "accepted",
        },
      ],
    });
    await itemsA.setOutcome(created1.id, "interview");

    const created2 = await itemsA.create({
      title: "=CMD('calc')",
      workflowId: freelanceClientOutreach.id,
      startDate: "2026-03-11",
    });
    await itemsA.archive(created2.id);

    const exported = exportItemsToCsv(await itemsA.list({ includeArchived: true }));

    // UTF-8 BOM for Excel Turkish character support
    expect(exported.startsWith("\uFEFF")).toBe(true);
    // Formula injection neutralized with leading apostrophe
    expect(exported).toContain("'=CMD('calc')");

    // Re-import into a completely fresh SQLite database
    dbB = createSqliteExecutor(":memory:");
    const clockB = createAdvancingClock();
    const idsB = createSequentialIds("im");
    await runMigrations(dbB, builtInMigrations, clockB);
    const wfB = createWorkflowRepository(dbB, { clock: clockB, idGenerator: idsB });
    const itemsB = createItemRepository(dbB, wfB, { clock: clockB, idGenerator: idsB });

    const parsed = parseItemsFromCsv(exported, {
      defaultWorkflowId: jobApplicationNetworking.id,
      defaultStartDate: "2026-03-10",
      validWorkflowIds: new Set([
        jobApplicationNetworking.id,
        freelanceClientOutreach.id,
      ]),
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(2);

    for (const row of parsed.rows) {
      const imported = await itemsB.create(row.input);
      if (row.outcome) await itemsB.setOutcome(imported.id, row.outcome);
      if (row.archived) await itemsB.archive(imported.id);
    }

    const loadedB = await itemsB.list({ includeArchived: true });
    const cagri = loadedB.find((i) => i.title === "Çağrı Teknoloji");
    expect(cagri).toBeDefined();
    expect(cagri?.role).toBe("Kıdemli Geliştirici");
    expect(cagri?.outcome).toBe("interview");
    expect(cagri?.notes).toBe("İstanbul ofisi,\n\"hızlı\" dönüş");
    expect(cagri?.contacts[0]?.name).toBe("Ayşe Yılmaz");
    expect(cagri?.contacts[0]?.status).toBe("accepted");
  });

  it("parses semicolon-delimited Turkish Excel CSV and reports invalid rows cleanly", () => {
    const turkishCsv = [
      "Şirket;Rol;Tarih;Profil;Notlar",
      "Anadolu Yazılım;Frontend;2026-03-12;https://example.com/a;İyi görüşme",
      ";Boş Başlık;2026-03-12;;",
      "Kötü Tarih;Backend;2026-02-30;;",
      "Kötü Link;QA;2026-03-12;javascript:alert(1);",
    ].join("\r\n");

    const parsed = parseItemsFromCsv(turkishCsv, {
      defaultWorkflowId: jobApplicationNetworking.id,
      defaultStartDate: "2026-03-10",
      validWorkflowIds: new Set([jobApplicationNetworking.id]),
    });

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.input.title).toBe("Anadolu Yazılım");
    expect(parsed.rows[0]?.input.role).toBe("Frontend");
    expect(parsed.rows[0]?.input.startDate).toBe("2026-03-12");
    expect(parsed.errors.map((e) => e.rowNumber)).toEqual([3, 4, 5]);
  });
});
