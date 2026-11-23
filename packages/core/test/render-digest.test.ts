import { describe, expect, it } from "vitest";
import {
  buildDigest,
  jobApplicationNetworking,
  renderDigest,
  type Digest,
  type DigestRow,
  type Item,
  type Locale,
} from "../src/index.js";

function makeRow(overrides: Partial<DigestRow> = {}): DigestRow {
  return {
    itemId: "item-1",
    itemTitle: "Acme Corp",
    stepKey: "followup_1",
    stepTitle: "Reminder 1",
    dueDate: "2026-03-10",
    daysLeft: 0,
    ...overrides,
  };
}

function makeDigest(overrides: Partial<Digest> = {}): Digest {
  const overdue = overrides.overdue ?? [];
  const today = overrides.today ?? [];
  const upcoming = overrides.upcoming ?? [];
  return {
    date: overrides.date ?? "2026-03-10",
    overdue,
    today,
    upcoming,
    isEmpty:
      overrides.isEmpty ??
      (overdue.length === 0 && today.length === 0 && upcoming.length === 0),
  };
}

describe("renderDigest", () => {
  it("renders EN subject, text, and html with overdue and today counts", () => {
    const digest = makeDigest({
      overdue: [
        makeRow({
          itemId: "o1",
          itemTitle: "Late Co",
          stepTitle: "Apply",
          dueDate: "2026-03-07",
          daysLeft: -3,
        }),
      ],
      today: [
        makeRow({ itemId: "t1", itemTitle: "Alpha" }),
        makeRow({ itemId: "t2", itemTitle: "Bravo" }),
        makeRow({ itemId: "t3", itemTitle: "Charlie" }),
      ],
    });

    const rendered = renderDigest(digest, "en");

    expect(rendered.subject).toBe("Jobfollo: 3 due today, 1 overdue");
    expect(rendered.text).toContain("2026-03-10");
    expect(rendered.text).toContain("Overdue");
    expect(rendered.text).toContain("Due today");
    expect(rendered.text).not.toContain("Upcoming");
    expect(rendered.text).toContain("Late Co");
    expect(rendered.text).toContain("Apply");
    expect(rendered.text).toContain("2026-03-07");
    expect(rendered.text).toContain("3 days overdue");

    expect(rendered.html).toContain('lang="en"');
    expect(rendered.html).toContain("Overdue");
    expect(rendered.html).toContain("Due today");
    expect(rendered.html).not.toContain("Upcoming");
    expect(rendered.html).toContain("Late Co");
    expect(rendered.html).toContain("3 days overdue");
  });

  it("renders TR subject, text, and html with overdue, today, and upcoming sections", () => {
    const digest = makeDigest({
      overdue: [
        makeRow({
          itemId: "o1",
          itemTitle: "Geciken A.Ş.",
          stepTitle: "Hatırlatma 1",
          dueDate: "2026-03-09",
          daysLeft: -1,
        }),
      ],
      today: [
        makeRow({ itemId: "t1", itemTitle: "Bugün 1" }),
        makeRow({ itemId: "t2", itemTitle: "Bugün 2" }),
      ],
      upcoming: [
        makeRow({
          itemId: "u1",
          itemTitle: "Yaklaşan A.Ş.",
          stepTitle: "Hatırlatma 2",
          dueDate: "2026-03-12",
          daysLeft: 2,
        }),
      ],
    });

    const rendered = renderDigest(digest, "tr");

    expect(rendered.subject).toBe("Jobfollo: 2 bugün, 1 geciken, 1 yaklaşan");
    expect(rendered.text).toContain("Geciken");
    expect(rendered.text).toContain("Bugün");
    expect(rendered.text).toContain("Yaklaşan");
    expect(rendered.text).toContain("1 gün gecikti");
    expect(rendered.text).toContain("2 gün sonra");

    expect(rendered.html).toContain('lang="tr"');
    expect(rendered.html).toContain("Geciken");
    expect(rendered.html).toContain("Bugün");
    expect(rendered.html).toContain("Yaklaşan");
    expect(rendered.html).toContain("1 gün gecikti");
    expect(rendered.html).toContain("2 gün sonra");
  });

  it("uses singular and plural day labels properly in EN", () => {
    const digest = makeDigest({
      overdue: [
        makeRow({ itemId: "o1", itemTitle: "One Day", dueDate: "2026-03-09", daysLeft: -1 }),
        makeRow({ itemId: "o2", itemTitle: "Two Days", dueDate: "2026-03-08", daysLeft: -2 }),
      ],
      upcoming: [
        makeRow({ itemId: "u1", itemTitle: "Tomorrow", dueDate: "2026-03-11", daysLeft: 1 }),
        makeRow({ itemId: "u2", itemTitle: "Later", dueDate: "2026-03-13", daysLeft: 3 }),
      ],
    });

    const rendered = renderDigest(digest, "en");
    expect(rendered.text).toContain("1 day overdue");
    expect(rendered.text).toContain("2 days overdue");
    expect(rendered.text).toContain("in 1 day");
    expect(rendered.text).toContain("in 3 days");
    expect(rendered.html).toContain("1 day overdue");
    expect(rendered.html).toContain("in 1 day");
  });

  it("omits zero-count buckets from subject and empty sections from body", () => {
    const digest = makeDigest({
      overdue: [makeRow({ itemId: "o1", dueDate: "2026-03-08", daysLeft: -2 })],
    });

    const en = renderDigest(digest, "en");
    expect(en.subject).toBe("Jobfollo: 1 overdue");
    expect(en.text).not.toContain("Due today");
    expect(en.text).not.toContain("Upcoming");

    const tr = renderDigest(digest, "tr");
    expect(tr.subject).toBe("Jobfollo: 1 geciken");
    expect(tr.text).not.toContain("Yaklaşan");
  });

  it.each([
    { locale: "en" as const, expectedSubject: "Jobfollo: Nothing due today" },
    { locale: "tr" as const, expectedSubject: "Jobfollo: Bugün yapılacak adım yok" },
  ])("renders empty digest cleanly in $locale", ({ locale, expectedSubject }) => {
    const rendered = renderDigest(makeDigest(), locale);
    expect(rendered.subject).toBe(expectedSubject);
    expect(rendered.text.length).toBeGreaterThan(0);
    expect(rendered.html).toContain(`lang="${locale}"`);
  });

  it("escapes HTML special characters in user-provided text without altering plain text", () => {
    const maliciousItem = '<script>alert("xss")</script> & Co';
    const maliciousStep = "Follow up 'now' > <b>urgent</b>";
    const digest = makeDigest({
      today: [
        makeRow({
          itemTitle: maliciousItem,
          stepTitle: maliciousStep,
        }),
      ],
    });

    const rendered = renderDigest(digest, "en");

    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<b>urgent</b>");
    expect(rendered.html).toContain(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; Co",
    );
    expect(rendered.html).toContain(
      "Follow up &#39;now&#39; &gt; &lt;b&gt;urgent&lt;/b&gt;",
    );

    expect(rendered.text).toContain(maliciousItem);
    expect(rendered.text).toContain(maliciousStep);
  });

  it("integrates directly with buildDigest output", () => {
    const items: Item[] = [
      {
        id: "i1",
        title: "Acme",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-08",
        contacts: [],
        steps: [],
      },
      {
        id: "i2",
        title: "Beta",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-10",
        contacts: [],
        steps: [],
      },
    ];
    const digest = buildDigest(items, [jobApplicationNetworking], "2026-03-10");

    const en = renderDigest(digest, "en");
    expect(en.subject).toBe("Jobfollo: 1 due today, 1 overdue");
    expect(en.text).toContain("Acme");
    expect(en.text).toContain("Beta");

    const tr = renderDigest(digest, "tr");
    expect(tr.subject).toBe("Jobfollo: 1 bugün, 1 geciken");
  });

  it("throws RangeError for unsupported locale at runtime", () => {
    expect(() => renderDigest(makeDigest(), "fr" as Locale)).toThrow(RangeError);
  });

  it("does not mutate the input digest", () => {
    const row = Object.freeze(makeRow());
    const digest = Object.freeze(
      makeDigest({
        today: Object.freeze([row]) as Digest["today"],
        overdue: Object.freeze([] as DigestRow[]) as Digest["overdue"],
        upcoming: Object.freeze([] as DigestRow[]) as Digest["upcoming"],
      }),
    );
    expect(() => renderDigest(digest, "en")).not.toThrow();
  });
});
