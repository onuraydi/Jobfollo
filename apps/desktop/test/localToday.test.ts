import { describe, expect, it } from "vitest";
import { localToday } from "../src/time/index.js";

describe("localToday", () => {
  it("formats local calendar date with zero-padded month and day", () => {
    expect(localToday(new Date(2026, 0, 5, 12, 0, 0))).toBe("2026-01-05");
    expect(localToday(new Date(2028, 1, 29, 0, 1, 0))).toBe("2028-02-29");
    expect(localToday(new Date(2026, 11, 31, 23, 59, 59))).toBe("2026-12-31");
  });

  it("uses local getters rather than UTC", () => {
    const d = new Date(2026, 2, 10, 0, 30, 0);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(localToday(d)).toBe(expected);
  });
});
