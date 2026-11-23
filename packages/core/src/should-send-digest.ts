import { isValidISODate } from "./date.js";
import type {
  ShouldSendDigestInput,
  ShouldSendDigestResult,
  TimeOfDay,
} from "./types.js";

const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DEFAULT_MAX_ATTEMPTS_PER_DAY = 3;

export function isValidTimeOfDay(value: string): value is TimeOfDay {
  return TIME_OF_DAY_RE.test(value);
}

function toMinutes(time: TimeOfDay): number {
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  return hours * 60 + minutes;
}

export function shouldSendDigest(
  input: ShouldSendDigestInput,
): ShouldSendDigestResult {
  if (!input.enabled) {
    return { send: false, reason: "disabled" };
  }

  if (!isValidISODate(input.today)) {
    return { send: false, reason: "invalid_date" };
  }

  if (!isValidTimeOfDay(input.nowTime) || !isValidTimeOfDay(input.sendTime)) {
    return { send: false, reason: "invalid_time" };
  }

  if (input.alreadySentToday) {
    return { send: false, reason: "already_sent" };
  }

  const maxAttempts = input.maxAttemptsPerDay ?? DEFAULT_MAX_ATTEMPTS_PER_DAY;
  const failures = Math.max(0, input.failureCountToday);
  if (maxAttempts <= 0 || failures >= maxAttempts) {
    return { send: false, reason: "max_attempts_reached" };
  }

  if (toMinutes(input.nowTime) < toMinutes(input.sendTime)) {
    return { send: false, reason: "before_send_time" };
  }

  if (input.digest.isEmpty && !input.sendIfEmpty) {
    return { send: false, reason: "empty_digest" };
  }

  return { send: true };
}
