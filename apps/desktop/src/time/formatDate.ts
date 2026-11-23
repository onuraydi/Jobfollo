import { isValidISODate, type ISODate, type Locale } from "@jobfollo/core";

/**
 * Formats an `ISODate` (`YYYY-MM-DD`) for display using `Intl.DateTimeFormat`.
 * Always builds the `Date` with local `new Date(y, m - 1, d)` — never `new Date(isoDate)`.
 */
export function formatDisplayDate(
  isoDate: ISODate,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  },
): string {
  if (!isValidISODate(isoDate)) {
    throw new RangeError(`Invalid ISO date: "${isoDate}"`);
  }
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  const localDate = new Date(year, month - 1, day);
  const bcp47 = locale === "tr" ? "tr-TR" : "en-US";
  return new Intl.DateTimeFormat(bcp47, options).format(localDate);
}
