import type { ThemeSetting } from "@jobfollo/data";
import {
  BarChart3,
  Briefcase,
  CalendarCheck2,
  CalendarDays,
  FileText,
  FolderKanban,
  GitBranch,
  Monitor,
  Moon,
  Search,
  Send,
  Settings,
  Sun,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Route, Routes } from "react-router";
import { cn } from "../lib/cn.js";
import { CalendarPage } from "../pages/CalendarPage.js";
import { ItemDetailPage } from "../pages/ItemDetailPage.js";
import { ItemsPage } from "../pages/ItemsPage.js";
import { SettingsPage } from "../pages/SettingsPage.js";
import { StatsPage } from "../pages/StatsPage.js";
import { TemplatesPage } from "../pages/TemplatesPage.js";
import { TodayPage } from "../pages/TodayPage.js";
import { WorkflowsPage } from "../pages/WorkflowsPage.js";
import { useDigestScheduler } from "../reminders/index.js";
import { CommandPalette } from "./CommandPalette.js";
import { usePreferences } from "./PreferencesContext.js";

const QUICK_THEMES: ReadonlyArray<{ id: ThemeSetting; icon: typeof Sun }> = [
  { id: "light", icon: Sun },
  { id: "dark", icon: Moon },
  { id: "system", icon: Monitor },
];

export function AppShell() {
  const { t } = useTranslation();
  const { theme, setTheme } = usePreferences();
  const [paletteOpen, setPaletteOpen] = useState(false);
  useDigestScheduler();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const trackingNavItems = [
    { to: "/", label: t("nav.today"), icon: CalendarCheck2, end: true },
    { to: "/job-postings", label: t("nav.jobPostings"), icon: Briefcase, end: false },
    { to: "/general-applications", label: t("nav.generalApplications"), icon: Send, end: false },
    { to: "/items", label: t("nav.items"), icon: FolderKanban, end: false },
  ];

  const workspaceNavItems = [
    { to: "/calendar", label: t("nav.calendar"), icon: CalendarDays, end: false },
    { to: "/stats", label: t("nav.stats"), icon: BarChart3, end: false },
    { to: "/templates", label: t("nav.templates"), icon: FileText, end: false },
    { to: "/workflows", label: t("nav.workflows"), icon: GitBranch, end: false },
    { to: "/settings", label: t("nav.settings"), icon: Settings, end: false },
  ];

  return (
    <div className="flex h-screen overflow-hidden text-[var(--fg)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--primary)] focus:px-3 focus:py-2 text-sm font-medium focus:text-[var(--primary-fg)]"
      >
        {t("app.skipToContent")}
      </a>

      <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]/95 px-3.5 py-5 backdrop-blur-md">
        <div className="mb-4 flex items-center gap-3 px-2">
          <img
            src="/logo.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-xl shadow-sm"
          />
          <div className="min-w-0">
            <div className="truncate text-base font-bold leading-tight tracking-tight">
              {t("app.name")}
            </div>
            <div className="truncate text-xs text-[var(--fg-muted)]">
              {t("app.tagline")}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mb-5 flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)]/80 px-3 py-2 text-xs text-[var(--fg-muted)] transition-colors hover:border-[var(--fg-muted)]/40 hover:text-[var(--fg)]"
        >
          <span className="inline-flex items-center gap-2 truncate">
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t("commandPalette.openButton")}</span>
          </span>
          <kbd className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px]">
            Ctrl+K
          </kbd>
        </button>

        <nav aria-label={t("nav.label")} className="flex flex-1 flex-col gap-5 overflow-y-auto pr-0.5">
          <div className="flex flex-col gap-1">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]/80">
              {t("nav.sectionTracking")}
            </div>
            {trackingNavItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                    isActive
                      ? "bg-[var(--primary)] text-[var(--primary-fg)] shadow-sm"
                      : "text-[var(--fg-muted)] hover:bg-[var(--surface-muted)]/80 hover:text-[var(--fg)]",
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]/80">
              {t("nav.sectionTools")}
            </div>
            {workspaceNavItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                    isActive
                      ? "bg-[var(--primary)] text-[var(--primary-fg)] shadow-sm"
                      : "text-[var(--fg-muted)] hover:bg-[var(--surface-muted)]/80 hover:text-[var(--fg)]",
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="mt-4 border-t border-[var(--border)] pt-3.5">
          <div
            role="group"
            aria-label={t("theme.label")}
            className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface-muted)] p-1"
          >
            {QUICK_THEMES.map(({ id, icon: Icon }) => {
              const active = theme === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={t(`theme.${id}`)}
                  aria-pressed={active}
                  title={t(`theme.${id}`)}
                  onClick={() => void setTheme(id)}
                  className={cn(
                    "flex items-center justify-center rounded-lg py-1.5 text-xs font-medium transition-all",
                    active
                      ? "bg-[var(--surface)] text-[var(--fg)] shadow-xs"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto w-full max-w-[1600px]">
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route
              path="/job-postings"
              element={<ItemsPage key="job_posting" lockedApplicationType="job_posting" />}
            />
            <Route
              path="/general-applications"
              element={<ItemsPage key="general" lockedApplicationType="general" />}
            />
            <Route path="/items" element={<ItemsPage key="all" />} />
            <Route path="/items/:id" element={<ItemDetailPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/workflows" element={<WorkflowsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
