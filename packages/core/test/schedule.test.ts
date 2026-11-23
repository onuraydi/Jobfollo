import { describe, expect, it } from "vitest";
import {
  computeSchedule,
  jobApplicationNetworking,
  type Item,
  type StepInstance,
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

function byKey(instances: StepInstance[]): Record<string, StepInstance> {
  return Object.fromEntries(instances.map((i) => [i.stepKey, i]));
}

describe("computeSchedule", () => {
  it("computes schedule for a fresh item on startDate", () => {
    const item = makeItem({ startDate: "2026-03-01" });
    const schedule = computeSchedule(item, jobApplicationNetworking, "2026-03-01");

    expect(schedule.map((s) => s.stepKey)).toEqual(
      jobApplicationNetworking.steps.map((s) => s.key),
    );

    const map = byKey(schedule);
    expect(map["apply"]).toEqual({
      stepKey: "apply",
      title: "Apply (mail or site)",
      titles: { en: "Apply (mail or site)", tr: "Başvur (e-posta veya site)" },
      dueDate: "2026-03-01",
      status: "due_today",
    });
    expect(map["connect_request"]).toMatchObject({ status: "blocked" });
    expect(map["connect_request"]?.dueDate).toBeUndefined();
    expect(map["check_accept"]).toMatchObject({ status: "blocked" });
    expect(map["check_accept"]?.dueDate).toBeUndefined();
    expect(map["first_message"]).toMatchObject({ status: "blocked" });
    expect(map["first_message"]?.dueDate).toBeUndefined();
    expect(map["followup_1"]).toMatchObject({
      dueDate: "2026-03-08",
      status: "pending",
    });
    expect(map["followup_2"]).toMatchObject({
      dueDate: "2026-03-15",
      status: "pending",
    });
    expect(map["close"]).toMatchObject({
      status: "blocked",
      suggestsOutcome: "negative",
    });
    expect(map["close"]?.dueDate).toBeUndefined();
  });

  it("distinguishes overdue, due_today, and pending steps", () => {
    const item = makeItem({ startDate: "2026-03-01" });
    const map = byKey(computeSchedule(item, jobApplicationNetworking, "2026-03-08"));

    expect(map["apply"]).toMatchObject({ dueDate: "2026-03-01", status: "overdue" });
    expect(map["followup_1"]).toMatchObject({ dueDate: "2026-03-08", status: "due_today" });
    expect(map["followup_2"]).toMatchObject({ dueDate: "2026-03-15", status: "pending" });
  });

  it("unlocks step-anchored steps when the anchor step is completed", () => {
    const item = makeItem({
      startDate: "2026-03-01",
      steps: [{ stepKey: "apply", completedOn: "2026-03-01" }],
    });
    const map = byKey(computeSchedule(item, jobApplicationNetworking, "2026-03-01"));

    expect(map["apply"]).toMatchObject({
      dueDate: "2026-03-01",
      completedOn: "2026-03-01",
      status: "done",
    });
    expect(map["connect_request"]).toMatchObject({
      dueDate: "2026-03-01",
      status: "due_today",
    });
    expect(map["check_accept"]).toMatchObject({ status: "blocked" });
    expect(map["check_accept"]?.dueDate).toBeUndefined();
  });

  it("anchors step:<key> to completion date when completed late without shifting start-anchored steps", () => {
    const item = makeItem({
      startDate: "2026-03-01",
      steps: [
        { stepKey: "apply", completedOn: "2026-03-04" },
        { stepKey: "connect_request", completedOn: "2026-03-05" },
      ],
    });
    const map = byKey(computeSchedule(item, jobApplicationNetworking, "2026-03-06"));

    expect(map["apply"]).toMatchObject({
      dueDate: "2026-03-01",
      completedOn: "2026-03-04",
      status: "done",
    });
    expect(map["connect_request"]).toMatchObject({
      dueDate: "2026-03-04",
      completedOn: "2026-03-05",
      status: "done",
    });
    expect(map["check_accept"]).toMatchObject({
      dueDate: "2026-03-06",
      status: "due_today",
    });
    expect(map["followup_1"]).toMatchObject({
      dueDate: "2026-03-08",
      status: "pending",
    });
  });

  describe("runIf contactStatus", () => {
    const completedThroughCheckAccept = [
      { stepKey: "apply", completedOn: "2026-03-01" },
      { stepKey: "connect_request", completedOn: "2026-03-01" },
      { stepKey: "check_accept", completedOn: "2026-03-02" },
    ];

    it("activates step when contactStatus matches runIf", () => {
      const item = makeItem({
        contacts: [{ name: "Jane Doe", status: "accepted" }],
        steps: completedThroughCheckAccept,
      });
      const map = byKey(computeSchedule(item, jobApplicationNetworking, "2026-03-02"));

      expect(map["first_message"]).toMatchObject({
        dueDate: "2026-03-02",
        status: "due_today",
      });
    });

    it.each([
      { label: "contact is not_accepted", contacts: [{ name: "Jane Doe", status: "not_accepted" as const }] },
      { label: "contact is still pending", contacts: [{ name: "Jane Doe", status: "pending" as const }] },
      { label: "contacts list is empty", contacts: [] },
    ])("skips step when $label", ({ contacts }) => {
      const item = makeItem({
        contacts,
        steps: completedThroughCheckAccept,
      });
      const map = byKey(computeSchedule(item, jobApplicationNetworking, "2026-03-02"));

      expect(map["first_message"]).toMatchObject({
        dueDate: "2026-03-02",
        status: "skipped",
      });
    });

    it("satisfies runIf when any of multiple contacts matches", () => {
      const item = makeItem({
        contacts: [
          { name: "Alice", status: "not_accepted" },
          { name: "Bob", status: "accepted" },
        ],
        steps: completedThroughCheckAccept,
      });
      const map = byKey(computeSchedule(item, jobApplicationNetworking, "2026-03-02"));

      expect(map["first_message"]).toMatchObject({
        dueDate: "2026-03-02",
        status: "due_today",
      });
    });
  });

  it("marks manually skipped steps as skipped and leaves downstream anchored steps blocked", () => {
    const item = makeItem({
      startDate: "2026-03-01",
      steps: [
        { stepKey: "apply", completedOn: "2026-03-01" },
        { stepKey: "connect_request", skipped: true },
      ],
    });
    const map = byKey(computeSchedule(item, jobApplicationNetworking, "2026-03-02"));

    expect(map["connect_request"]).toMatchObject({
      dueDate: "2026-03-01",
      status: "skipped",
    });
    expect(map["check_accept"]).toMatchObject({ status: "blocked" });
    expect(map["check_accept"]?.dueDate).toBeUndefined();
  });

  it("carries suggestsOutcome onto the step instance", () => {
    const item = makeItem({
      startDate: "2026-03-01",
      steps: [{ stepKey: "followup_2", completedOn: "2026-03-15" }],
    });
    const map = byKey(computeSchedule(item, jobApplicationNetworking, "2026-03-18"));

    expect(map["close"]).toEqual({
      stepKey: "close",
      title: "Mark as negative",
      titles: { en: "Mark as negative", tr: "Olumsuz olarak işaretle" },
      dueDate: "2026-03-18",
      status: "due_today",
      suggestsOutcome: "negative",
    });
  });

  it("handles month and year boundaries", () => {
    const item = makeItem({ startDate: "2026-12-28" });
    const map = byKey(computeSchedule(item, jobApplicationNetworking, "2027-01-04"));

    expect(map["followup_1"]).toMatchObject({ dueDate: "2027-01-04", status: "due_today" });
    expect(map["followup_2"]).toMatchObject({ dueDate: "2027-01-11", status: "pending" });
  });

  it("handles leap day (2028-02-29)", () => {
    const item = makeItem({ startDate: "2028-02-22" });
    const map = byKey(computeSchedule(item, jobApplicationNetworking, "2028-02-29"));

    expect(map["followup_1"]).toMatchObject({ dueDate: "2028-02-29", status: "due_today" });
    expect(map["followup_2"]).toMatchObject({ dueDate: "2028-03-07", status: "pending" });
  });

  it("returns an empty array for a blank workflow", () => {
    const blank: Workflow = { id: "blank", name: "Blank", steps: [], stopOutcomes: [] };
    expect(computeSchedule(makeItem({ workflowId: "blank" }), blank, "2026-03-01")).toEqual([]);
  });

  it("omits titles key on StepInstance when the step has no titles", () => {
    const custom: Workflow = {
      id: "custom",
      name: "Custom",
      steps: [{ key: "ping", title: "Ping", anchor: "start", offsetDays: 0 }],
      stopOutcomes: [],
    };
    const [inst] = computeSchedule(makeItem({ workflowId: "custom" }), custom, "2026-03-01");
    expect(inst).toBeDefined();
    expect("titles" in inst!).toBe(false);
  });

  it.each([
    { label: "invalid today", item: makeItem(), today: "2026-02-29" },
    { label: "invalid startDate", item: makeItem({ startDate: "2026-02-29" }), today: "2026-03-01" },
    {
      label: "invalid completedOn",
      item: makeItem({ steps: [{ stepKey: "apply", completedOn: "2026-13-01" }] }),
      today: "2026-03-01",
    },
  ])("throws RangeError on $label", ({ item, today }) => {
    expect(() => computeSchedule(item, jobApplicationNetworking, today)).toThrow(RangeError);
  });

  it("does not mutate inputs", () => {
    const item = Object.freeze(
      makeItem({
        contacts: Object.freeze([Object.freeze({ name: "Jane", status: "pending" as const })]) as Item["contacts"],
        steps: Object.freeze([Object.freeze({ stepKey: "apply", completedOn: "2026-03-01" })]) as Item["steps"],
      }),
    );
    const workflow = Object.freeze({
      ...jobApplicationNetworking,
      steps: Object.freeze(jobApplicationNetworking.steps.map((s) => Object.freeze({ ...s }))) as Workflow["steps"],
    });

    expect(() => computeSchedule(item, workflow, "2026-03-01")).not.toThrow();
  });

  describe("outcomes stop the flow", () => {
    it("marks all unfinished steps as stopped when a stopOutcome is set on a fresh item", () => {
      const item = makeItem({ startDate: "2026-03-01", outcome: "negative" });
      const schedule = computeSchedule(item, jobApplicationNetworking, "2026-03-08");
      const map = byKey(schedule);

      for (const step of schedule) {
        expect(step.status).toBe("stopped");
      }
      expect(map["apply"]?.dueDate).toBe("2026-03-01");
      expect(map["followup_1"]?.dueDate).toBe("2026-03-08");
      expect(map["followup_2"]?.dueDate).toBe("2026-03-15");
      expect(map["connect_request"]?.dueDate).toBeUndefined();
    });

    it("preserves done and runIf-skipped steps while stopping remaining steps mid-flow", () => {
      const item = makeItem({
        startDate: "2026-03-01",
        contacts: [{ name: "Jane Doe", status: "not_accepted" }],
        steps: [
          { stepKey: "apply", completedOn: "2026-03-01" },
          { stepKey: "connect_request", completedOn: "2026-03-01" },
          { stepKey: "check_accept", completedOn: "2026-03-02" },
        ],
        outcome: "interview",
      });
      const map = byKey(computeSchedule(item, jobApplicationNetworking, "2026-03-08"));

      expect(map["apply"]?.status).toBe("done");
      expect(map["connect_request"]?.status).toBe("done");
      expect(map["check_accept"]?.status).toBe("done");
      expect(map["first_message"]?.status).toBe("skipped");
      expect(map["followup_1"]?.status).toBe("stopped");
      expect(map["followup_2"]?.status).toBe("stopped");
      expect(map["close"]?.status).toBe("stopped");
    });

    it("preserves manually skipped steps when a stopOutcome is set", () => {
      const item = makeItem({
        startDate: "2026-03-01",
        steps: [
          { stepKey: "apply", completedOn: "2026-03-01" },
          { stepKey: "connect_request", skipped: true },
        ],
        outcome: "reply",
      });
      const map = byKey(computeSchedule(item, jobApplicationNetworking, "2026-03-02"));

      expect(map["apply"]?.status).toBe("done");
      expect(map["connect_request"]?.status).toBe("skipped");
      expect(map["check_accept"]?.status).toBe("stopped");
      expect(map["followup_1"]?.status).toBe("stopped");
    });

    it("does not stop the flow for non-stopping outcomes", () => {
      const item = makeItem({ startDate: "2026-03-01", outcome: "in_progress" });
      const schedule = computeSchedule(item, jobApplicationNetworking, "2026-03-01");

      expect(schedule.some((s) => s.status === "stopped")).toBe(false);
      expect(byKey(schedule)["apply"]?.status).toBe("due_today");
    });

    it("does not stop the flow when workflow.stopOutcomes is empty", () => {
      const workflow: Workflow = {
        ...jobApplicationNetworking,
        stopOutcomes: [],
      };
      const item = makeItem({ startDate: "2026-03-01", outcome: "negative" });
      const schedule = computeSchedule(item, workflow, "2026-03-01");

      expect(schedule.some((s) => s.status === "stopped")).toBe(false);
      expect(byKey(schedule)["apply"]?.status).toBe("due_today");
    });
  });
});
