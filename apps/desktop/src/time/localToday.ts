import type { ISODate } from "@jobfollo/core";

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
