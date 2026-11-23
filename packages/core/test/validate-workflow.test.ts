import { describe, expect, it } from "vitest";
import {
  jobApplicationNetworking,
  validateWorkflow,
  type Workflow,
  type WorkflowStep,
} from "../src/index.js";

function makeStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    key: "step_1",
    title: "Step 1",
    anchor: "start",
    offsetDays: 0,
    ...overrides,
  };
}

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: "test-workflow",
    name: "Test Workflow",
    steps: [makeStep()],
    stopOutcomes: ["negative"],
    ...overrides,
  };
}

describe("validateWorkflow", () => {
  it("accepts the built-in job-application-networking template", () => {
    expect(validateWorkflow(jobApplicationNetworking)).toEqual([]);
  });

  it("accepts a minimal blank workflow with no steps", () => {
    const blank = makeWorkflow({ id: "blank", name: "Blank", steps: [], stopOutcomes: [] });
    expect(validateWorkflow(blank)).toEqual([]);
  });

  it("accepts forward anchor references that do not form a cycle", () => {
    const workflow = makeWorkflow({
      steps: [
        makeStep({ key: "a", title: "A", anchor: "step:b", offsetDays: 2 }),
        makeStep({ key: "b", title: "B", anchor: "start", offsetDays: 0 }),
      ],
    });
    expect(validateWorkflow(workflow)).toEqual([]);
  });

  it.each(["pending", "accepted", "not_accepted"] as const)(
    "accepts valid runIf.contactStatus = %s",
    (contactStatus) => {
      const workflow = makeWorkflow({
        steps: [makeStep({ runIf: { contactStatus } })],
      });
      expect(validateWorkflow(workflow)).toEqual([]);
    },
  );

  it("accepts offsetDays = 0", () => {
    const workflow = makeWorkflow({
      steps: [makeStep({ offsetDays: 0 })],
    });
    expect(validateWorkflow(workflow)).toEqual([]);
  });

  describe("workflow metadata", () => {
    it.each([
      { label: "empty id", overrides: { id: "" }, expectedCode: "empty_workflow_id" },
      { label: "whitespace id", overrides: { id: "   " }, expectedCode: "empty_workflow_id" },
      { label: "empty name", overrides: { name: "" }, expectedCode: "empty_workflow_name" },
      { label: "whitespace name", overrides: { name: "  " }, expectedCode: "empty_workflow_name" },
    ])("rejects $label", ({ overrides, expectedCode }) => {
      const errors = validateWorkflow(makeWorkflow(overrides));
      expect(errors).toHaveLength(1);
      expect(errors[0]?.code).toBe(expectedCode);
    });
  });

  describe("step keys and titles", () => {
    it.each([
      { label: "empty key", step: makeStep({ key: "" }), expectedCode: "empty_step_key" },
      { label: "whitespace key", step: makeStep({ key: "  " }), expectedCode: "empty_step_key" },
      { label: "empty title", step: makeStep({ title: "" }), expectedCode: "empty_step_title" },
      { label: "whitespace title", step: makeStep({ title: "  " }), expectedCode: "empty_step_title" },
    ])("rejects $label", ({ step, expectedCode }) => {
      const errors = validateWorkflow(makeWorkflow({ steps: [step] }));
      expect(errors.map((e) => e.code)).toContain(expectedCode);
    });

    it("rejects duplicate step keys", () => {
      const workflow = makeWorkflow({
        steps: [
          makeStep({ key: "apply", title: "Apply 1" }),
          makeStep({ key: "apply", title: "Apply 2" }),
        ],
      });
      const errors = validateWorkflow(workflow);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        code: "duplicate_step_key",
        stepKey: "apply",
      });
    });
  });

  describe("anchors", () => {
    it.each([
      { label: "unknown keyword", anchor: "end" },
      { label: "empty step key after prefix", anchor: "step:" },
      { label: "whitespace step key after prefix", anchor: "step:   " },
      { label: "empty string", anchor: "" },
    ])("rejects invalid anchor format: $label", ({ anchor }) => {
      const workflow = makeWorkflow({
        steps: [makeStep({ key: "s1", anchor: anchor as WorkflowStep["anchor"] })],
      });
      const errors = validateWorkflow(workflow);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        code: "invalid_anchor",
        stepKey: "s1",
      });
    });

    it("rejects step:<key> referencing a nonexistent step", () => {
      const workflow = makeWorkflow({
        steps: [makeStep({ key: "s1", anchor: "step:nonexistent" })],
      });
      const errors = validateWorkflow(workflow);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        code: "unknown_anchor_step",
        stepKey: "s1",
      });
    });

    it("rejects a self-referencing anchor cycle", () => {
      const workflow = makeWorkflow({
        steps: [makeStep({ key: "a", anchor: "step:a" })],
      });
      const errors = validateWorkflow(workflow);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        code: "anchor_cycle",
        stepKey: "a",
      });
    });

    it("rejects a 2-step anchor cycle once", () => {
      const workflow = makeWorkflow({
        steps: [
          makeStep({ key: "a", anchor: "step:b" }),
          makeStep({ key: "b", anchor: "step:a" }),
        ],
      });
      const errors = validateWorkflow(workflow);
      expect(errors.filter((e) => e.code === "anchor_cycle")).toHaveLength(1);
    });

    it("rejects a 3-step anchor cycle with a lead-in step once", () => {
      const workflow = makeWorkflow({
        steps: [
          makeStep({ key: "entry", anchor: "step:a" }),
          makeStep({ key: "a", anchor: "step:b" }),
          makeStep({ key: "b", anchor: "step:c" }),
          makeStep({ key: "c", anchor: "step:a" }),
        ],
      });
      const errors = validateWorkflow(workflow);
      expect(errors.filter((e) => e.code === "anchor_cycle")).toHaveLength(1);
    });

    it("reports multiple disjoint anchor cycles", () => {
      const workflow = makeWorkflow({
        steps: [
          makeStep({ key: "a", anchor: "step:b" }),
          makeStep({ key: "b", anchor: "step:a" }),
          makeStep({ key: "c", anchor: "step:d" }),
          makeStep({ key: "d", anchor: "step:c" }),
        ],
      });
      const errors = validateWorkflow(workflow);
      expect(errors.filter((e) => e.code === "anchor_cycle")).toHaveLength(2);
    });
  });

  describe("offsetDays", () => {
    it.each([-1, -10, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      "rejects invalid offsetDays = %s",
      (offsetDays) => {
        const workflow = makeWorkflow({
          steps: [makeStep({ key: "s1", offsetDays })],
        });
        const errors = validateWorkflow(workflow);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({
          code: "invalid_offset_days",
          stepKey: "s1",
        });
      },
    );
  });

  describe("runIf", () => {
    it.each([
      { label: "empty object", runIf: {} },
      { label: "unknown key", runIf: { otherKey: "x" } },
      { label: "extra key alongside contactStatus", runIf: { contactStatus: "accepted", extra: 1 } },
      { label: "invalid contactStatus value", runIf: { contactStatus: "unknown" } },
      { label: "null", runIf: null },
    ])("rejects invalid runIf ($label)", ({ runIf }) => {
      const workflow = makeWorkflow({
        steps: [makeStep({ key: "s1", runIf: runIf as WorkflowStep["runIf"] })],
      });
      const errors = validateWorkflow(workflow);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        code: "invalid_run_if",
        stepKey: "s1",
      });
    });
  });

  describe("records", () => {
    it("rejects unsupported records value", () => {
      const workflow = makeWorkflow({
        steps: [makeStep({ key: "s1", records: "other" as WorkflowStep["records"] })],
      });
      const errors = validateWorkflow(workflow);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        code: "invalid_records",
        stepKey: "s1",
      });
    });
  });

  it("collects all validation errors in a single pass", () => {
    const workflow = makeWorkflow({
      steps: [
        makeStep({ key: "dup", offsetDays: -2 }),
        makeStep({
          key: "dup",
          anchor: "step:missing",
          runIf: { other: true } as unknown as WorkflowStep["runIf"],
        }),
      ],
    });
    const codes = validateWorkflow(workflow).map((e) => e.code);
    expect(codes).toContain("duplicate_step_key");
    expect(codes).toContain("invalid_offset_days");
    expect(codes).toContain("unknown_anchor_step");
    expect(codes).toContain("invalid_run_if");
  });

  it("does not mutate the input workflow", () => {
    const step = Object.freeze(makeStep({ runIf: Object.freeze({ contactStatus: "accepted" }) }));
    const workflow = Object.freeze(
      makeWorkflow({
        steps: Object.freeze([step]) as unknown as WorkflowStep[],
        stopOutcomes: Object.freeze(["negative"]) as unknown as string[],
      }),
    );
    expect(() => validateWorkflow(workflow)).not.toThrow();
    expect(validateWorkflow(workflow)).toEqual([]);
  });

  describe("localized names and titles", () => {
    it("allows valid names and titles including well-formed unknown locales (e.g. de) and without en", () => {
      const workflow = makeWorkflow({
        names: { tr: "Özel akış", de: "Benutzerdefiniert" } as Workflow["names"],
        steps: [
          makeStep({
            key: "s1",
            titles: { tr: "İlk adım", de: "Erster Schritt" } as WorkflowStep["titles"],
          }),
        ],
      });
      expect(validateWorkflow(workflow)).toEqual([]);
    });

    it.each([
      { label: "null names", names: null },
      { label: "array names", names: ["en"] },
      { label: "uppercase locale key", names: { TR: "Merhaba" } },
      { label: "long locale key", names: { turkish: "Merhaba" } },
      { label: "empty locale key", names: { "": "Merhaba" } },
      { label: "whitespace value", names: { tr: "   " } },
      { label: "multiline LF value", names: { tr: "Line 1\nLine 2" } },
      { label: "multiline CR value", names: { tr: "Line 1\rLine 2" } },
      { label: "value over 200 chars", names: { tr: "a".repeat(201) } },
    ])("rejects invalid workflow.names ($label)", ({ names }) => {
      const workflow = makeWorkflow({ names: names as Workflow["names"] });
      const errors = validateWorkflow(workflow);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0]?.code).toBe("invalid_localized_text");
    });

    it("reports each step title violation separately with stepKey and locale", () => {
      const workflow = makeWorkflow({
        steps: [
          makeStep({
            key: "apply",
            titles: {
              TR: "Bad key",
              en: "Line1\nLine2",
              tr: "   ",
            } as unknown as WorkflowStep["titles"],
          }),
        ],
      });
      const errors = validateWorkflow(workflow);
      expect(errors).toHaveLength(3);
      for (const err of errors) {
        expect(err.code).toBe("invalid_localized_text");
        expect(err.stepKey).toBe("apply");
        expect(err.locale).toBeDefined();
      }
      expect(errors.map((e) => e.locale).sort()).toEqual(["TR", "en", "tr"]);
    });
  });
});
