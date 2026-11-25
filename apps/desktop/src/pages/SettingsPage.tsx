import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import {
  SettingValidationError,
  type DensitySetting,
  type FontSetting,
  type LanguageSetting,
  type PaletteSetting,
  type ReminderLogEntry,
  type SmtpSecuritySetting,
  type ThemeSetting,
} from "@jobfollo/data";
import {
  Bell,
  Briefcase,
  Check,
  Database,
  Download,
  Globe,
  History,
  KeyRound,
  Mail,
  Palette,
  Power,
  Send,
  SlidersHorizontal,
  Sparkles,
  Type,
  Upload,
} from "lucide-react";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useServices } from "../boot/index.js";
import { useDataRevision, usePreferences } from "../shell/index.js";
import { sendDesktopNotification } from "../reminders/index.js";
import { formatDisplayDate } from "../time/index.js";
import {
  createBackupPayload,
  parseBackupJson,
  restoreBackup,
} from "../transfer/index.js";

const LANGUAGE_OPTIONS: readonly LanguageSetting[] = ["system", "en", "tr"];
const THEME_OPTIONS: readonly ThemeSetting[] = ["system", "light", "dark"];
const DENSITY_OPTIONS: readonly DensitySetting[] = ["comfortable", "compact"];

const PALETTE_SWATCHES: ReadonlyArray<{
  id: PaletteSetting;
  primary: string;
  surface: string;
  accent: string;
}> = [
  { id: "ocean", primary: "#2563eb", surface: "#f6f8fc", accent: "#0ea5e9" },
  { id: "forest", primary: "#059669", surface: "#f4f8f5", accent: "#10b981" },
  { id: "sunset", primary: "#c2410c", surface: "#fbf8f3", accent: "#f59e0b" },
  { id: "rose", primary: "#be123c", surface: "#fdf6f8", accent: "#f43f5e" },
  { id: "nord", primary: "#4c6ef5", surface: "#f1f5f8", accent: "#88c0d0" },
];

const FONT_PREVIEWS: ReadonlyArray<{ id: FontSetting; family: string }> = [
  {
    id: "system",
    family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  {
    id: "editorial",
    family: '"Iowan Old Style", "Palatino Linotype", Georgia, Cambria, serif',
  },
  {
    id: "humanist",
    family: '"Segoe UI Variable", "Segoe UI", Calibri, "Trebuchet MS", sans-serif',
  },
  {
    id: "mono",
    family: '"Cascadia Code", "JetBrains Mono", "SFMono-Regular", Consolas, monospace',
  },
];

export function SettingsPage() {
  const { t } = useTranslation();
  const services = useServices();
  const { settings, reminderLog, dataLocation, mail } = services;
  const {
    language,
    resolvedLocale,
    theme,
    palette,
    font,
    density,
    skipWeekends,
    desktopNotifications,
    setLanguage,
    setTheme,
    setPalette,
    setFont,
    setDensity,
    setSkipWeekends,
    setDesktopNotifications,
  } = usePreferences();
  const { bumpRevision } = useDataRevision();

  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [sendTime, setSendTime] = useState("09:00");
  const [recipient, setRecipient] = useState("");
  const [upcomingDays, setUpcomingDays] = useState("0");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecurity, setSmtpSecurity] = useState<SmtpSecuritySetting>("starttls");
  const [smtpUsername, setSmtpUsername] = useState("");

  const [passwordInput, setPasswordInput] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [recentLogs, setRecentLogs] = useState<ReminderLogEntry[]>([]);
  const [autostartAvailable, setAutostartAvailable] = useState(false);
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [backupStatus, setBackupStatus] = useState<
    { kind: "idle" } | { kind: "success"; message: string } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "success"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    let active = true;
    void Promise.all([
      settings.getAll(),
      mail ? mail.hasPassword().catch(() => false) : Promise.resolve(false),
      reminderLog.recent(5).catch(() => [] as ReminderLogEntry[]),
    ]).then(([all, storedPassword, logs]) => {
      if (!active) return;
      const v = all.values;
      setRemindersEnabled(v["reminders.enabled"]);
      setSendTime(v["reminders.sendTime"]);
      setRecipient(v["reminders.recipient"] ?? "");
      setUpcomingDays(String(v["reminders.upcomingDays"]));
      setSmtpHost(v["smtp.host"] ?? "");
      setSmtpPort(String(v["smtp.port"]));
      setSmtpSecurity(v["smtp.security"]);
      setSmtpUsername(v["smtp.username"] ?? "");
      setHasPassword(storedPassword);
      setRecentLogs(logs);
    });
    return () => {
      active = false;
    };
  }, [settings, reminderLog, mail]);

  useEffect(() => {
    let active = true;
    void isAutostartEnabled()
      .then((enabled) => {
        if (!active) return;
        setAutostartAvailable(true);
        setAutostartEnabled(enabled);
      })
      .catch(() => {
        if (!active) return;
        setAutostartAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleToggleAutostart = async (checked: boolean) => {
    try {
      if (checked) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
      setAutostartEnabled(checked);
    } catch {
      // Ignore when running outside Tauri runtime
    }
  };

  const handleDownloadBackup = async () => {
    setBackupStatus({ kind: "idle" });
    const payload = await createBackupPayload(services);
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jobfollo-backup-${services.localToday()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleRestoreFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBackupStatus({ kind: "idle" });

    const text = await file.text();
    const parsed = parseBackupJson(text);
    if (!parsed.ok) {
      setBackupStatus({ kind: "error", message: parsed.error });
      return;
    }

    const confirmed = window.confirm(
      t("pages.settings.restoreConfirm", {
        workflows: parsed.payload.customWorkflows.length,
        items: parsed.payload.items.length,
      }),
    );
    if (!confirmed) return;

    try {
      const summary = await restoreBackup(services, parsed.payload);
      bumpRevision();
      setBackupStatus({
        kind: "success",
        message: t("pages.settings.restoreSuccess", {
          workflows: summary.workflowsRestored,
          items: summary.itemsRestored,
        }),
      });
    } catch (err) {
      setBackupStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleSaveEmailSettings = async (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setSaveMessage(null);
    setTestStatus({ kind: "idle" });

    const parsedPort = Number(smtpPort);
    const parsedUpcoming = Number(upcomingDays);

    try {
      await settings.setMany({
        "reminders.enabled": remindersEnabled,
        "reminders.sendTime": sendTime.trim(),
        "reminders.recipient": recipient.trim() ? recipient.trim() : null,
        "reminders.upcomingDays": Number.isFinite(parsedUpcoming) ? parsedUpcoming : -1,
        "smtp.host": smtpHost.trim() ? smtpHost.trim() : null,
        "smtp.port": Number.isFinite(parsedPort) ? parsedPort : -1,
        "smtp.security": smtpSecurity,
        "smtp.username": smtpUsername.trim() ? smtpUsername.trim() : null,
      });

      if (passwordInput.length > 0 && mail) {
        await mail.setPassword(passwordInput);
        setPasswordInput("");
        setHasPassword(true);
      }

      setSaveMessage(t("pages.settings.emailSettingsSaved"));
    } catch (err) {
      if (err instanceof SettingValidationError) {
        const mapped: Record<string, string> = {};
        for (const issue of err.issues) {
          if (!mapped[issue.field]) mapped[issue.field] = issue.message;
        }
        setFieldErrors(mapped);
      } else {
        setTestStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  const handleClearPassword = async () => {
    if (!mail) return;
    setTestStatus({ kind: "idle" });
    try {
      await mail.deletePassword();
      setHasPassword(false);
      setPasswordInput("");
    } catch (err) {
      setTestStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleSendTestEmail = async () => {
    if (!mail) return;
    setTestStatus({ kind: "idle" });

    const host = smtpHost.trim();
    const username = smtpUsername.trim();
    const to = recipient.trim();
    const port = Number(smtpPort);

    if (!host || !username || !to || !Number.isInteger(port) || port < 1 || !hasPassword) {
      setTestStatus({
        kind: "error",
        message: t("pages.settings.testEmailMissingConfig"),
      });
      return;
    }

    setTestStatus({ kind: "sending" });
    try {
      const subject = t("pages.settings.testEmailSubject");
      const body = t("pages.settings.testEmailBody");
      await mail.sendEmail({
        host,
        port,
        security: smtpSecurity,
        username,
        recipient: to,
        subject,
        text: body,
        html: `<p>${body}</p>`,
      });
      setTestStatus({
        kind: "success",
        message: t("pages.settings.testEmailSuccess"),
      });
    } catch (err) {
      setTestStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <section className="w-full space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("pages.settings.title")}
        </h1>
        <p className="text-sm text-[var(--fg-muted)]">
          {t("pages.settings.subtitle")}
        </p>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
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

        {/* Color palette swatches */}
        <div className="space-y-3 border-t border-[var(--border)] pt-4">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
              <span>{t("pages.settings.paletteLabel")}</span>
            </div>
            <p className="text-xs text-[var(--fg-muted)]">
              {t("pages.settings.paletteDescription")}
            </p>
          </div>
          <div
            role="group"
            aria-label={t("pages.settings.paletteLabel")}
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-5"
          >
            {PALETTE_SWATCHES.map((swatch) => {
              const selected = palette === swatch.id;
              return (
                <button
                  key={swatch.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => void setPalette(swatch.id)}
                  className={`flex flex-col items-start gap-2 rounded-lg border p-2.5 text-left transition-all ${
                    selected
                      ? "border-[var(--primary)] bg-[var(--accent-soft)] ring-1 ring-[var(--primary)]"
                      : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--fg-muted)]/40"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span
                        className="h-4 w-4 rounded-full border border-black/10"
                        style={{ backgroundColor: swatch.primary }}
                        aria-hidden="true"
                      />
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-black/10"
                        style={{ backgroundColor: swatch.accent }}
                        aria-hidden="true"
                      />
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-black/10"
                        style={{ backgroundColor: swatch.surface }}
                        aria-hidden="true"
                      />
                    </div>
                    {selected && (
                      <Check className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden="true" />
                    )}
                  </div>
                  <span className="text-xs font-medium">{t(`palette.${swatch.id}`)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Typography cards */}
        <div className="space-y-3 border-t border-[var(--border)] pt-4">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 text-sm font-medium">
              <Type className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
              <span>{t("pages.settings.fontLabel")}</span>
            </div>
            <p className="text-xs text-[var(--fg-muted)]">
              {t("pages.settings.fontDescription")}
            </p>
          </div>
          <div
            role="group"
            aria-label={t("pages.settings.fontLabel")}
            className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
          >
            {FONT_PREVIEWS.map((preset) => {
              const selected = font === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => void setFont(preset.id)}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                    selected
                      ? "border-[var(--primary)] bg-[var(--accent-soft)] ring-1 ring-[var(--primary)]"
                      : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--fg-muted)]/40"
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-xs font-semibold">{t(`font.${preset.id}`)}</div>
                    <div
                      className="truncate text-sm text-[var(--fg-muted)]"
                      style={{ fontFamily: preset.family }}
                    >
                      {t("pages.settings.fontPreviewSample")}
                    </div>
                  </div>
                  {selected && (
                    <Check
                      className="h-4 w-4 shrink-0 text-[var(--primary)]"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Layout density */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] pt-4">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 text-sm font-medium">
              <SlidersHorizontal className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
              <span>{t("pages.settings.densityLabel")}</span>
            </div>
            <p className="text-xs text-[var(--fg-muted)]">
              {t("pages.settings.densityDescription")}
            </p>
          </div>
          <div
            role="group"
            aria-label={t("pages.settings.densityLabel")}
            className="inline-flex rounded-md border border-[var(--border)] bg-[var(--bg)] p-0.5"
          >
            {DENSITY_OPTIONS.map((opt) => {
              const selected = density === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => void setDensity(opt)}
                  className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                    selected
                      ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                  }`}
                >
                  {t(`density.${opt}`)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] pt-4">
          <div className="space-y-0.5">
            <label
              htmlFor="settings-autostart"
              className="inline-flex items-center gap-1.5 text-sm font-medium"
            >
              <Power className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
              <span>{t("pages.settings.autostartLabel")}</span>
            </label>
            <p className="text-xs text-[var(--fg-muted)]">
              {t("pages.settings.autostartDescription")}
            </p>
          </div>
          <input
            id="settings-autostart"
            type="checkbox"
            disabled={!autostartAvailable}
            checked={autostartEnabled}
            onChange={(e) => void handleToggleAutostart(e.target.checked)}
            className="h-4 w-4"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] pt-4">
          <div className="space-y-0.5">
            <label
              htmlFor="settings-skip-weekends"
              className="inline-flex items-center gap-1.5 text-sm font-medium"
            >
              <Briefcase className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
              <span>{t("pages.settings.skipWeekendsLabel")}</span>
            </label>
            <p className="text-xs text-[var(--fg-muted)]">
              {t("pages.settings.skipWeekendsDescription")}
            </p>
          </div>
          <input
            id="settings-skip-weekends"
            type="checkbox"
            checked={skipWeekends}
            onChange={(e) => void setSkipWeekends(e.target.checked)}
            className="h-4 w-4"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] pt-4">
          <div className="space-y-0.5">
            <label
              htmlFor="settings-desktop-notifications"
              className="inline-flex items-center gap-1.5 text-sm font-medium"
            >
              <Bell className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
              <span>{t("pages.settings.desktopNotificationsLabel")}</span>
            </label>
            <p className="text-xs text-[var(--fg-muted)]">
              {t("pages.settings.desktopNotificationsDescription")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                void sendDesktopNotification(
                  t("pages.settings.testNotificationTitle"),
                  t("pages.settings.testNotificationBody"),
                )
              }
              className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-muted)]"
            >
              {t("pages.settings.testNotification")}
            </button>
            <input
              id="settings-desktop-notifications"
              type="checkbox"
              checked={desktopNotifications}
              onChange={(e) => void setDesktopNotifications(e.target.checked)}
              className="h-4 w-4"
            />
          </div>
        </div>
      </div>
        </div>

        <div className="space-y-6">
          <form
            onSubmit={(e) => void handleSaveEmailSettings(e)}
            noValidate
            className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"
          >
        <div className="space-y-1">
          <h2 className="inline-flex items-center gap-1.5 text-base font-semibold">
            <Mail className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
            <span>{t("pages.settings.emailHeading")}</span>
          </h2>
          <p className="text-xs text-[var(--fg-muted)]">
            {t("pages.settings.emailPrivacyNote")}
          </p>
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <label className="inline-flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={remindersEnabled}
              onChange={(e) => setRemindersEnabled(e.target.checked)}
            />
            <span>{t("pages.settings.remindersEnabled")}</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="settings-send-time" className="block text-xs font-medium text-[var(--fg-muted)]">
              {t("pages.settings.sendTimeLabel")}
            </label>
            <input
              id="settings-send-time"
              type="time"
              value={sendTime}
              onChange={(e) => setSendTime(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
            />
            {fieldErrors["reminders.sendTime"] && (
              <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                {fieldErrors["reminders.sendTime"]}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="settings-recipient" className="block text-xs font-medium text-[var(--fg-muted)]">
              {t("pages.settings.recipientLabel")}
            </label>
            <input
              id="settings-recipient"
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
            />
            {fieldErrors["reminders.recipient"] && (
              <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                {fieldErrors["reminders.recipient"]}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="settings-upcoming-days" className="block text-xs font-medium text-[var(--fg-muted)]">
              {t("pages.settings.upcomingDaysLabel")}
            </label>
            <input
              id="settings-upcoming-days"
              type="number"
              min={0}
              max={30}
              value={upcomingDays}
              onChange={(e) => setUpcomingDays(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
            />
            {fieldErrors["reminders.upcomingDays"] && (
              <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                {fieldErrors["reminders.upcomingDays"]}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="settings-smtp-host" className="block text-xs font-medium text-[var(--fg-muted)]">
              {t("pages.settings.smtpHostLabel")}
            </label>
            <input
              id="settings-smtp-host"
              type="text"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.gmail.com"
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
            />
            {fieldErrors["smtp.host"] && (
              <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                {fieldErrors["smtp.host"]}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="settings-smtp-port" className="block text-xs font-medium text-[var(--fg-muted)]">
              {t("pages.settings.smtpPortLabel")}
            </label>
            <input
              id="settings-smtp-port"
              type="number"
              min={1}
              max={65535}
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
            />
            {fieldErrors["smtp.port"] && (
              <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                {fieldErrors["smtp.port"]}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="settings-smtp-security" className="block text-xs font-medium text-[var(--fg-muted)]">
              {t("pages.settings.smtpSecurityLabel")}
            </label>
            <select
              id="settings-smtp-security"
              value={smtpSecurity}
              onChange={(e) => setSmtpSecurity(e.target.value as SmtpSecuritySetting)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
            >
              <option value="starttls">{t("pages.settings.smtpSecurityStarttls")}</option>
              <option value="tls">{t("pages.settings.smtpSecurityTls")}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="settings-smtp-username" className="block text-xs font-medium text-[var(--fg-muted)]">
              {t("pages.settings.smtpUsernameLabel")}
            </label>
            <input
              id="settings-smtp-username"
              type="email"
              value={smtpUsername}
              onChange={(e) => setSmtpUsername(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
            />
            {fieldErrors["smtp.username"] && (
              <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                {fieldErrors["smtp.username"]}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="settings-smtp-password" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--fg-muted)]">
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t("pages.settings.smtpPasswordLabel")}</span>
              </label>
              <span className="text-xs text-[var(--fg-muted)]">
                {hasPassword
                  ? t("pages.settings.smtpPasswordSaved")
                  : t("pages.settings.smtpPasswordNotSet")}
              </span>
            </div>
            <div className="mt-1 flex gap-2">
              <input
                id="settings-smtp-password"
                type="password"
                autoComplete="new-password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder={t("pages.settings.smtpPasswordPlaceholder")}
                className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
              />
              {hasPassword && (
                <button
                  type="button"
                  onClick={() => void handleClearPassword()}
                  className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs hover:bg-[var(--surface-muted)]"
                >
                  {t("pages.settings.clearPassword")}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="min-h-5 text-xs">
            {saveMessage && (
              <span className="font-medium text-[var(--success)]">{saveMessage}</span>
            )}
            {testStatus.kind === "success" && (
              <span className="font-medium text-[var(--success)]">{testStatus.message}</span>
            )}
            {testStatus.kind === "error" && (
              <span role="alert" className="font-medium text-[var(--danger)]">
                {testStatus.message}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={testStatus.kind === "sending"}
              onClick={() => void handleSendTestEmail()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-muted)] disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {testStatus.kind === "sending"
                  ? t("pages.settings.sendingTestEmail")
                  : t("pages.settings.sendTestEmail")}
              </span>
            </button>
            <button
              type="submit"
              className="rounded-md bg-[var(--primary)] px-3.5 py-1.5 text-sm font-medium text-[var(--primary-fg)] hover:opacity-90"
            >
              {t("pages.settings.saveEmailSettings")}
            </button>
          </div>
        </div>
          </form>

          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
            <h2 className="inline-flex items-center gap-1.5 text-base font-semibold">
              <History className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
              <span>{t("pages.settings.reminderHistoryHeading")}</span>
            </h2>

        {recentLogs.length === 0 ? (
          <p className="text-xs text-[var(--fg-muted)]">
            {t("pages.settings.reminderHistoryEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] text-xs">
            {recentLogs.map((entry, idx) => (
              <li
                key={`${entry.date}-${entry.attempt}-${idx}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="space-y-0.5">
                  <div className="font-medium">
                    {formatDisplayDate(entry.date, resolvedLocale)} ·{" "}
                    {t("pages.settings.reminderAttempt", { count: entry.attempt })}
                  </div>
                  {entry.error && (
                    <div className="text-[var(--danger)]">{entry.error}</div>
                  )}
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    entry.status === "sent"
                      ? "bg-[var(--success-bg)] text-[var(--success)]"
                      : "bg-[var(--danger-bg)] text-[var(--danger)]"
                  }`}
                >
                  {entry.status === "sent"
                    ? t("pages.settings.reminderStatusSent")
                    : t("pages.settings.reminderStatusFailed")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
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

        <div className="space-y-2 border-t border-[var(--border)] pt-4">
          <h3 className="text-sm font-medium">{t("pages.settings.backupHeading")}</h3>
          <p className="text-xs text-[var(--fg-muted)]">
            {t("pages.settings.backupDescription")}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleDownloadBackup()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-muted)]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("pages.settings.downloadBackup")}</span>
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-muted)]">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("pages.settings.restoreBackup")}</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => void handleRestoreFile(e)}
                className="sr-only"
              />
            </label>
          </div>
          {backupStatus.kind === "success" && (
            <p role="status" className="text-xs font-medium text-[var(--success)]">
              {backupStatus.message}
            </p>
          )}
          {backupStatus.kind === "error" && (
            <p role="alert" className="text-xs font-medium text-[var(--danger)]">
              {backupStatus.message}
            </p>
          )}
        </div>
      </div>
        </div>
      </div>
    </section>
  );
}
