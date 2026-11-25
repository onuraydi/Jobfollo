import { describe, expect, it } from "vitest";
import {
  adjustForWeekend,
  buildDigest,
  buildTemplateVars,
  computeSchedule,
  computeStats,
  dayOfWeek,
  exportEventToIcs,
  jobApplicationNetworking,
  nextMonday,
  renderMessageTemplate,
  type Item,
} from "../src/index.js";

describe("weekend adjustment and nextMonday", () => {
  it("identifies weekdays and shifts Saturday/Sunday to Monday", () => {
    // 2026-03-13 is Friday, 2026-03-14 is Saturday, 2026-03-15 is Sunday, 2026-03-16 is Monday
    expect(dayOfWeek("2026-03-13")).toBe(5);
    expect(dayOfWeek("2026-03-14")).toBe(6);
    expect(dayOfWeek("2026-03-15")).toBe(0);
    expect(dayOfWeek("2026-03-16")).toBe(1);

    expect(adjustForWeekend("2026-03-13")).toBe("2026-03-13");
    expect(adjustForWeekend("2026-03-14")).toBe("2026-03-16");
    expect(adjustForWeekend("2026-03-15")).toBe("2026-03-16");
    expect(adjustForWeekend("2026-03-16")).toBe("2026-03-16");

    expect(nextMonday("2026-03-13")).toBe("2026-03-16");
    expect(nextMonday("2026-03-14")).toBe("2026-03-16");
    expect(nextMonday("2026-03-15")).toBe("2026-03-16");
    expect(nextMonday("2026-03-16")).toBe("2026-03-23");
  });

  it("shifts weekend due dates in computeSchedule and buildDigest when skipWeekends is enabled", () => {
    const item: Item = {
      id: "1",
      title: "Acme",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-14", // Saturday
      contacts: [],
      steps: [],
    };

    const withWeekends = computeSchedule(item, jobApplicationNetworking, "2026-03-14");
    expect(withWeekends[0]?.dueDate).toBe("2026-03-14");
    expect(withWeekends[0]?.status).toBe("due_today");

    const businessOnly = computeSchedule(item, jobApplicationNetworking, "2026-03-14", {
      skipWeekends: true,
    });
    expect(businessOnly[0]?.dueDate).toBe("2026-03-16");
    expect(businessOnly[0]?.status).toBe("pending");

    const digest = buildDigest([item], [jobApplicationNetworking], "2026-03-14", {
      upcomingDays: 2,
      skipWeekends: true,
    });
    expect(digest.today).toHaveLength(0);
    expect(digest.upcoming).toHaveLength(1);
    expect(digest.upcoming[0]?.dueDate).toBe("2026-03-16");
  });

  it("honors snoozedUntil when later than the computed due date", () => {
    const item: Item = {
      id: "1",
      title: "Acme",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-10",
      contacts: [],
      steps: [{ stepKey: "apply", snoozedUntil: "2026-03-15" }],
    };

    const schedule = computeSchedule(item, jobApplicationNetworking, "2026-03-12");
    expect(schedule[0]?.dueDate).toBe("2026-03-15");
    expect(schedule[0]?.status).toBe("pending");
  });
});

describe("renderMessageTemplate", () => {
  it("substitutes company, title, role, and contact placeholders", () => {
    const vars = buildTemplateVars({
      title: "Backend Application",
      company: "Acme Corp",
      role: "Senior Engineer",
      contacts: [{ name: "Ada", status: "pending" }],
    });

    const rendered = renderMessageTemplate(
      "Hi {{contact}}, following up on the {{role}} role at {{company}} ({{title}}).",
      vars,
    );
    expect(rendered).toBe(
      "Hi Ada, following up on the Senior Engineer role at Acme Corp (Backend Application).",
    );
  });
});

describe("computeStats", () => {
  it("computes outcome funnel, conversion rates, channels, work modes, and priorities", () => {
    const items: Item[] = [
      {
        id: "1",
        title: "A",
        channel: "LinkedIn",
        workMode: "remote",
        priority: "high",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
        contacts: [],
        steps: [],
        outcome: "offer",
      },
      {
        id: "2",
        title: "B",
        channel: "LinkedIn",
        workMode: "hybrid",
        priority: "normal",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-02",
        contacts: [],
        steps: [],
        outcome: "interview",
      },
      {
        id: "3",
        title: "C",
        channel: "Referral",
        workMode: "remote",
        priority: "low",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-03",
        contacts: [],
        steps: [],
        outcome: "negative",
      },
      {
        id: "4",
        title: "D",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-04",
        contacts: [],
        steps: [],
      },
    ];

    const stats = computeStats(items);
    expect(stats.total).toBe(4);
    expect(stats.byOutcome).toEqual({
      in_progress: 1,
      reply: 0,
      interview: 1,
      offer: 1,
      negative: 1,
    });
    expect(stats.responseRate).toBe(50);
    expect(stats.interviewRate).toBe(50);
    expect(stats.offerRate).toBe(25);
    expect(stats.byChannel).toEqual([
      { label: "LinkedIn", count: 2 },
      { label: "Referral", count: 1 },
    ]);
    expect(stats.byWorkMode).toEqual({
      remote: 2,
      hybrid: 1,
      onsite: 0,
      unspecified: 1,
    });
    expect(stats.byPriority).toEqual({ high: 1, normal: 2, low: 1 });
  });

  it("tracks applicationType breakdown and recent7DaysCount, and exports valid RFC 5545 ICS", () => {
    const items: Item[] = [
      {
        id: "1",
        title: "Open Role",
        applicationType: "job_posting",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-10",
        contacts: [],
        steps: [],
      },
      {
        id: "2",
        title: "Cold Outreach",
        applicationType: "general",
        workflowId: jobApplicationNetworking.id,
        startDate: "2026-03-01",
        contacts: [],
        steps: [],
      },
    ];
    const stats = computeStats(items, "2026-03-12");
    expect(stats.byApplicationType).toEqual({ job_posting: 1, general: 1, unspecified: 0 });
    expect(stats.recent7DaysCount).toBe(1);

    const ics = exportEventToIcs({
      uid: "item-1-apply",
      date: "2026-03-10",
      summary: "Acme, Inc. — Follow-up; Step 1",
      description: "Line 1\nLine 2",
      url: "https://example.com/job",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260310");
    expect(ics).toContain("DTEND;VALUE=DATE:20260311");
    expect(ics).toContain("SUMMARY:Acme\\, Inc. — Follow-up\\; Step 1");
    expect(ics).toContain("DESCRIPTION:Line 1\\nLine 2");
    expect(ics).toContain("URL:https://example.com/job");
    expect(ics).toContain("END:VCALENDAR");
  });
});
