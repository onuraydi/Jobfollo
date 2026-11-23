import {
  buildDigest,
  renderDigest,
  shouldSendDigest,
  type DigestSkipReason,
  type ISODate,
  type Locale,
  type TimeOfDay,
} from "@jobfollo/core";
import type { AppServices } from "../boot/index.js";
import { localNowTime } from "../time/index.js";

export type DigestCheckOutcome =
  | { status: "sent"; date: ISODate; attempt: number }
  | { status: "failed"; date: ISODate; attempt: number; error: string }
  | {
      status: "skipped";
      reason: DigestSkipReason | "incomplete_smtp_config" | "mail_unavailable";
    };

export interface DigestCheckOptions {
  locale: Locale;
  /** Optional wall-clock override for deterministic testing. */
  now?: Date;
  /** Optional explicit today override for deterministic testing. */
  todayOverride?: ISODate;
  /** Optional explicit HH:MM override for deterministic testing. */
  nowTimeOverride?: TimeOfDay;
}

export async function runDigestCheck(
  services: AppServices,
  options: DigestCheckOptions,
): Promise<DigestCheckOutcome> {
  const now = options.now ?? new Date();
  const today = options.todayOverride ?? services.localToday(now);
  const nowTime = options.nowTimeOverride ?? localNowTime(now);

  const [settingsResult, alreadySentToday, failureCountToday, items, workflowEntries] =
    await Promise.all([
      services.settings.getAll(),
      services.reminderLog.wasSentOn(today),
      services.reminderLog.failureCountOn(today),
      services.items.list(),
      services.workflows.listAll(),
    ]);

  const v = settingsResult.values;
  const workflows = workflowEntries.map((entry) => entry.workflow);
  const digest = buildDigest(items, workflows, today, {
    upcomingDays: v["reminders.upcomingDays"],
  });

  const decision = shouldSendDigest({
    enabled: v["reminders.enabled"],
    today,
    nowTime,
    sendTime: v["reminders.sendTime"],
    alreadySentToday,
    failureCountToday,
    digest,
  });

  if (!decision.send) {
    return { status: "skipped", reason: decision.reason };
  }

  if (!services.mail) {
    return { status: "skipped", reason: "mail_unavailable" };
  }

  const host = v["smtp.host"]?.trim() ?? "";
  const username = v["smtp.username"]?.trim() ?? "";
  const recipient = v["reminders.recipient"]?.trim() ?? "";
  const port = v["smtp.port"];
  const security = v["smtp.security"];

  if (!host || !username || !recipient) {
    return { status: "skipped", reason: "incomplete_smtp_config" };
  }

  const rendered = renderDigest(digest, options.locale);
  const attempt = failureCountToday + 1;

  try {
    await services.mail.sendEmail({
      host,
      port,
      security,
      username,
      recipient,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
    await services.reminderLog.recordSent(today, attempt);
    return { status: "sent", date: today, attempt };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await services.reminderLog.recordFailure(today, errorMessage, attempt);
    return { status: "failed", date: today, attempt, error: errorMessage };
  }
}
