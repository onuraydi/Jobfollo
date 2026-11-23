import type { ISODate } from "./types.js";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

function parseISODate(s: string): readonly [number, number, number] | null {
  if (typeof s !== "string") {
    return null;
  }
  const match = ISO_DATE_RE.exec(s);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) {
    return null;
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return [year, month, day] as const;
}

/**
 * Pure integer Gregorian calendar -> days since 1970-01-01 (Howard Hinnant's algorithm).
 * Immune to local timezones and DST.
 */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * Pure integer days since 1970-01-01 -> Gregorian calendar tuple [year, month, day].
 */
function civilFromDays(days: number): readonly [number, number, number] {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  const year = month <= 2 ? y + 1 : y;
  return [year, month, day] as const;
}

function formatISODate(year: number, month: number, day: number): ISODate {
  if (year < 0 || year > 9999) {
    throw new RangeError(`Year out of supported ISO range (0000-9999): ${year}`);
  }
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isValidISODate(s: string): s is ISODate {
  return parseISODate(s) !== null;
}

export function addDays(date: ISODate, n: number): ISODate {
  const parts = parseISODate(date);
  if (!parts) {
    throw new RangeError(`Invalid ISO date: "${date}"`);
  }
  if (typeof n !== "number" || !Number.isInteger(n)) {
    throw new RangeError(`Day offset must be an integer, got: ${String(n)}`);
  }
  const targetDays = daysFromCivil(parts[0], parts[1], parts[2]) + n;
  const [year, month, day] = civilFromDays(targetDays);
  return formatISODate(year, month, day);
}

/**
 * Signed integer day difference from `a` to `b` (`b - a`).
 * Negative when `b` is before `a`, 0 when equal, positive when `b` is after `a`.
 */
export function diffDays(a: ISODate, b: ISODate): number {
  const partsA = parseISODate(a);
  if (!partsA) {
    throw new RangeError(`Invalid ISO date: "${a}"`);
  }
  const partsB = parseISODate(b);
  if (!partsB) {
    throw new RangeError(`Invalid ISO date: "${b}"`);
  }
  const diff = daysFromCivil(partsB[0], partsB[1], partsB[2]) - daysFromCivil(partsA[0], partsA[1], partsA[2]);
  return diff === 0 ? 0 : diff;
}
