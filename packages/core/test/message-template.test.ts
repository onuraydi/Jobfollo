import { describe, expect, it } from "vitest";
import {
  buildMailtoHref,
  builtInMessageTemplates,
  renderTemplate,
} from "../src/index.js";

describe("message templates", () => {
  it("provides localized TR and EN built-in email and message templates", () => {
    const tr = builtInMessageTemplates("tr");
    const en = builtInMessageTemplates("en");
    expect(tr.length).toBeGreaterThanOrEqual(6);
    expect(en.length).toBe(tr.length);
    expect(tr.some((tpl) => tpl.channel === "email" && Boolean(tpl.subject))).toBe(true);
    expect(tr.some((tpl) => tpl.channel === "message")).toBe(true);
  });

  it("renders subject and body placeholders and builds a valid mailto URL", () => {
    const [first] = builtInMessageTemplates("tr");
    const rendered = renderTemplate(first!, {
      company: "Acme",
      role: "Backend Engineer",
      contact: "Ayşe",
    });

    expect(rendered.subject).toContain("Backend Engineer");
    expect(rendered.subject).toContain("Acme");
    expect(rendered.body).toContain("Ayşe");

    const href = buildMailtoHref(rendered.subject, rendered.body, "hr@acme.test");
    expect(href.startsWith("mailto:hr%40acme.test?subject=")).toBe(true);
    expect(href).toContain("&body=");
  });
});
