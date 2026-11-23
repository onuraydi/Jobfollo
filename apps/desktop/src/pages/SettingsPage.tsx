import type { LanguageSetting, ThemeSetting } from "@jobfollo/data";
import { Database, Globe, Palette } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useServices } from "../boot/index.js";
import { usePreferences } from "../shell/index.js";

const LANGUAGE_OPTIONS: readonly LanguageSetting[] = ["system", "en", "tr"];
const THEME_OPTIONS: readonly ThemeSetting[] = ["system", "light", "dark"];

export function SettingsPage() {
  const { t } = useTranslation();
  const { dataLocation } = useServices();
  const { language, theme, setLanguage, setTheme } = usePreferences();

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("pages.settings.title")}
        </h1>
        <p className="text-sm text-[var(--fg-muted)]">
          {t("pages.settings.subtitle")}
        </p>
      </header>

      <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-base font-semibold">
          {t("pages.settings.appearanceHeading")}
        </h2>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] pt-4">
          <div className="space-y-0.5">
            <label
              htmlFor="settings-language"
              className="inline-flex items-center gap-1.5 text-sm font-medium"
            >
              <Globe className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
              <span>{t("language.label")}</span>
            </label>
            <p className="text-xs text-[var(--fg-muted)]">
              {t("pages.settings.languageDescription")}
            </p>
          </div>
          <select
            id="settings-language"
            value={language}
            onChange={(e) => void setLanguage(e.target.value as LanguageSetting)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--fg)]"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {t(`language.${opt}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] pt-4">
          <div className="space-y-0.5">
            <label
              htmlFor="settings-theme"
              className="inline-flex items-center gap-1.5 text-sm font-medium"
            >
              <Palette className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
              <span>{t("theme.label")}</span>
            </label>
            <p className="text-xs text-[var(--fg-muted)]">
              {t("pages.settings.themeDescription")}
            </p>
          </div>
          <select
            id="settings-theme"
            value={theme}
            onChange={(e) => void setTheme(e.target.value as ThemeSetting)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--fg)]"
          >
            {THEME_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {t(`theme.${opt}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="inline-flex items-center gap-1.5 text-base font-semibold">
          <Database className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
          <span>{t("pages.settings.storageHeading")}</span>
        </h2>

        <div className="space-y-1.5">
          <label
            htmlFor="settings-data-location"
            className="block text-sm font-medium"
          >
            {t("pages.settings.dataLocationLabel")}
          </label>
          <input
            id="settings-data-location"
            type="text"
            readOnly
            value={dataLocation ?? ""}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 font-mono text-xs text-[var(--fg-muted)]"
          />
          <p className="text-xs text-[var(--fg-muted)]">
            {t("pages.settings.dataLocationDescription")}
          </p>
        </div>
      </div>
    </section>
  );
}
