import { describe, expect, it } from "vitest";
import { addDays, diffDays, isValidISODate } from "../src/index.js";

describe("isValidISODate", () => {
  it.each([
    "2026-01-01",
    "2026-04-30",
    "2026-12-31",
    "2024-02-29",
    "2028-02-29",
    "2000-02-29",
  ])("accepts valid date %s", (value) => {
    expect(isValidISODate(value)).toBe(true);
  });

  it.each([
    ["non-leap Feb 29 (2026)", "2026-02-29"],
    ["century non-leap Feb 29 (1900)", "1900-02-29"],
    ["century non-leap Feb 29 (2100)", "2100-02-29"],
    ["month 00", "2026-00-10"],
    ["month 13", "2026-13-01"],
    ["day 00", "2026-01-00"],
    ["day 32 in Jan", "2026-01-32"],
    ["day 31 in Apr", "2026-04-31"],
    ["empty string", ""],
    ["unpadded month/day", "2026-1-5"],
    ["2-digit year", "26-01-05"],
    ["slashes instead of hyphens", "2026/01/05"],
    ["ISO timestamp", "2026-01-05T00:00:00Z"],
    ["leading whitespace", " 2026-01-05"],
    ["trailing whitespace", "2026-01-05 "],
  ])("rejects invalid date: %s (%s)", (_label, value) => {
    expect(isValidISODate(value)).toBe(false);
  });
});

describe("addDays", () => {
  it.each([
    // Zero, positive, negative
    ["2026-05-10", 0, "2026-05-10"],
    ["2026-05-10", 7, "2026-05-17"],
    ["2026-05-10", -7, "2026-05-03"],
    // Month boundaries
    ["2026-01-31", 1, "2026-02-01"],
    ["2026-02-28", 1, "2026-03-01"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2026-04-30", 1, "2026-05-01"],
    // Year boundaries
    ["2026-12-31", 1, "2027-01-01"],
    ["2027-01-01", -1, "2026-12-31"],
    ["2026-12-25", 14, "2027-01-08"],
    // Leap day (2028-02-29)
    ["2028-02-28", 1, "2028-02-29"],
    ["2028-02-29", 1, "2028-03-01"],
    ["2028-03-01", -1, "2028-02-29"],
    ["2028-02-29", 365, "2029-02-28"],
    ["2028-02-29", 366, "2029-03-01"],
    // DST change weeks (US & EU spring/fall)
    ["2026-03-07", 2, "2026-03-09"],
    ["2026-03-28", 2, "2026-03-30"],
    ["2026-10-24", 2, "2026-10-26"],
    ["2026-10-31", 2, "2026-11-02"],
  ])("addDays(%s, %d) === %s", (date, n, expected) => {
    expect(addDays(date, n)).toBe(expected);
  });

  it.each([
    ["invalid date", "2026-02-29", 1],
    ["malformed date", "not-a-date", 1],
    ["fractional n", "2026-05-10", 1.5],
    ["NaN", "2026-05-10", Number.NaN],
    ["Infinity", "2026-05-10", Number.POSITIVE_INFINITY],
    ["-Infinity", "2026-05-10", Number.NEGATIVE_INFINITY],
  ])("throws RangeError on %s", (_label, date, n) => {
    expect(() => addDays(date, n)).toThrow(RangeError);
  });
});

describe("diffDays", () => {
  it.each([
    // Same day, future, overdue
    ["2026-05-10", "2026-05-10", 0],
    ["2026-05-10", "2026-05-17", 7],
    ["2026-05-17", "2026-05-10", -7],
    // Month & year boundaries
    ["2026-12-31", "2027-01-01", 1],
    ["2027-01-01", "2026-12-31", -1],
    // Leap year vs non-leap year
    ["2028-01-01", "2029-01-01", 366],
    ["2026-01-01", "2027-01-01", 365],
    ["2028-02-28", "2028-03-01", 2],
    // DST change weeks
    ["2026-03-07", "2026-03-14", 7],
    ["2026-03-28", "2026-04-04", 7],
    ["2026-10-24", "2026-11-07", 14],
  ])("diffDays(%s, %s) === %d", (a, b, expected) => {
    const result = diffDays(a, b);
    expect(result).toBe(expected);
    expect(Object.is(result, -0)).toBe(false);
  });

  it.each([
    ["2026-01-01", "2028-02-29"],
    ["2028-02-29", "2026-01-01"],
    ["2026-12-31", "2027-01-01"],
    ["2026-03-07", "2026-11-02"],
  ])("satisfies round-trip invariant for %s -> %s", (a, b) => {
    expect(addDays(a, diffDays(a, b))).toBe(b);
  });

  it.each([
    ["invalid first date", "2026-02-29", "2026-03-01"],
    ["invalid second date", "2026-03-01", "2026-02-29"],
    ["malformed string", "bad", "2026-03-01"],
  ])("throws RangeError on %s", (_label, a, b) => {
    expect(() => diffDays(a, b)).toThrow(RangeError);
  });
});
