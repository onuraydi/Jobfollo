import {
  addDays,
  computeSchedule,
  dayOfWeek,
  localizedText,
  type ISODate,
  type StepStatus,
  type Workflow,
} from "@jobfollo/core";
import type { StoredItem } from "@jobfollo/data";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useServices } from "../boot/index.js";
import { useDataRevision, usePreferences } from "../shell/index.js";
import { formatDisplayDate, useLocalToday } from "../time/index.js";

interface CalendarEvent {
  itemId: string;
  itemTitle: string;
  company?: string;
  stepKey: string;
  stepTitle: string;
  dueDate: ISODate;
  status: StepStatus;
}

export interface CalendarPageProps {
  todayOverride?: ISODate;
}

function toIsoDate(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function CalendarPage({ todayOverride }: CalendarPageProps = {}) {
  const { t } = useTranslation();
  const services = useServices();
  const { resolvedLocale, skipWeekends } = usePreferences();
  const { revision } = useDataRevision();
  const hookToday = useLocalToday();
  const today = todayOverride ?? hookToday;

  const [todayYear, todayMonth] = useMemo(() => {
    const [y, m] = today.split("-").map(Number);
    return [y!, m!] as const;
  }, [today]);

  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth);
  const [selectedDate, setSelectedDate] = useState<ISODate>(today);
  const [items, setItems] = useState<StoredItem[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([services.items.list(), services.workflows.listAll()]).then(
      ([loadedItems, wfEntries]) => {
        if (!active) return;
        setItems(loadedItems);
        setWorkflows(wfEntries.map((e) => e.workflow));
      },
    );
    return () => {
      active = false;
    };
  }, [services, revision]);

  const eventsByDate = useMemo(() => {
    const wfMap = new Map(workflows.map((w) => [w.id, w]));
    const map = new Map<ISODate, CalendarEvent[]>();

    for (const item of items) {
      const wf = wfMap.get(item.workflowId);
      if (!wf) continue;
      const schedule = computeSchedule(item, wf, today, { skipWeekends });
      for (const step of schedule) {
        if (
          !step.dueDate ||
          (step.status !== "overdue" && step.status !== "due_today" && step.status !== "pending")
        ) {
          continue;
        }
        const ev: CalendarEvent = {
          itemId: item.id,
          itemTitle: item.title,
          company: item.company,
          stepKey: step.stepKey,
          stepTitle: localizedText(step.title, step.titles, resolvedLocale),
          dueDate: step.dueDate,
          status: step.status,
        };
        const list = map.get(step.dueDate);
        if (list) list.push(ev);
        else map.set(step.dueDate, [ev]);
      }
    }

    return map;
  }, [items, workflows, today, resolvedLocale, skipWeekends]);

  // Build 42-cell (6 weeks, Monday-first) grid for (viewYear, viewMonth)
  const cells = useMemo(() => {
    const firstOfMonth = toIsoDate(viewYear, viewMonth, 1);
    // Convert Sunday=0..Saturday=6 into Monday=0..Sunday=6
    const mondayOffset = (dayOfWeek(firstOfMonth) + 6) % 7;
    const gridStart = addDays(firstOfMonth, -mondayOffset);

    return Array.from({ length: 42 }, (_, idx) => {
      const date = addDays(gridStart, idx);
      const [y, m, d] = date.split("-").map(Number);
      return {
        date,
        dayNumber: d!,
        inMonth: y === viewYear && m === viewMonth,
      };
    });
  }, [viewYear, viewMonth]);

  const monthHeading = useMemo(() => {
    const localeTag = resolvedLocale === "tr" ? "tr-TR" : "en-US";
    return new Intl.DateTimeFormat(localeTag, { month: "long", year: "numeric" }).format(
      new Date(viewYear, viewMonth - 1, 1),
    );
  }, [viewYear, viewMonth, resolvedLocale]);

  const weekdayLabels = useMemo(() => {
    const localeTag = resolvedLocale === "tr" ? "tr-TR" : "en-US";
    const fmt = new Intl.DateTimeFormat(localeTag, { weekday: "short" });
    // 2026-03-02 is a Monday
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 2, 2 + i)));
  }, [resolvedLocale]);

  const goPrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    setViewYear(todayYear);
    setViewMonth(todayMonth);
    setSelectedDate(today);
  };

  const selectedEvents = eventsByDate.get(selectedDate) ?? [];

  return (
    <section className="w-full space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("pages.calendar.title")}
          </h1>
          <p className="text-sm text-[var(--fg-muted)]">
            {t("pages.calendar.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t("pages.calendar.prevMonth")}
            onClick={goPrevMonth}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-1.5 hover:bg-[var(--surface-muted)]"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="min-w-36 text-center text-sm font-semibold capitalize">
            {monthHeading}
          </span>
          <button
            type="button"
            aria-label={t("pages.calendar.nextMonth")}
            onClick={goNextMonth}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-1.5 hover:bg-[var(--surface-muted)]"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-muted)]"
          >
            {t("pages.calendar.goToday")}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)] lg:col-span-8">
          <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-muted)]/70 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
            {weekdayLabels.map((label) => (
              <div key={label} className="py-2.5">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((cell) => {
              const dayEvents = eventsByDate.get(cell.date) ?? [];
              const isSelected = cell.date === selectedDate;
              const isToday = cell.date === today;

              return (
                <button
                  key={cell.date}
                  type="button"
                  data-testid={`calendar-day-${cell.date}`}
                  onClick={() => setSelectedDate(cell.date)}
                  className={`flex min-h-24 flex-col items-start gap-1 border-b border-r border-[var(--border)]/70 p-2 text-left transition-colors [&:nth-child(7n)]:border-r-0 ${
                    !cell.inMonth ? "bg-[var(--surface-muted)]/35 text-[var(--fg-muted)]" : ""
                  } ${
                    isSelected
                      ? "bg-[var(--accent-soft)] ring-1 ring-inset ring-[var(--primary)]"
                      : "hover:bg-[var(--surface-muted)]/60"
                  }`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                      isToday
                        ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                        : ""
                    }`}
                  >
                    {cell.dayNumber}
                  </span>
                  {dayEvents.slice(0, 2).map((ev) => (
                    <span
                      key={`${ev.itemId}-${ev.stepKey}`}
                      className={`w-full truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                        ev.status === "overdue"
                          ? "bg-[var(--danger-bg)] text-[var(--danger)]"
                          : ev.status === "due_today"
                            ? "bg-[var(--warning-bg)] text-[var(--warning)]"
                            : "bg-[var(--surface-muted)] text-[var(--fg)]"
                      }`}
                    >
                      {ev.company ?? ev.itemTitle}
                    </span>
                  ))}
                  {dayEvents.length > 2 && (
                    <span className="text-[10px] text-[var(--fg-muted)]">
                      {t("pages.calendar.moreSteps", { count: dayEvents.length - 2 })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day detail panel */}
        <aside className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] lg:col-span-4">
          <h2 className="text-sm font-semibold">
            {formatDisplayDate(selectedDate, resolvedLocale)}
          </h2>
          {selectedEvents.length === 0 ? (
            <p className="text-xs text-[var(--fg-muted)]">
              {t("pages.calendar.selectedDayEmpty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {selectedEvents.map((ev) => (
                <li
                  key={`${ev.itemId}-${ev.stepKey}`}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-xs"
                >
                  <Link
                    to={`/items/${ev.itemId}`}
                    className="font-semibold hover:underline"
                  >
                    {ev.itemTitle}
                  </Link>
                  {ev.company && (
                    <div className="text-[var(--fg-muted)]">{ev.company}</div>
                  )}
                  <div className="mt-1 font-medium text-[var(--primary)]">
                    {ev.stepTitle}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}
