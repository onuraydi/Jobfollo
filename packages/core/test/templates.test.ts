import { describe, expect, it } from "vitest";
import { jobApplicationNetworking } from "../src/index.js";

describe("job-application-networking template", () => {
  const { steps } = jobApplicationNetworking;
  const keys = steps.map((s) => s.key);

  it("has unique step keys", () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("anchors reference start or an existing step", () => {
    for (const s of steps) {
      if (s.anchor === "start") continue;
      expect(keys).toContain(s.anchor.slice("step:".length));
    }
  });

  it("matches the original spreadsheet cadence", () => {
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey["followup_1"]?.offsetDays).toBe(7);
    expect(byKey["followup_2"]?.offsetDays).toBe(14);
    expect(byKey["close"]?.suggestsOutcome).toBe("negative");
  });
});
