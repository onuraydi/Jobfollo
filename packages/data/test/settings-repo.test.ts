import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SETTING_KEYS,
  SettingValidationError,
  UnknownSettingError,
  builtInMigrations,
  createSettingsRepository,
  runMigrations,
  type SettingKey,
} from "../src/index.js";
import { createSqliteExecutor, type TestSqliteExecutor } from "./support/sqlite-executor.js";

describe("SettingsRepository", () => {
  let db: TestSqliteExecutor | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  async function setup() {
    db = createSqliteExecutor();
    await runMigrations(db, builtInMigrations, { nowIso: () => "2026-03-10T09:00:00.000Z" });
    const repo = createSettingsRepository(db);
    return { db, repo };
  }

  it("never allows an SMTP password or secret key in the settings registry", async () => {
    for (const key of SETTING_KEYS) {
      expect(key.toLowerCase()).not.toMatch(/pass|secret|token|credential/);
    }

    const { repo } = await setup();
    const badKey = "smtp.password" as SettingKey;
    await expect(repo.get(badKey)).rejects.toThrow(UnknownSettingError);
    await expect(repo.set(badKey, "s3cr3t" as never)).rejects.toThrow(UnknownSettingError);
    await expect(repo.reset(badKey)).rejects.toThrow(UnknownSettingError);
    await expect(
      repo.setMany({ "smtp.password": "s3cr3t" } as never),
    ).rejects.toThrow(UnknownSettingError);
  });

  it("returns defaults for all settings on an empty DB", async () => {
    const { repo } = await setup();

    expect(await repo.get("language")).toBe("system");
    expect(await repo.get("theme")).toBe("system");
    expect(await repo.get("appearance.palette")).toBe("ocean");
    expect(await repo.get("appearance.font")).toBe("system");
    expect(await repo.get("appearance.density")).toBe("comfortable");
    expect(await repo.get("reminders.enabled")).toBe(false);
    expect(await repo.get("reminders.sendTime")).toBe("09:00");
    expect(await repo.get("reminders.recipient")).toBeNull();
    expect(await repo.get("reminders.upcomingDays")).toBe(0);
    expect(await repo.get("smtp.host")).toBeNull();
    expect(await repo.get("smtp.port")).toBe(587);
    expect(await repo.get("smtp.security")).toBe("starttls");
    expect(await repo.get("smtp.username")).toBeNull();

    const all = await repo.getAll();
    expect(all).toStrictEqual({
      values: {
        language: "system",
        theme: "system",
        "appearance.palette": "ocean",
        "appearance.font": "system",
        "appearance.density": "comfortable",
        "scheduling.skipWeekends": false,
        "notifications.enabled": false,
        "goals.weeklyApplications": 5,
        "reminders.enabled": false,
        "reminders.sendTime": "09:00",
        "reminders.recipient": null,
        "reminders.upcomingDays": 0,
        "smtp.host": null,
        "smtp.port": 587,
        "smtp.security": "starttls",
        "smtp.username": null,
      },
      invalid: [],
    });
  });

  it("round-trips set, get, and reset for all supported keys", async () => {
    const { repo } = await setup();

    await repo.set("language", "tr");
    await repo.set("theme", "dark");
    await repo.set("reminders.enabled", true);
    await repo.set("reminders.sendTime", "23:59");
    await repo.set("reminders.recipient", "user@example.com");
    await repo.set("reminders.upcomingDays", 7);
    await repo.set("smtp.host", "smtp.gmail.com");
    await repo.set("smtp.port", 465);
    await repo.set("smtp.security", "tls");
    await repo.set("smtp.username", "user@example.com");

    expect((await repo.getAll()).values).toStrictEqual({
      language: "tr",
      theme: "dark",
      "appearance.palette": "ocean",
      "appearance.font": "system",
      "appearance.density": "comfortable",
      "scheduling.skipWeekends": false,
      "notifications.enabled": false,
      "goals.weeklyApplications": 5,
      "reminders.enabled": true,
      "reminders.sendTime": "23:59",
      "reminders.recipient": "user@example.com",
      "reminders.upcomingDays": 7,
      "smtp.host": "smtp.gmail.com",
      "smtp.port": 465,
      "smtp.security": "tls",
      "smtp.username": "user@example.com",
    });

    await repo.reset("smtp.port");
    expect(await repo.get("smtp.port")).toBe(587);

    await repo.set("reminders.recipient", null);
    expect(await repo.get("reminders.recipient")).toBeNull();
  });

  it("writes setMany atomically in ONE batch and writes nothing if any entry is invalid", async () => {
    const { db: conn, repo } = await setup();
    const batchSpy = vi.spyOn(conn, "batch");

    await repo.setMany({
      language: "en",
      theme: "light",
      "smtp.port": 2525,
    });
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(await repo.get("language")).toBe("en");
    expect(await repo.get("theme")).toBe("light");
    expect(await repo.get("smtp.port")).toBe(2525);

    batchSpy.mockClear();
    await expect(
      repo.setMany({
        language: "tr",
        "smtp.port": 99999,
      }),
    ).rejects.toThrow(SettingValidationError);

    expect(batchSpy).not.toHaveBeenCalled();
    expect(await repo.get("language")).toBe("en");
  });

  it.each([
    ["language", "fr"],
    ["theme", "blue"],
    ["reminders.enabled", "true"],
    ["reminders.sendTime", "24:00"],
    ["reminders.sendTime", "9:00"],
    ["reminders.sendTime", "12:60"],
    ["reminders.upcomingDays", -1],
    ["reminders.upcomingDays", 31],
    ["reminders.upcomingDays", 1.5],
    ["reminders.recipient", "a@b.com, c@d.com"],
    ["reminders.recipient", "a@b.com;c@d.com"],
    ["reminders.recipient", "Name <a@b.com>"],
    ["reminders.recipient", '"a"@b.com'],
    ["reminders.recipient", "a@b.com\r\nBcc:evil@x.com"],
    ["reminders.recipient", "has space@b.com"],
    ["reminders.recipient", `${"a".repeat(250)}@b.com`],
    ["smtp.host", "smtp://mail.example.com"],
    ["smtp.host", "mail example.com"],
    ["smtp.host", "a".repeat(254)],
    ["smtp.port", 0],
    ["smtp.port", 65536],
    ["smtp.port", 587.5],
    ["smtp.security", "none"],
    ["smtp.security", "plain"],
    ["smtp.username", "user\r\nname"],
    ["smtp.username", "user\0name"],
    ["smtp.username", "u".repeat(255)],
  ])("rejects invalid setting %s = %j", async (key, value) => {
    const { repo } = await setup();
    await expect(repo.set(key as SettingKey, value as never)).rejects.toThrow(
      SettingValidationError,
    );
  });

  it("handles corrupt stored values and ignores unknown stored keys from newer app versions", async () => {
    const { db: conn, repo } = await setup();

    await conn.batch([
      {
        sql: "INSERT INTO app_setting (key, value) VALUES (?, ?)",
        params: ["smtp.port", "{not json"],
      },
      {
        sql: "INSERT INTO app_setting (key, value) VALUES (?, ?)",
        params: ["language", JSON.stringify("klingon")],
      },
      {
        sql: "INSERT INTO app_setting (key, value) VALUES (?, ?)",
        params: ["future.featureFlag", JSON.stringify(true)],
      },
    ]);

    expect(await repo.get("smtp.port")).toBe(587);
    expect(await repo.get("language")).toBe("system");

    const all = await repo.getAll();
    expect(all.values["smtp.port"]).toBe(587);
    expect(all.values.language).toBe("system");
    expect(all.invalid.sort()).toEqual(["language", "smtp.port"]);

    // set() repairs a corrupt stored row
    await repo.set("smtp.port", 465);
    expect(await repo.get("smtp.port")).toBe(465);
    expect((await repo.getAll()).invalid).toEqual(["language"]);
  });
});
