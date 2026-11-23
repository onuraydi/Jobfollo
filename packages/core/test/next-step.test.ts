import { describe, expect, it } from "vitest";
import {
  computeNextStep,
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

const APPLY_TITLES = { en: "Apply (mail or site)", tr: "Başvur (e-posta veya site)" };
const CONNECT_TITLES = {
  en: "Send LinkedIn connection request",
  tr: "LinkedIn bağlantı isteği gönder",
};
const CHECK_ACCEPT_TITLES = {
  en: "Check if connection accepted",
  tr: "Bağlantının kabul edilip edilmediğini kontrol et",
};
const FIRST_MESSAGE_TITLES = { en: "Send first message", tr: "İlk mesajı gönder" };
const FOLLOWUP_1_TITLES = { en: "Reminder 1", tr: "1. hatırlatma" };
const FOLLOWUP_2_TITLES = { en: "Reminder 2", tr: "2. hatırlatma" };
const CLOSE_TITLES = { en: "Mark as negative", tr: "Olumsuz olarak işaretle" };

describe("computeNextStep", () => {
  it("returns apply due on startDate for a fresh item", () => {
    const item = makeItem({ startDate: "2026-03-01" });
    expect(computeNextStep(item, jobApplicationNetworking, "2026-03-01")).toEqual({
      stepKey: "apply",
      title: "Apply (mail or site)",
      titles: APPLY_TITLES,
      dueDate: "2026-03-01",
      daysLeft: 0,
    });
  });

  it("returns connect_request due the same day once apply is done", () => {
    const item = makeItem({
      startDate: "2026-03-01",
      steps: [{ stepKey: "apply", completedOn: "2026-03-01" }],
    });
    expect(computeNextStep(item, jobApplicationNetworking, "2026-03-01")).toEqual({
      stepKey: "connect_request",
      title: "Send LinkedIn connection request",
      titles: CONNECT_TITLES,
      dueDate: "2026-03-01",
      daysLeft: 0,
    });
  });

  it("returns check_accept due D+1 when connect_request is done on D", () => {
    const item = makeItem({
      startDate: "2026-03-01",
      steps: [
        { stepKey: "apply", completedOn: "2026-03-01" },
        { stepKey: "connect_request", completedOn: "2026-03-01" },
      ],
    });
    expect(computeNextStep(item, jobApplicationNetworking, "2026-03-01")).toEqual({
      stepKey: "check_accept",
      title: "Check if connection accepted",
      titles: CHECK_ACCEPT_TITLES,
      dueDate: "2026-03-02",
      daysLeft: 1,
    });
  });

  it("returns first_message when contact is accepted", () => {
    const item = makeItem({
      startDate: "2026-03-01",
      contacts: [{ name: "Jane Doe", status: "accepted" }],
      steps: [
        { stepKey: "apply", completedOn: "2026-03-01" },
        { stepKey: "connect_request", completedOn: "2026-03-01" },
        { stepKey: "check_accept", completedOn: "2026-03-02" },
      ],
    });
    expect(computeNextStep(item, jobApplicationNetworking, "2026-03-02")).toEqual({
      stepKey: "first_message",
      title: "Send first message",
      titles: FIRST_MESSAGE_TITLES,
      dueDate: "2026-03-02",
      daysLeft: 0,
    });
  });

  it("skips first_message and continues to reminders when contact is not_accepted", () => {
    const item = makeItem({
      startDate: "2026-03-01",
      contacts: [{ name: "Jane Doe", status: "not_accepted" }],
      steps: [
        { stepKey: "apply", completedOn: "2026-03-01" },
        { stepKey: "connect_request", completedOn: "2026-03-01" },
        { stepKey: "check_accept", completedOn: "2026-03-02" },
      ],
    });
    expect(computeNextStep(item, jobApplicationNetworking, "2026-03-02")).toEqual({
      stepKey: "followup_1",
      title: "Reminder 1",
      titles: FOLLOWUP_1_TITLES,
      dueDate: "2026-03-08",
      daysLeft: 6,
    });
  });

  it("schedules followup_1 at start+7 and followup_2 at start+14", () => {
    const baseSteps = [
      { stepKey: "apply", completedOn: "2026-03-01" },
      { stepKey: "connect_request", completedOn: "2026-03-01" },
      { stepKey: "check_accept", completedOn: "2026-03-02" },
      { stepKey: "first_message", completedOn: "2026-03-02" },
    ];

    const beforeFollowup1 = makeItem({
      startDate: "2026-03-01",
      contacts: [{ name: "Jane Doe", status: "accepted" }],
      steps: baseSteps,
    });
    expect(computeNextStep(beforeFollowup1, jobApplicationNetworking, "2026-03-08")).toEqual({
      stepKey: "followup_1",
      title: "Reminder 1",
      titles: FOLLOWUP_1_TITLES,
      dueDate: "2026-03-08",
      daysLeft: 0,
    });

    const afterFollowup1 = makeItem({
      startDate: "2026-03-01",
      contacts: [{ name: "Jane Doe", status: "accepted" }],
      steps: [...baseSteps, { stepKey: "followup_1", completedOn: "2026-03-08" }],
    });
    expect(computeNextStep(afterFollowup1, jobApplicationNetworking, "2026-03-08")).toEqual({
      stepKey: "followup_2",
      title: "Reminder 2",
      titles: FOLLOWUP_2_TITLES,
      dueDate: "2026-03-15",
      daysLeft: 7,
    });
  });

  it("returns close with suggestsOutcome negative 3 days after followup_2", () => {
    const item = makeItem({
      startDate: "2026-03-01",
      contacts: [{ name: "Jane Doe", status: "accepted" }],
      steps: [
        { stepKey: "apply", completedOn: "2026-03-01" },
        { stepKey: "connect_request", completedOn: "2026-03-01" },
        { stepKey: "check_accept", completedOn: "2026-03-02" },
        { stepKey: "first_message", completedOn: "2026-03-02" },
        { stepKey: "followup_1", completedOn: "2026-03-08" },
        { stepKey: "followup_2", completedOn: "2026-03-15" },
      ],
    });
    expect(computeNextStep(item, jobApplicationNetworking, "2026-03-18")).toEqual({
      stepKey: "close",
      title: "Mark as negative",
      titles: CLOSE_TITLES,
      dueDate: "2026-03-18",
      daysLeft: 0,
      suggestsOutcome: "negative",
    });
  });

  it("returns negative daysLeft when the earliest step is overdue", () => {
    const item = makeItem({ startDate: "2026-03-01" });
    expect(computeNextStep(item, jobApplicationNetworking, "2026-03-05")).toEqual({
      stepKey: "apply",
      title: "Apply (mail or site)",
      titles: APPLY_TITLES,
      dueDate: "2026-03-01",
      daysLeft: -4,
    });
  });

  it("picks the earliest dueDate even when it comes later in workflow.steps", () => {
    const item = makeItem({
      startDate: "2026-03-01",
      steps: [
        { stepKey: "apply", completedOn: "2026-03-09" },
        { stepKey: "connect_request", completedOn: "2026-03-09" },
      ],
    });
    // check_accept is due 2026-03-10, followup_1 is due 2026-03-08 (earlier!)
    expect(computeNextStep(item, jobApplicationNetworking, "2026-03-09")).toEqual({
      stepKey: "followup_1",
      title: "Reminder 1",
      titles: FOLLOWUP_1_TITLES,
      dueDate: "2026-03-08",
      daysLeft: -1,
    });
  });

  it("breaks equal dueDate ties by workflow step order", () => {
    const item = makeItem({
      startDate: "2026-03-01",
      steps: [
        { stepKey: "apply", completedOn: "2026-03-07" },
        { stepKey: "connect_request", completedOn: "2026-03-07" },
      ],
    });
    // Both check_accept and followup_1 are due 2026-03-08
    expect(computeNextStep(item, jobApplicationNetworking, "2026-03-08")).toEqual({
      stepKey: "check_accept",
      title: "Check if connection accepted",
      titles: CHECK_ACCEPT_TITLES,
      dueDate: "2026-03-08",
      daysLeft: 0,
    });
  });

  it("returns null when all steps are done or skipped", () => {
    const item = makeItem({
      startDate: "2026-03-01",
      contacts: [{ name: "Jane Doe", status: "not_accepted" }],
      steps: [
        { stepKey: "apply", completedOn: "2026-03-01" },
        { stepKey: "connect_request", completedOn: "2026-03-01" },
        { stepKey: "check_accept", completedOn: "2026-03-02" },
        { stepKey: "followup_1", completedOn: "2026-03-08" },
        { stepKey: "followup_2", completedOn: "2026-03-15" },
        { stepKey: "close", completedOn: "2026-03-18" },
      ],
    });
    expect(computeNextStep(item, jobApplicationNetworking, "2026-03-20")).toBeNull();
  });

  it("returns null for a blank workflow", () => {
    const blank: Workflow = { id: "blank", name: "Blank", steps: [], stopOutcomes: [] };
    expect(computeNextStep(makeItem({ workflowId: "blank" }), blank, "2026-03-01")).toBeNull();
  });

  it("handles month/year boundary and leap day (2028-02-29)", () => {
    const leapItem = makeItem({
      startDate: "2028-02-22",
      contacts: [{ name: "Jane Doe", status: "accepted" }],
      steps: [
        { stepKey: "apply", completedOn: "2028-02-22" },
        { stepKey: "connect_request", completedOn: "2028-02-22" },
        { stepKey: "check_accept", completedOn: "2028-02-23" },
        { stepKey: "first_message", completedOn: "2028-02-23" },
      ],
    });
    expect(computeNextStep(leapItem, jobApplicationNetworking, "2028-02-28")).toEqual({
      stepKey: "followup_1",
      title: "Reminder 1",
      titles: FOLLOWUP_1_TITLES,
      dueDate: "2028-02-29",
      daysLeft: 1,
    });
  });

  describe("outcomes stop the flow", () => {
    it.each(["reply", "interview", "offer", "negative"])(
      "returns null when item.outcome is stopOutcome %s",
      (outcome) => {
        const item = makeItem({
          startDate: "2026-03-01",
          steps: [{ stepKey: "apply", completedOn: "2026-03-01" }],
          outcome,
        });
        expect(computeNextStep(item, jobApplicationNetworking, "2026-03-05")).toBeNull();
      },
    );

    it("continues returning the next step when item.outcome is not a stopOutcome", () => {
      const item = makeItem({
        startDate: "2026-03-01",
        outcome: "in_progress",
      });
      expect(computeNextStep(item, jobApplicationNetworking, "2026-03-01")).toEqual({
        stepKey: "apply",
        title: "Apply (mail or site)",
        titles: APPLY_TITLES,
        dueDate: "2026-03-01",
        daysLeft: 0,
      });
    });
  });
});
