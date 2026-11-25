import { addDays, isValidISODate } from "./date.js";
import type { ISODate } from "./types.js";

export interface IcsEventInput {
  uid: string;
  date: ISODate;
  summary: string;
  description?: string;
  url?: string;
}

function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\n");
}

function toIcsDate(date: ISODate): string {
  return date.replaceAll("-", "");
}

/**
 * Generates an RFC 5545 all-day `.ics` calendar event for a follow-up step.
 * 100% pure and offline; works with Google Calendar, Outlook, and Apple Calendar.
 */
export function exportEventToIcs(event: IcsEventInput): string {
  if (!isValidISODate(event.date)) {
    throw new RangeError(`Invalid ICS event date: "${event.date}"`);
  }
  const dtStart = toIcsDate(event.date);
  const dtEnd = toIcsDate(addDays(event.date, 1));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jobfollo//Follow-up Tracker//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(event.uid)}@jobfollo.local`,
    `DTSTAMP:${dtStart}T090000Z`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
  ];

  if (event.description && event.description.trim()) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description.trim())}`);
  }
  if (event.url && event.url.trim()) {
    lines.push(`URL:${event.url.trim()}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR", "");
  return lines.join("\r\n");
}
