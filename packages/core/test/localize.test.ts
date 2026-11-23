import { describe, expect, it } from "vitest";
import {
  localizedText,
  stepTitle,
  workflowName,
  type Workflow,
  type WorkflowStep,
} from "../src/index.js";

describe("localizedText / stepTitle / workflowName", () => {
  it("returns map[locale] when it is a non-empty string after trim", () => {
    expect(localizedText("Apply", { en: "Apply", tr: "Başvur" }, "tr")).toBe("Başvur");
    expect(localizedText("Apply", { en: "Apply", tr: "Başvur" }, "en")).toBe("Apply");
  });

  it("falls back to plain string when map is undefined, locale is missing, or value is empty/whitespace", () => {
    expect(localizedText("Apply", undefined, "tr")).toBe("Apply");
    expect(localizedText("Apply", { en: "Apply" }, "tr")).toBe("Apply");
    expect(localizedText("Apply", { tr: "" }, "tr")).toBe("Apply");
    expect(localizedText("Apply", { tr: "   " }, "tr")).toBe("Apply");
  });

  it("resolves stepTitle and workflowName with fallback", () => {
    const step: WorkflowStep = {
      key: "apply",
      title: "Apply",
      titles: { en: "Apply", tr: "Başvur" },
      anchor: "start",
      offsetDays: 0,
    };
    const customStep: WorkflowStep = {
      key: "ping",
      title: "Send ping",
      anchor: "start",
      offsetDays: 0,
    };
    expect(stepTitle(step, "tr")).toBe("Başvur");
    expect(stepTitle(customStep, "tr")).toBe("Send ping");

    const wf: Workflow = {
      id: "wf",
      name: "Default Name",
      names: { en: "Default Name", tr: "Türkçe Ad" },
      steps: [],
      stopOutcomes: [],
    };
    const customWf: Workflow = {
      id: "wf2",
      name: "Custom Only",
      steps: [],
      stopOutcomes: [],
    };
    expect(workflowName(wf, "tr")).toBe("Türkçe Ad");
    expect(workflowName(customWf, "tr")).toBe("Custom Only");
  });
});
