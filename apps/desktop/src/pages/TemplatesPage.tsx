import {
  buildMailtoHref,
  buildTemplateVars,
  builtInMessageTemplates,
  renderTemplate,
  type MessageTemplate,
  type TemplateCategory,
  type TemplateChannel,
} from "@jobfollo/core";
import type { StoredItem, StoredMessageTemplate } from "@jobfollo/data";
import {
  Check,
  Copy,
  ExternalLink,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useServices } from "../boot/index.js";
import { useDataRevision, usePreferences } from "../shell/index.js";

const CATEGORIES: readonly TemplateCategory[] = [
  "application",
  "general",
  "follow_up",
  "networking",
  "thank_you",
];

const PLACEHOLDER_CHIPS = ["{{contact}}", "{{company}}", "{{role}}", "{{title}}"] as const;

interface DraftTemplate {
  id: string | null;
  name: string;
  channel: TemplateChannel;
  category: TemplateCategory;
  subject: string;
  body: string;
}

function categoryI18nKey(category: TemplateCategory): string {
  switch (category) {
    case "application":
      return "pages.templates.categoryApplication";
    case "general":
      return "pages.templates.categoryGeneral";
    case "follow_up":
      return "pages.templates.categoryFollowUp";
    case "networking":
      return "pages.templates.categoryNetworking";
    case "thank_you":
      return "pages.templates.categoryThankYou";
  }
}

export function TemplatesPage() {
  const { t } = useTranslation();
  const services = useServices();
  const { resolvedLocale } = usePreferences();
  const { revision, bumpRevision } = useDataRevision();

  const [customTemplates, setCustomTemplates] = useState<StoredMessageTemplate[]>([]);
  const [items, setItems] = useState<StoredItem[]>([]);
  const [channelFilter, setChannelFilter] = useState<"all" | TemplateChannel>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTemplate | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  // Live preview state
  const [previewItemId, setPreviewItemId] = useState<string>("manual");
  const [manualCompany, setManualCompany] = useState("Acme Teknoloji");
  const [manualRole, setManualRole] = useState("Backend Developer");
  const [manualContact, setManualContact] = useState("Ayşe");
  const [copiedKey, setCopiedKey] = useState<"subject" | "body" | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      services.templates ? services.templates.listCustom() : Promise.resolve([]),
      services.items.list(),
    ]).then(([loadedTemplates, loadedItems]) => {
      if (!active) return;
      setCustomTemplates(loadedTemplates);
      setItems(loadedItems);
    });
    return () => {
      active = false;
    };
  }, [services, revision]);

  const allTemplates = useMemo<MessageTemplate[]>(() => {
    const builtIns = builtInMessageTemplates(resolvedLocale);
    return [...customTemplates, ...builtIns];
  }, [customTemplates, resolvedLocale]);

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    return allTemplates.filter((tpl) => {
      if (channelFilter !== "all" && tpl.channel !== channelFilter) return false;
      if (q.length > 0) {
        const hay = `${tpl.name} ${tpl.subject ?? ""} ${tpl.body}`.toLocaleLowerCase("tr");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allTemplates, channelFilter, search]);

  useEffect(() => {
    if (!selectedId && filteredTemplates[0]) {
      setSelectedId(filteredTemplates[0].id);
    }
  }, [selectedId, filteredTemplates]);

  const selectedTemplate = useMemo(
    () => allTemplates.find((tpl) => tpl.id === selectedId) ?? filteredTemplates[0] ?? null,
    [allTemplates, selectedId, filteredTemplates],
  );

  const previewVars = useMemo(() => {
    if (previewItemId !== "manual") {
      const item = items.find((it) => it.id === previewItemId);
      if (item) return buildTemplateVars(item);
    }
    return {
      company: manualCompany,
      title: manualCompany,
      role: manualRole,
      contact: manualContact,
    };
  }, [previewItemId, items, manualCompany, manualRole, manualContact]);

  const activeTemplateForPreview = draft ?? selectedTemplate;
  const rendered = useMemo(() => {
    if (!activeTemplateForPreview) return { subject: "", body: "" };
    return renderTemplate(activeTemplateForPreview, previewVars);
  }, [activeTemplateForPreview, previewVars]);

  function handleStartNew() {
    setFormError(null);
    setSavedNotice(false);
    setDraft({
      id: null,
      name: "",
      channel: channelFilter === "message" ? "message" : "email",
      category: "application",
      subject: "",
      body: "",
    });
  }

  function handleStartEdit(tpl: MessageTemplate) {
    setFormError(null);
    setSavedNotice(false);
    setSelectedId(tpl.id);
    setDraft({
      id: tpl.builtIn ? null : tpl.id,
      name: tpl.builtIn ? `${tpl.name} ${t("pages.templates.copySuffix")}` : tpl.name,
      channel: tpl.channel,
      category: tpl.category,
      subject: tpl.subject ?? "",
      body: tpl.body,
    });
  }

  async function handleSaveDraft(e: FormEvent) {
    e.preventDefault();
    if (!draft || !services.templates) return;
    setFormError(null);
    setSavedNotice(false);

    if (!draft.name.trim() || !draft.body.trim()) {
      setFormError(t("pages.templates.validationRequired"));
      return;
    }

    if (draft.id) {
      const updated = await services.templates.update(draft.id, {
        name: draft.name,
        channel: draft.channel,
        category: draft.category,
        subject: draft.channel === "email" ? draft.subject : null,
        body: draft.body,
      });
      if (updated) setSelectedId(updated.id);
    } else {
      const created = await services.templates.create({
        name: draft.name,
        channel: draft.channel,
        category: draft.category,
        ...(draft.channel === "email" && draft.subject.trim()
          ? { subject: draft.subject.trim() }
          : {}),
        body: draft.body,
      });
      setSelectedId(created.id);
    }

    setDraft(null);
    setSavedNotice(true);
    bumpRevision();
  }

  async function handleDelete(id: string) {
    if (!services.templates) return;
    await services.templates.delete(id);
    if (selectedId === id) setSelectedId(null);
    if (draft?.id === id) setDraft(null);
    bumpRevision();
  }

  async function handleCopy(kind: "subject" | "body", text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard may be unavailable in headless test environments
    }
    setCopiedKey(kind);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === kind ? null : prev));
    }, 1800);
  }

  return (
    <section className="w-full space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("pages.templates.title")}
          </h1>
          <p className="text-sm text-[var(--fg-muted)]">
            {t("pages.templates.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleStartNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-sm font-medium text-[var(--primary-fg)] shadow-xs hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>{t("pages.templates.newTemplate")}</span>
        </button>
      </header>

      {savedNotice && (
        <div
          role="status"
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--success)]"
        >
          {t("pages.templates.savedMessage")}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* Left column: filter + template list */}
        <div className="space-y-3 lg:col-span-4">
          <div className="space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-[var(--shadow-card)]">
            <div
              role="tablist"
              aria-label={t("pages.templates.fieldChannel")}
              className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--surface-muted)] p-1"
            >
              {(
                [
                  { id: "all", label: t("pages.templates.filterAll") },
                  { id: "email", label: t("pages.templates.filterEmail") },
                  { id: "message", label: t("pages.templates.filterMessage") },
                ] as const
              ).map((tab) => {
                const active = channelFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setChannelFilter(tab.id)}
                    className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "bg-[var(--surface)] text-[var(--fg)] shadow-xs"
                        : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <input
              type="search"
              aria-label={t("pages.templates.searchLabel")}
              placeholder={t("pages.templates.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
            />
          </div>

          <ul className="space-y-2">
            {filteredTemplates.length === 0 ? (
              <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-xs text-[var(--fg-muted)]">
                {t("pages.templates.emptyList")}
              </li>
            ) : (
              filteredTemplates.map((tpl) => {
                const isSelected = !draft && selectedTemplate?.id === tpl.id;
                return (
                  <li
                    key={tpl.id}
                    data-testid={`template-item-${tpl.id}`}
                    className={`rounded-xl border p-3.5 shadow-[var(--shadow-card)] transition-colors ${
                      isSelected
                        ? "border-[var(--primary)] bg-[var(--surface)] ring-1 ring-[var(--primary)]/30"
                        : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(null);
                          setSavedNotice(false);
                          setSelectedId(tpl.id);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-1.5 font-medium leading-snug">
                          {tpl.channel === "email" ? (
                            <Mail
                              className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]"
                              aria-hidden="true"
                            />
                          ) : (
                            <MessageSquare
                              className="h-3.5 w-3.5 shrink-0 text-[var(--success)]"
                              aria-hidden="true"
                            />
                          )}
                          <span className="truncate">{tpl.name}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--fg-muted)]">
                          <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 font-medium text-[var(--primary)]">
                            {t(categoryI18nKey(tpl.category))}
                          </span>
                          <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5">
                            {tpl.builtIn
                              ? t("pages.templates.builtInBadge")
                              : t("pages.templates.customBadge")}
                          </span>
                        </div>
                      </button>

                      {!tpl.builtIn && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`${t("pages.templates.edit")} — ${tpl.name}`}
                            onClick={() => handleStartEdit(tpl)}
                            className="rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)]"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label={`${t("actions.delete")} — ${tpl.name}`}
                            onClick={() => void handleDelete(tpl.id)}
                            className="rounded p-1 text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        {/* Right column: editor or detail + live preview */}
        <div className="space-y-5 lg:col-span-8">
          {draft ? (
            <form
              onSubmit={(e) => void handleSaveDraft(e)}
              noValidate
              className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="space-y-1 sm:col-span-3">
                  <span className="text-xs font-medium text-[var(--fg-muted)]">
                    {t("pages.templates.fieldName")}
                  </span>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-[var(--fg-muted)]">
                    {t("pages.templates.fieldChannel")}
                  </span>
                  <select
                    value={draft.channel}
                    onChange={(e) =>
                      setDraft({ ...draft, channel: e.target.value as TemplateChannel })
                    }
                    className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-sm"
                  >
                    <option value="email">{t("pages.templates.channelEmail")}</option>
                    <option value="message">{t("pages.templates.channelMessage")}</option>
                  </select>
                </label>

                <label className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-medium text-[var(--fg-muted)]">
                    {t("pages.templates.fieldCategory")}
                  </span>
                  <select
                    value={draft.category}
                    onChange={(e) =>
                      setDraft({ ...draft, category: e.target.value as TemplateCategory })
                    }
                    className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-sm"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {t(categoryI18nKey(cat))}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {draft.channel === "email" && (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--fg-muted)]">
                    {t("pages.templates.fieldSubject")}
                  </span>
                  <input
                    type="text"
                    placeholder={t("pages.templates.fieldSubjectPlaceholder")}
                    value={draft.subject}
                    onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                    className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
                  />
                </label>
              )}

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="template-body-input"
                    className="text-xs font-medium text-[var(--fg-muted)]"
                  >
                    {t("pages.templates.fieldBody")}
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-[var(--fg-muted)]">
                      {t("pages.templates.insertVariable")}
                    </span>
                    {PLACEHOLDER_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            body: draft.body ? `${draft.body} ${chip}` : chip,
                          })
                        }
                        className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--primary)] hover:bg-[var(--accent-soft)]"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  id="template-body-input"
                  rows={8}
                  placeholder={t("pages.templates.fieldBodyPlaceholder")}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-sm leading-relaxed"
                />
              </div>

              {formError && (
                <p role="alert" className="text-xs font-medium text-[var(--danger)]">
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-sm font-medium hover:bg-[var(--surface-muted)]"
                >
                  {t("actions.cancel")}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-[var(--primary-fg)] hover:opacity-90"
                >
                  {t("actions.save")}
                </button>
              </div>
            </form>
          ) : selectedTemplate ? (
            <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">{selectedTemplate.name}</h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--fg-muted)]">
                    <span className="rounded bg-[var(--accent-soft)] px-2 py-0.5 font-medium text-[var(--primary)]">
                      {selectedTemplate.channel === "email"
                        ? t("pages.templates.channelEmail")
                        : t("pages.templates.channelMessage")}
                    </span>
                    <span className="rounded bg-[var(--surface-muted)] px-2 py-0.5">
                      {t(categoryI18nKey(selectedTemplate.category))}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(selectedTemplate)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-muted)]"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {selectedTemplate.builtIn
                        ? t("pages.templates.duplicateToCustomize")
                        : t("pages.templates.edit")}
                    </span>
                  </button>
                </div>
              </div>

              {/* Live preview variable selector */}
              <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                    {t("pages.templates.previewHeading")}
                  </span>
                  <label className="inline-flex items-center gap-2 text-xs">
                    <span className="text-[var(--fg-muted)]">
                      {t("pages.templates.previewItemLabel")}
                    </span>
                    <select
                      aria-label={t("pages.templates.previewItemLabel")}
                      value={previewItemId}
                      onChange={(e) => setPreviewItemId(e.target.value)}
                      className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
                    >
                      <option value="manual">{t("pages.templates.previewManualOption")}</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.company ? `${it.company} — ${it.title}` : it.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {previewItemId === "manual" && (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <label className="space-y-1 text-xs">
                      <span className="text-[var(--fg-muted)]">
                        {t("pages.templates.varCompany")}
                      </span>
                      <input
                        type="text"
                        value={manualCompany}
                        onChange={(e) => setManualCompany(e.target.value)}
                        className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs"
                      />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="text-[var(--fg-muted)]">
                        {t("pages.templates.varRole")}
                      </span>
                      <input
                        type="text"
                        value={manualRole}
                        onChange={(e) => setManualRole(e.target.value)}
                        className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs"
                      />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="text-[var(--fg-muted)]">
                        {t("pages.templates.varContact")}
                      </span>
                      <input
                        type="text"
                        value={manualContact}
                        onChange={(e) => setManualContact(e.target.value)}
                        className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs"
                      />
                    </label>
                  </div>
                )}
              </div>

              {selectedTemplate.channel === "email" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--fg-muted)]">
                      {t("pages.templates.subjectLabel")}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopy("subject", rendered.subject)}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-muted)]"
                    >
                      {copiedKey === "subject" ? (
                        <Check className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>
                        {copiedKey === "subject"
                          ? t("pages.templates.copied")
                          : t("pages.templates.copySubject")}
                      </span>
                    </button>
                  </div>
                  <div
                    data-testid="rendered-subject"
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm font-medium"
                  >
                    {rendered.subject || "—"}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--fg-muted)]">
                    {t("pages.templates.bodyLabel")}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy("body", rendered.body)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-fg)] hover:opacity-90"
                    >
                      {copiedKey === "body" ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>
                        {copiedKey === "body"
                          ? t("pages.templates.copied")
                          : t("pages.templates.copyBody")}
                      </span>
                    </button>

                    {selectedTemplate.channel === "email" && (
                      <a
                        href={buildMailtoHref(rendered.subject, rendered.body)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-muted)]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t("pages.templates.openInMail")}</span>
                      </a>
                    )}
                  </div>
                </div>
                <pre
                  data-testid="rendered-body"
                  className="whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 font-sans text-sm leading-relaxed"
                >
                  {rendered.body}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
