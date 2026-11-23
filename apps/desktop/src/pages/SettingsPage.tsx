import {
  SettingValidationError,
  type LanguageSetting,
  type SmtpSecuritySetting,
  type ThemeSetting,
} from "@jobfollo/data";
import { Database, Globe, KeyRound, Mail, Palette, Send } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useServices } from "../boot/index.js";
import { usePreferences } from "../shell/index.js";

const LANGUAGE_OPTIONS: readonly LanguageSetting[] = ["system", "en", "tr"];
const THEME_OPTIONS: readonly ThemeSetting[] = ["system", "light", "dark"];

export function SettingsPage() {
  const { t } = useTranslation();
  const { settings, dataLocation, mail } = useServices();
  const { language, theme, setLanguage, setTheme } = usePreferences();

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
    ]).then(([all, storedPassword]) => {
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
    });
    return () => {
      active = false;
    };
  }, [settings, mail]);

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

      <form
        onSubmit={(e) => void handleSaveEmailSettings(e)}
        noValidate
        className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
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
