import {
  computeStats,
  type ApplicationType,
  type ItemPriority,
  type WorkMode,
} from "@jobfollo/core";
import type { StoredItem } from "@jobfollo/data";
import { Award, BarChart3, Briefcase, MessageSquare, Target, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServices } from "../boot/index.js";
import { useDataRevision } from "../shell/index.js";
import { useLocalToday } from "../time/index.js";

const OUTCOME_ORDER = ["in_progress", "reply", "interview", "offer", "negative"] as const;
const APP_TYPES: readonly (ApplicationType | "unspecified")[] = [
  "job_posting",
  "general",
  "unspecified",
];
const WORK_MODES: readonly (WorkMode | "unspecified")[] = [
  "remote",
  "hybrid",
  "onsite",
  "unspecified",
];
const PRIORITIES: readonly ItemPriority[] = ["high", "normal", "low"];

export function StatsPage() {
  const { t } = useTranslation();
  const services = useServices();
  const { revision } = useDataRevision();
  const today = useLocalToday();

  const [includeArchived, setIncludeArchived] = useState(true);
  const [items, setItems] = useState<StoredItem[]>([]);
  const [weeklyGoal, setWeeklyGoal] = useState<number>(5);

  useEffect(() => {
    let active = true;
    void Promise.all([
      services.items.list({ includeArchived }),
      services.settings.get("goals.weeklyApplications"),
    ]).then(([loaded, goal]) => {
      if (!active) return;
      setItems(loaded);
      setWeeklyGoal(goal);
    });
    return () => {
      active = false;
    };
  }, [services, includeArchived, revision]);

  const stats = useMemo(() => computeStats(items, today), [items, today]);

  const handleGoalChange = async (value: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) return;
    setWeeklyGoal(parsed);
    await services.settings.set("goals.weeklyApplications", parsed);
  };

  const goalPct =
    weeklyGoal > 0 ? Math.min(100, Math.round((stats.recent7DaysCount / weeklyGoal) * 100)) : 0;

  return (
    <section className="w-full space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pages.stats.title")}</h1>
          <p className="text-sm text-[var(--fg-muted)]">{t("pages.stats.subtitle")}</p>
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          <span>{t("pages.stats.includeArchived")}</span>
        </label>
      </header>

      {stats.total === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--fg-muted)]">
          {t("pages.stats.emptyState")}
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between text-xs font-medium text-[var(--fg-muted)]">
                <span>{t("pages.stats.totalItems")}</span>
                <Briefcase className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
              </div>
              <div
                data-testid="stat-total"
                className="mt-2 text-2xl font-bold tracking-tight"
              >
                {stats.total}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between text-xs font-medium text-[var(--fg-muted)]">
                <span>{t("pages.stats.responseRate")}</span>
                <MessageSquare className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
              </div>
              <div
                data-testid="stat-response-rate"
                className="mt-2 text-2xl font-bold tracking-tight text-[var(--primary)]"
              >
                {stats.responseRate}%
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between text-xs font-medium text-[var(--fg-muted)]">
                <span>{t("pages.stats.interviewRate")}</span>
                <TrendingUp className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
              </div>
              <div
                data-testid="stat-interview-rate"
                className="mt-2 text-2xl font-bold tracking-tight"
              >
                {stats.interviewRate}%
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between text-xs font-medium text-[var(--fg-muted)]">
                <span>{t("pages.stats.offerRate")}</span>
                <Award className="h-4 w-4 text-[var(--success)]" aria-hidden="true" />
              </div>
              <div
                data-testid="stat-offer-rate"
                className="mt-2 text-2xl font-bold tracking-tight text-[var(--success)]"
              >
                {stats.offerRate}%
              </div>
            </div>
          </div>

          {/* Weekly goal & Outcome funnel side-by-side */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="flex flex-col justify-between space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] lg:col-span-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="inline-flex items-center gap-1.5 text-base font-semibold">
                  <Target className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
                  <span>{t("pages.stats.weeklyGoalHeading")}</span>
                </h2>
                <label className="inline-flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                  <span>{t("pages.stats.weeklyGoalLabel")}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={weeklyGoal}
                    onChange={(e) => void handleGoalChange(e.target.value)}
                    className="w-16 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--fg)]"
                  />
                </label>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">
                    {t("pages.stats.weeklyGoalProgress", {
                      done: stats.recent7DaysCount,
                      target: weeklyGoal,
                    })}
                  </span>
                  <span className="font-semibold text-[var(--primary)]">{goalPct}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                  <div
                    className="h-full rounded-full bg-[var(--primary)] transition-all"
                    style={{ width: `${goalPct}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] lg:col-span-7">
              <h2 className="inline-flex items-center gap-1.5 text-base font-semibold">
                <BarChart3 className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
                <span>{t("pages.stats.funnelHeading")}</span>
              </h2>
              <div className="space-y-2.5">
                {OUTCOME_ORDER.map((outcomeKey) => {
                  const count = stats.byOutcome[outcomeKey];
                  const widthPct = Math.round((count / stats.total) * 100);
                  return (
                    <div key={outcomeKey} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{t(`outcomes.${outcomeKey}`)}</span>
                        <span className="text-[var(--fg-muted)]">
                          {count} ({widthPct}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                        <div
                          className="h-full rounded-full bg-[var(--primary)] transition-all"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Breakdowns */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-sm font-semibold">
                {t("pages.stats.byApplicationTypeHeading")}
              </h2>
              <ul className="space-y-2 text-xs">
                {APP_TYPES.map((appType) => (
                  <li key={appType} className="flex items-center justify-between">
                    <span>{t(`applicationType.${appType}`)}</span>
                    <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 font-medium">
                      {stats.byApplicationType[appType]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-sm font-semibold">{t("pages.stats.byChannelHeading")}</h2>
              {stats.byChannel.length === 0 ? (
                <p className="text-xs text-[var(--fg-muted)]">{t("pages.stats.noChannels")}</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {stats.byChannel.map((bucket) => (
                    <li key={bucket.label} className="flex items-center justify-between">
                      <span>{bucket.label}</span>
                      <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 font-medium">
                        {bucket.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-sm font-semibold">{t("pages.stats.byWorkModeHeading")}</h2>
              <ul className="space-y-2 text-xs">
                {WORK_MODES.map((wm) => (
                  <li key={wm} className="flex items-center justify-between">
                    <span>{t(`workMode.${wm}`)}</span>
                    <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 font-medium">
                      {stats.byWorkMode[wm]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-sm font-semibold">{t("pages.stats.byPriorityHeading")}</h2>
              <ul className="space-y-2 text-xs">
                {PRIORITIES.map((p) => (
                  <li key={p} className="flex items-center justify-between">
                    <span>{t(`priority.${p}`)}</span>
                    <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 font-medium">
                      {stats.byPriority[p]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
