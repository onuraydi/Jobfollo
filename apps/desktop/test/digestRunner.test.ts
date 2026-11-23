import { jobApplicationNetworking } from "@jobfollo/core";
import {
  builtInMigrations,
  createItemRepository,
  createReminderLogRepository,
  createSettingsRepository,
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
import type { AppServices } from "../src/boot/index.js";
import type { MailClient, SendEmailPayload } from "../src/mail/index.js";
import { runDigestCheck } from "../src/reminders/index.js";
import { localToday } from "../src/time/index.js";

describe("runDigestCheck (integration with real in-memory SQLite)", () => {
  let db: TestSqliteExecutor | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  async function setup(mail: MailClient): Promise<AppServices> {
    db = createSqliteExecutor(":memory:");
    const clock = createAdvancingClock();
    const idGenerator = createSequentialIds("dg");
    await runMigrations(db, builtInMigrations, clock);
    const workflows = createWorkflowRepository(db, { clock, idGenerator });
    const items = createItemRepository(db, workflows, { clock, idGenerator });
    const settings = createSettingsRepository(db);
    const reminderLog = createReminderLogRepository(db, { clock, idGenerator });

    await settings.setMany({
      "reminders.enabled": true,
      "reminders.sendTime": "09:00",
      "reminders.recipient": "me@example.com",
      "smtp.host": "smtp.example.com",
      "smtp.port": 587,
      "smtp.security": "starttls",
      "smtp.username": "me@example.com",
    });

    return {
      workflows,
      items,
      settings,
      reminderLog,
      clock,
      idGenerator,
      localToday,
      dataLocation: ":memory:",
      mail,
    };
  }

  function createFakeMail(shouldFail?: () => string | null): {
    client: MailClient;
    sent: SendEmailPayload[];
  } {
    const sent: SendEmailPayload[] = [];
    const client: MailClient = {
      async setPassword() {},
      async hasPassword() {
        return true;
      },
      async deletePassword() {},
      async sendEmail(payload) {
        const err = shouldFail?.();
        if (err) {
          throw new Error(err);
        }
        sent.push(payload);
      },
    };
    return { client, sent };
  }

  it("sends digest on catch-up after sendTime, logs sent, and prevents duplicate sends on the same day", async () => {
    const { client, sent } = createFakeMail();
    const services = await setup(client);

    await services.items.create({
      title: "Acme Corp",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-10",
    });

    // Catch-up at 11:30 (> 09:00)
    const first = await runDigestCheck(services, {
      locale: "tr",
      todayOverride: "2026-03-10",
      nowTimeOverride: "11:30",
    });
    expect(first).toEqual({ status: "sent", date: "2026-03-10", attempt: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain("Acme Corp");
    expect(await services.reminderLog.wasSentOn("2026-03-10")).toBe(true);

    // Second check later the same day must not resend
    const second = await runDigestCheck(services, {
      locale: "tr",
      todayOverride: "2026-03-10",
      nowTimeOverride: "15:00",
    });
    expect(second).toEqual({ status: "skipped", reason: "already_sent" });
    expect(sent).toHaveLength(1);
  });

  it("skips before sendTime and skips when digest is empty", async () => {
    const { client, sent } = createFakeMail();
    const services = await setup(client);

    // No items -> empty_digest after sendTime
    const empty = await runDigestCheck(services, {
      locale: "en",
      todayOverride: "2026-03-10",
      nowTimeOverride: "09:15",
    });
    expect(empty).toEqual({ status: "skipped", reason: "empty_digest" });

    await services.items.create({
      title: "Acme Corp",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-10",
    });

    // Before sendTime (08:59 < 09:00)
    const early = await runDigestCheck(services, {
      locale: "en",
      todayOverride: "2026-03-10",
      nowTimeOverride: "08:59",
    });
    expect(early).toEqual({ status: "skipped", reason: "before_send_time" });
    expect(sent).toHaveLength(0);
  });

  it("records failures in reminder_log and stops after 3 failed attempts", async () => {
    const { client, sent } = createFakeMail(() => "SMTP 535 Authentication failed");
    const services = await setup(client);

    await services.items.create({
      title: "Acme Corp",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-10",
    });

    for (let expectedAttempt = 1; expectedAttempt <= 3; expectedAttempt++) {
      const res = await runDigestCheck(services, {
        locale: "en",
        todayOverride: "2026-03-10",
        nowTimeOverride: "09:05",
      });
      expect(res).toEqual({
        status: "failed",
        date: "2026-03-10",
        attempt: expectedAttempt,
        error: "SMTP 535 Authentication failed",
      });
    }

    expect(await services.reminderLog.failureCountOn("2026-03-10")).toBe(3);

    // 4th attempt is skipped without calling sendEmail
    const fourth = await runDigestCheck(services, {
      locale: "en",
      todayOverride: "2026-03-10",
      nowTimeOverride: "10:00",
    });
    expect(fourth).toEqual({ status: "skipped", reason: "max_attempts_reached" });
    expect(sent).toHaveLength(0);
  });
});
