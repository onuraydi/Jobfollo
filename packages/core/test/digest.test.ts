import { describe, expect, it } from "vitest";
import {
  buildDigest,
  jobApplicationNetworking,
  type Item,
  type Workflow,
} from "../src/index.js";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    title: "Acme Corp",
    workflowId: jobApplicationNetworking.id,
    startDate: "2026-03-01",
    contacts: [{ name: "Jane Doe", status: "pending" }],
    steps: [],
    ...overrides,
  };
}

describe("buildDigest", () => {
  it("returns an empty digest when items list is empty", () => {
    expect(buildDigest([], [jobApplicationNetworking], "2026-03-10")).toEqual({
      date: "2026-03-10",
      overdue: [],
      today: [],
      upcoming: [],
      isEmpty: true,
    });
  });

  it("excludes future items by default when upcomingDays is omitted (0)", () => {
    const items = [
      makeItem({ id: "i1", title: "Tomorrow Co", startDate: "2026-03-11" }),
      makeItem({ id: "i2", title: "Next Week Co", startDate: "2026-03-15" }),
    ];
    const digest = buildDigest(items, [jobApplicationNetworking], "2026-03-10");
    expect(digest.overdue).toEqual([]);
    expect(digest.today).toEqual([]);
    expect(digest.upcoming).toEqual([]);
    expect(digest.isEmpty).toBe(true);
  });

  it("groups next steps into overdue, today, and upcoming within upcomingDays", () => {
    const items = [
      makeItem({ id: "i-overdue", title: "Overdue Co", startDate: "2026-03-07" }),
      makeItem({ id: "i-today", title: "Today Co", startDate: "2026-03-10" }),
      makeItem({ id: "i-upcoming", title: "Upcoming Co", startDate: "2026-03-12" }),
      makeItem({ id: "i-boundary", title: "Boundary Co", startDate: "2026-03-13" }),
      makeItem({ id: "i-far", title: "Far Co", startDate: "2026-03-14" }),
    ];

    const digest = buildDigest(items, [jobApplicationNetworking], "2026-03-10", {
      upcomingDays: 3,
    });

    expect(digest.date).toBe("2026-03-10");
    expect(digest.isEmpty).toBe(false);
    expect(digest.overdue).toEqual([
      {
        itemId: "i-overdue",
        itemTitle: "Overdue Co",
        stepKey: "apply",
        stepTitle: "Apply (mail or site)",
        stepTitles: { en: "Apply (mail or site)", tr: "Başvur (e-posta veya site)" },
        dueDate: "2026-03-07",
        daysLeft: -3,
      },
    ]);
    expect(digest.today).toEqual([
      {
        itemId: "i-today",
        itemTitle: "Today Co",
        stepKey: "apply",
        stepTitle: "Apply (mail or site)",
        stepTitles: { en: "Apply (mail or site)", tr: "Başvur (e-posta veya site)" },
        dueDate: "2026-03-10",
        daysLeft: 0,
      },
    ]);
    expect(digest.upcoming.map((r) => [r.itemId, r.daysLeft])).toEqual([
      ["i-upcoming", 2],
      ["i-boundary", 3],
    ]);
  });

  it("sorts each group by dueDate ascending then itemTitle case-insensitively", () => {
    const items = [
      makeItem({ id: "o1", title: "Alpha", startDate: "2026-03-09" }),
      makeItem({ id: "o2", title: "Zeta", startDate: "2026-03-06" }),
      makeItem({ id: "o3", title: "Beta", startDate: "2026-03-06" }),
      makeItem({ id: "t1", title: "Charlie", startDate: "2026-03-10" }),
      makeItem({ id: "t2", title: "alpha", startDate: "2026-03-10" }),
      makeItem({ id: "t3", title: "Bravo", startDate: "2026-03-10" }),
    ];

    const digest = buildDigest(items, [jobApplicationNetworking], "2026-03-10");

    expect(digest.overdue.map((r) => r.itemTitle)).toEqual(["Beta", "Zeta", "Alpha"]);
    expect(digest.today.map((r) => r.itemTitle)).toEqual(["alpha", "Bravo", "Charlie"]);
  });

  it("excludes items stopped by an outcome or with all steps completed", () => {
    const stoppedItem = makeItem({
      id: "stopped",
      title: "Stopped Co",
      startDate: "2026-03-01",
      outcome: "offer",
    });
    const completedItem = makeItem({
      id: "done",
      title: "Done Co",
      startDate: "2026-03-01",
      contacts: [{ name: "Jane", status: "not_accepted" }],
      steps: [
        { stepKey: "apply", completedOn: "2026-03-01" },
        { stepKey: "connect_request", completedOn: "2026-03-01" },
        { stepKey: "check_accept", completedOn: "2026-03-02" },
        { stepKey: "followup_1", completedOn: "2026-03-08" },
        { stepKey: "followup_2", completedOn: "2026-03-15" },
        { stepKey: "close", completedOn: "2026-03-18" },
      ],
    });

    const digest = buildDigest(
      [stoppedItem, completedItem],
      [jobApplicationNetworking],
      "2026-03-20",
      { upcomingDays: 7 },
    );

    expect(digest.isEmpty).toBe(true);
    expect(digest.overdue).toEqual([]);
    expect(digest.today).toEqual([]);
    expect(digest.upcoming).toEqual([]);
  });

  it("evaluates items across multiple workflows", () => {
    const simpleWorkflow: Workflow = {
      id: "simple",
      name: "Simple",
      steps: [{ key: "ping", title: "Send ping", anchor: "start", offsetDays: 2 }],
      stopOutcomes: ["done"],
    };

    const items = [
      makeItem({ id: "i1", title: "Job Co", workflowId: jobApplicationNetworking.id, startDate: "2026-03-10" }),
      makeItem({ id: "i2", title: "Client Co", workflowId: "simple", startDate: "2026-03-08" }),
    ];

    const digest = buildDigest(items, [jobApplicationNetworking, simpleWorkflow], "2026-03-10");
    expect(digest.today.map((r) => [r.itemTitle, r.stepKey])).toEqual([
      ["Client Co", "ping"],
      ["Job Co", "apply"],
    ]);
  });

  it("carries suggestsOutcome onto DigestRow when present", () => {
    const item = makeItem({
      id: "close-item",
      title: "Closing Co",
      startDate: "2026-03-01",
      contacts: [{ name: "Jane", status: "not_accepted" }],
      steps: [
        { stepKey: "apply", completedOn: "2026-03-01" },
        { stepKey: "connect_request", completedOn: "2026-03-01" },
        { stepKey: "check_accept", completedOn: "2026-03-02" },
        { stepKey: "followup_1", completedOn: "2026-03-08" },
        { stepKey: "followup_2", completedOn: "2026-03-15" },
      ],
    });

    const digest = buildDigest([item], [jobApplicationNetworking], "2026-03-18");
    expect(digest.today).toEqual([
      {
        itemId: "close-item",
        itemTitle: "Closing Co",
        stepKey: "close",
        stepTitle: "Mark as negative",
        stepTitles: { en: "Mark as negative", tr: "Olumsuz olarak işaretle" },
        dueDate: "2026-03-18",
        daysLeft: 0,
        suggestsOutcome: "negative",
      },
    ]);
  });

  it("handles month/year boundaries and leap day (2028-02-29)", () => {
    const items = [
      makeItem({ id: "mar1", title: "March Co", startDate: "2028-03-01" }),
      makeItem({ id: "feb29", title: "Leap Co", startDate: "2028-02-29" }),
    ];

    const digest = buildDigest(items, [jobApplicationNetworking], "2028-02-28", {
      upcomingDays: 2,
    });
    expect(digest.upcoming.map((r) => [r.itemId, r.dueDate, r.daysLeft])).toEqual([
      ["feb29", "2028-02-29", 1],
      ["mar1", "2028-03-01", 2],
    ]);
  });

  it.each([
    { label: "invalid today", today: "2026-02-29", upcomingDays: 0 },
    { label: "negative upcomingDays", today: "2026-03-10", upcomingDays: -1 },
    { label: "fractional upcomingDays", today: "2026-03-10", upcomingDays: 1.5 },
    { label: "NaN upcomingDays", today: "2026-03-10", upcomingDays: Number.NaN },
  ])("throws RangeError on $label", ({ today, upcomingDays }) => {
    expect(() =>
      buildDigest([], [jobApplicationNetworking], today, { upcomingDays }),
    ).toThrow(RangeError);
  });

  it("throws Error when an item references an unknown workflowId", () => {
    const item = makeItem({ workflowId: "missing-workflow" });
    expect(() =>
      buildDigest([item], [jobApplicationNetworking], "2026-03-10"),
    ).toThrow(/missing-workflow/);
  });

  it("does not mutate inputs", () => {
    const items = Object.freeze([Object.freeze(makeItem({ startDate: "2026-03-10" }))]);
    const workflows = Object.freeze([Object.freeze(jobApplicationNetworking)]);
    expect(() => buildDigest(items, workflows, "2026-03-10")).not.toThrow();
  });
});
