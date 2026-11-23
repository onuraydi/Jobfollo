import { isValidISODate, type ISODate } from "@jobfollo/core";
import { randomIdGenerator, systemClock } from "./defaults.js";
import { AlreadySentError } from "./errors.js";
import type {
  Clock,
  IdGenerator,
  ReminderLogEntry,
  ReminderLogRepository,
  ReminderLogStatus,
  SqlExecutor,
} from "./types.js";
import { isValidIntegerInRange, normalizeReminderError } from "./validation.js";

const DEFAULT_RECENT_LIMIT = 20;
const MAX_RECENT_LIMIT = 200;

function assertValidDate(date: ISODate): void {
  if (typeof date !== "string" || !isValidISODate(date)) {
    throw new RangeError(`Invalid ISO date: "${String(date)}"`);
  }
}

function assertValidAttempt(attempt: number): void {
  if (typeof attempt !== "number" || !Number.isInteger(attempt) || attempt < 1) {
    throw new RangeError(`Attempt must be an integer >= 1, got: ${String(attempt)}`);
  }
}

interface ReminderLogRow {
  date: ISODate;
  status: ReminderLogStatus;
  attempt: number;
  error: string | null;
  created_at: string;
}

export interface ReminderLogRepositoryDeps {
  clock?: Clock;
  idGenerator?: IdGenerator;
}

export function createReminderLogRepository(
  executor: SqlExecutor,
  deps: ReminderLogRepositoryDeps = {},
): ReminderLogRepository {
  const clock = deps.clock ?? systemClock;
  const idGenerator = deps.idGenerator ?? randomIdGenerator;

  async function recordSent(date: ISODate, attempt = 1): Promise<void> {
    assertValidDate(date);
    assertValidAttempt(attempt);

    const results = await executor.batch([
      {
        sql: `INSERT INTO reminder_log (id, date, status, attempt, error, created_at)
              SELECT ?, ?, 'sent', ?, NULL, ?
              WHERE NOT EXISTS (
                SELECT 1 FROM reminder_log WHERE date = ? AND status = 'sent'
              )`,
        params: [idGenerator.newId(), date, attempt, clock.nowIso(), date],
      },
    ]);

    if ((results[0]?.rowsAffected ?? 0) === 0) {
      throw new AlreadySentError(date);
    }
  }

  async function recordFailure(date: ISODate, error: string, attempt: number): Promise<void> {
    assertValidDate(date);
    assertValidAttempt(attempt);

    const normalizedError = normalizeReminderError(error);
    await executor.batch([
      {
        sql: `INSERT INTO reminder_log (id, date, status, attempt, error, created_at)
              VALUES (?, ?, 'failed', ?, ?, ?)`,
        params: [idGenerator.newId(), date, attempt, normalizedError, clock.nowIso()],
      },
    ]);
  }

  async function wasSentOn(date: ISODate): Promise<boolean> {
    assertValidDate(date);
    const rows = await executor.select<{ found: number }>(
      "SELECT 1 AS found FROM reminder_log WHERE date = ? AND status = 'sent' LIMIT 1",
      [date],
    );
    return rows.length > 0;
  }

  async function lastSentDate(): Promise<ISODate | null> {
    const rows = await executor.select<{ max_date: ISODate | null }>(
      "SELECT MAX(date) AS max_date FROM reminder_log WHERE status = 'sent'",
    );
    return rows[0]?.max_date ?? null;
  }

  async function failureCountOn(date: ISODate): Promise<number> {
    assertValidDate(date);
    const rows = await executor.select<{ count: number }>(
      "SELECT COUNT(*) AS count FROM reminder_log WHERE date = ? AND status = 'failed'",
      [date],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async function recent(limit = DEFAULT_RECENT_LIMIT): Promise<ReminderLogEntry[]> {
    if (!isValidIntegerInRange(limit, 1, MAX_RECENT_LIMIT)) {
      throw new RangeError(
        `limit must be an integer between 1 and ${MAX_RECENT_LIMIT}, got: ${String(limit)}`,
      );
    }

    const rows = await executor.select<ReminderLogRow>(
      `SELECT date, status, attempt, error, created_at
       FROM reminder_log
       ORDER BY created_at DESC, rowid DESC
       LIMIT ?`,
      [limit],
    );

    return rows.map((row): ReminderLogEntry => {
      const entry: ReminderLogEntry = {
        date: row.date,
        status: row.status,
        attempt: row.attempt,
        createdAt: row.created_at,
      };
      if (row.error !== null) {
        entry.error = row.error;
      }
      return entry;
    });
  }

  return {
    recordSent,
    recordFailure,
    wasSentOn,
    lastSentDate,
    failureCountOn,
    recent,
  };
}
