import { describe, expect, it } from "vitest";
import { formatDisplayDate } from "../src/time/index.js";

describe("formatDisplayDate", () => {
  it("formats calendar dates in EN and TR without UTC day shift", () => {
    const enLeap = formatDisplayDate("2028-02-29", "en");
    expect(enLeap).toContain("29");
    expect(enLeap).toContain("2028");

    const trLeap = formatDisplayDate("2028-02-29", "tr");
    expect(trLeap).toContain("29");
    expect(trLeap).toContain("2028");

    const enNewYear = formatDisplayDate("2027-01-01", "en");
    expect(enNewYear).toContain("2027");
    expect(enNewYear).toContain("1");
  });

  it("throws RangeError on invalid ISO date", () => {
    expect(() => formatDisplayDate("2026-02-29", "en")).toThrow(RangeError);
    expect(() => formatDisplayDate("not-a-date", "tr")).toThrow(RangeError);
  });
});
