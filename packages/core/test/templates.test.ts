import { describe, expect, it } from "vitest";
import {
  blankWorkflow,
  builtInTemplates,
  computeNextStep,
  freelanceClientOutreach,
  grantScholarship,
  jobApplicationNetworking,
  validateWorkflow,
  type Item,
} from "../src/index.js";

function makeItem(workflowId: string, overrides: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    title: "Test Item",
    workflowId,
    startDate: "2026-03-01",
    contacts: [],
    steps: [],
    ...overrides,
  };
}

describe("built-in templates", () => {
  it("exports all 4 templates with unique ids", () => {
    expect(builtInTemplates).toHaveLength(4);
    const ids = builtInTemplates.map((t) => t.id);
    expect(ids).toEqual([
      "job-application-networking",
      "freelance-client-outreach",
      "grant-scholarship",
      "blank",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every built-in template passes validateWorkflow", () => {
    for (const template of builtInTemplates) {
      expect(validateWorkflow(template)).toEqual([]);
    }
  });

  it("every built-in template and step has en and tr translations with en identical to plain name/title", () => {
    for (const template of builtInTemplates) {
      expect(template.names?.en).toBe(template.name);
      expect(template.names?.tr?.trim().length).toBeGreaterThan(0);

      for (const step of template.steps) {
        expect(step.titles?.en).toBe(step.title);
        expect(step.titles?.tr?.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("job-application-networking template", () => {
  const { steps } = jobApplicationNetworking;
  const keys = steps.map((s) => s.key);

  it("passes workflow validation", () => {
    expect(validateWorkflow(jobApplicationNetworking)).toEqual([]);
  });

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

describe("freelance-client-outreach template", () => {
  it("passes workflow validation", () => {
    expect(validateWorkflow(freelanceClientOutreach)).toEqual([]);
  });

  it("follows proposal -> day 3 -> day 10 -> close cadence", () => {
    const start = makeItem(freelanceClientOutreach.id);
    expect(computeNextStep(start, freelanceClientOutreach, "2026-03-01")).toMatchObject({
      stepKey: "send_proposal",
      dueDate: "2026-03-01",
    });

    const afterProposal = makeItem(freelanceClientOutreach.id, {
      steps: [{ stepKey: "send_proposal", completedOn: "2026-03-01" }],
    });
    expect(computeNextStep(afterProposal, freelanceClientOutreach, "2026-03-04")).toMatchObject({
      stepKey: "followup_1",
      dueDate: "2026-03-04",
    });

    const afterFollowup1 = makeItem(freelanceClientOutreach.id, {
      steps: [
        { stepKey: "send_proposal", completedOn: "2026-03-01" },
        { stepKey: "followup_1", completedOn: "2026-03-04" },
      ],
    });
    expect(computeNextStep(afterFollowup1, freelanceClientOutreach, "2026-03-11")).toMatchObject({
      stepKey: "last_followup",
      dueDate: "2026-03-11",
    });

    const afterLastFollowup = makeItem(freelanceClientOutreach.id, {
      steps: [
        { stepKey: "send_proposal", completedOn: "2026-03-01" },
        { stepKey: "followup_1", completedOn: "2026-03-04" },
        { stepKey: "last_followup", completedOn: "2026-03-11" },
      ],
    });
    expect(computeNextStep(afterLastFollowup, freelanceClientOutreach, "2026-03-14")).toMatchObject({
      stepKey: "close",
      dueDate: "2026-03-14",
      suggestsOutcome: "negative",
    });
  });
});

describe("grant-scholarship template", () => {
  it("passes workflow validation", () => {
    expect(validateWorkflow(grantScholarship)).toEqual([]);
  });

  it("follows submit -> confirmation check day 7 -> status check day 30 cadence", () => {
    const start = makeItem(grantScholarship.id);
    expect(computeNextStep(start, grantScholarship, "2026-03-01")).toMatchObject({
      stepKey: "submit",
      dueDate: "2026-03-01",
    });

    const afterSubmit = makeItem(grantScholarship.id, {
      steps: [{ stepKey: "submit", completedOn: "2026-03-01" }],
    });
    expect(computeNextStep(afterSubmit, grantScholarship, "2026-03-08")).toMatchObject({
      stepKey: "confirmation_check",
      dueDate: "2026-03-08",
    });

    const afterConfirm = makeItem(grantScholarship.id, {
      steps: [
        { stepKey: "submit", completedOn: "2026-03-01" },
        { stepKey: "confirmation_check", completedOn: "2026-03-08" },
      ],
    });
    expect(computeNextStep(afterConfirm, grantScholarship, "2026-03-31")).toMatchObject({
      stepKey: "status_check",
      dueDate: "2026-03-31",
    });

    const allDone = makeItem(grantScholarship.id, {
      steps: [
        { stepKey: "submit", completedOn: "2026-03-01" },
        { stepKey: "confirmation_check", completedOn: "2026-03-08" },
        { stepKey: "status_check", completedOn: "2026-03-31" },
      ],
    });
    expect(computeNextStep(allDone, grantScholarship, "2026-04-01")).toBeNull();
  });
});

describe("blank template", () => {
  it("passes workflow validation and has no steps", () => {
    expect(validateWorkflow(blankWorkflow)).toEqual([]);
    expect(blankWorkflow.steps).toEqual([]);
    expect(computeNextStep(makeItem(blankWorkflow.id), blankWorkflow, "2026-03-01")).toBeNull();
  });
});
