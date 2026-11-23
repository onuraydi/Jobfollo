import { localizedText } from "./localize.js";
import type { Digest, DigestRow, Locale, RenderedDigest } from "./types.js";

interface DigestStrings {
  subjectPrefix: string;
  emptySubject: string;
  emptyBody: string;
  subjectToday: (n: number) => string;
  subjectOverdue: (n: number) => string;
  subjectUpcoming: (n: number) => string;
  sectionOverdue: string;
  sectionToday: string;
  sectionUpcoming: string;
  daysOverdue: (days: number) => string;
  dueTodayLabel: string;
  inDays: (days: number) => string;
}

const STRINGS: Record<Locale, DigestStrings> = {
  en: {
    subjectPrefix: "Jobfollo: ",
    emptySubject: "Jobfollo: Nothing due today",
    emptyBody: "No follow-up steps are due.",
    subjectToday: (n) => `${n} due today`,
    subjectOverdue: (n) => `${n} overdue`,
    subjectUpcoming: (n) => `${n} upcoming`,
    sectionOverdue: "Overdue",
    sectionToday: "Due today",
    sectionUpcoming: "Upcoming",
    daysOverdue: (days) => (days === 1 ? "1 day overdue" : `${days} days overdue`),
    dueTodayLabel: "due today",
    inDays: (days) => (days === 1 ? "in 1 day" : `in ${days} days`),
  },
  tr: {
    subjectPrefix: "Jobfollo: ",
    emptySubject: "Jobfollo: Bugün yapılacak adım yok",
    emptyBody: "Yapılacak takip adımı bulunmuyor.",
    subjectToday: (n) => `${n} bugün`,
    subjectOverdue: (n) => `${n} geciken`,
    subjectUpcoming: (n) => `${n} yaklaşan`,
    sectionOverdue: "Geciken",
    sectionToday: "Bugün",
    sectionUpcoming: "Yaklaşan",
    daysOverdue: (days) => `${days} gün gecikti`,
    dueTodayLabel: "bugün",
    inDays: (days) => `${days} gün sonra`,
  },
};

function normalizeSingleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function resolveRowStepTitle(row: DigestRow, locale: Locale): string {
  return normalizeSingleLine(localizedText(row.stepTitle, row.stepTitles, locale));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTiming(row: DigestRow, strings: DigestStrings): string {
  if (row.daysLeft < 0) {
    return strings.daysOverdue(Math.abs(row.daysLeft));
  }
  if (row.daysLeft === 0) {
    return strings.dueTodayLabel;
  }
  return strings.inDays(row.daysLeft);
}

function buildSubject(digest: Digest, strings: DigestStrings): string {
  const parts: string[] = [];
  if (digest.today.length > 0) {
    parts.push(strings.subjectToday(digest.today.length));
  }
  if (digest.overdue.length > 0) {
    parts.push(strings.subjectOverdue(digest.overdue.length));
  }
  if (digest.upcoming.length > 0) {
    parts.push(strings.subjectUpcoming(digest.upcoming.length));
  }
  if (parts.length === 0) {
    return strings.emptySubject;
  }
  return `${strings.subjectPrefix}${parts.join(", ")}`;
}

interface Section {
  heading: string;
  rows: readonly DigestRow[];
}

function getNonEmptySections(digest: Digest, strings: DigestStrings): Section[] {
  const sections: Section[] = [
    { heading: strings.sectionOverdue, rows: digest.overdue },
    { heading: strings.sectionToday, rows: digest.today },
    { heading: strings.sectionUpcoming, rows: digest.upcoming },
  ];
  return sections.filter((section) => section.rows.length > 0);
}

function buildText(
  digest: Digest,
  locale: Locale,
  sections: readonly Section[],
  strings: DigestStrings,
): string {
  const lines: string[] = [`Jobfollo — ${digest.date}`, ""];

  if (sections.length === 0) {
    lines.push(strings.emptyBody);
    return lines.join("\n");
  }

  for (const section of sections) {
    lines.push(`${section.heading} (${section.rows.length})`);
    for (const row of section.rows) {
      const timing = formatTiming(row, strings);
      const title = resolveRowStepTitle(row, locale);
      lines.push(`- ${normalizeSingleLine(row.itemTitle)} — ${title} (${row.dueDate}, ${timing})`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function buildHtml(
  digest: Digest,
  locale: Locale,
  sections: readonly Section[],
  strings: DigestStrings,
): string {
  const safeDate = escapeHtml(digest.date);

  const bodyContent =
    sections.length === 0
      ? `<p>${escapeHtml(strings.emptyBody)}</p>`
      : sections
          .map((section) => {
            const itemsHtml = section.rows
              .map((row) => {
                const timing = formatTiming(row, strings);
                const title = resolveRowStepTitle(row, locale);
                return `<li><strong>${escapeHtml(normalizeSingleLine(row.itemTitle))}</strong> — ${escapeHtml(title)} <span style="color:#666;">(${escapeHtml(row.dueDate)}, ${escapeHtml(timing)})</span></li>`;
              })
              .join("");
            return `<h2 style="font-size:16px;margin:16px 0 8px;">${escapeHtml(section.heading)} (${section.rows.length})</h2><ul style="margin:0;padding-left:20px;">${itemsHtml}</ul>`;
          })
          .join("");

  return [
    "<!doctype html>",
    `<html lang="${locale}">`,
    "<head><meta charset=\"utf-8\"></head>",
    '<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111;">',
    `<h1 style="font-size:18px;margin:0 0 12px;">Jobfollo — ${safeDate}</h1>`,
    bodyContent,
    "</body>",
    "</html>",
  ].join("");
}

export function renderDigest(digest: Digest, locale: Locale): RenderedDigest {
  if (locale !== "en" && locale !== "tr") {
    throw new RangeError(`Unsupported locale: "${String(locale)}". Expected "en" or "tr".`);
  }

  const strings = STRINGS[locale];
  const sections = getNonEmptySections(digest, strings);

  return {
    subject: buildSubject(digest, strings),
    text: buildText(digest, locale, sections, strings),
    html: buildHtml(digest, locale, sections, strings),
  };
}
