import type { ISODate, TimeOfDay } from "@jobfollo/core";

/**
 * Returns the local calendar date as `YYYY-MM-DD` using local getters only.
 * Never uses `toISOString()` or `new Date("YYYY-MM-DD")`.
 */
export function localToday(now: Date = new Date()): ISODate {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns the local wall-clock time as 24-hour `HH:MM` using local getters only.
 */
export function localNowTime(now: Date = new Date()): TimeOfDay {
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
