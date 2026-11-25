import { describe, expect, it } from "vitest";
import { builtInMigrations, createTemplateRepository, runMigrations } from "../src/index.js";
import { createSqliteExecutor } from "./support/sqlite-executor.js";

describe("TemplateRepository", () => {
  it("creates, lists, updates, and deletes custom email and message templates", async () => {
    const db = createSqliteExecutor();
    const clock = { nowIso: () => "2026-04-01T10:00:00.000Z" };
    await runMigrations(db, builtInMigrations, clock);

    let seq = 1;
    const repo = createTemplateRepository(db, {
      clock,
      idGenerator: { newId: () => `tpl-${seq++}` },
    });

    const created = await repo.create({
      name: "Özel başvuru maili",
      channel: "email",
      category: "application",
      subject: "{{role}} — {{company}}",
      body: "Merhaba {{contact}}, ekte CV'm yer alıyor.",
    });

    expect(created.id).toBe("tpl-1");
    expect(created.subject).toBe("{{role}} — {{company}}");

    const list = await repo.listCustom();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Özel başvuru maili");

    const updated = await repo.update(created.id, {
      name: "Güncel DM şablonu",
      channel: "message",
      body: "Selam {{contact}}, kısa bir takip.",
    });
    expect(updated?.channel).toBe("message");
    expect(updated?.subject).toBeUndefined();

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.listCustom()).toHaveLength(0);
  });
});
