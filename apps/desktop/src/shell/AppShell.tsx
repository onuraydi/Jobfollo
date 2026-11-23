import { CalendarCheck2, FolderKanban, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Route, Routes } from "react-router";
import { cn } from "../lib/cn.js";
import { ItemDetailPage } from "../pages/ItemDetailPage.js";
import { ItemsPage } from "../pages/ItemsPage.js";
import { SettingsPage } from "../pages/SettingsPage.js";
import { TodayPage } from "../pages/TodayPage.js";
import { useDigestScheduler } from "../reminders/index.js";

export function AppShell() {
  const { t } = useTranslation();
  useDigestScheduler();

  const navItems = [
    { to: "/", label: t("nav.today"), icon: CalendarCheck2, end: true },
    { to: "/items", label: t("nav.items"), icon: FolderKanban, end: false },
    { to: "/settings", label: t("nav.settings"), icon: Settings, end: false },
  ];

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-[var(--primary)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--primary-fg)]"
      >
        {t("app.skipToContent")}
      </a>

      <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] px-3 py-4">
        <div className="mb-6 px-3 text-base font-semibold tracking-tight">
          {t("app.name")}
        </div>

        <nav aria-label={t("nav.label")} className="flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                    : "text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)]",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/items" element={<ItemsPage />} />
          <Route path="/items/:id" element={<ItemDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
