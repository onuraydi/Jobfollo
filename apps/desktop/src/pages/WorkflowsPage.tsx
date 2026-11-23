import {
  localizedText,
  validateWorkflow,
  workflowName,
  type Anchor,
  type ValidationError,
  type Workflow,
  type WorkflowStep,
} from "@jobfollo/core";
import {
  InvalidWorkflowError,
  WorkflowInUseError,
  type WorkflowListEntry,
} from "@jobfollo/data";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useServices } from "../boot/index.js";
import { useDataRevision, usePreferences } from "../shell/index.js";

const STOP_OUTCOME_OPTIONS = ["reply", "interview", "offer", "negative"] as const;

export function WorkflowsPage() {
  const { t } = useTranslation();
  const services = useServices();
  const { resolvedLocale } = usePreferences();
  const { revision, bumpRevision } = useDataRevision();

  const [entries, setEntries] = useState<WorkflowListEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Workflow | null>(null);
  const [saveErrors, setSaveErrors] = useState<readonly ValidationError[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void services.workflows.listAll().then((loaded) => {
      if (!active) return;
      setEntries(loaded);
      setSelectedId((prev) => {
        if (prev && loaded.some((e) => e.workflow.id === prev)) return prev;
        return loaded[0]?.workflow.id ?? null;
      });
    });
    return () => {
      active = false;
    };
  }, [services, revision]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.workflow.id === selectedId) ?? null,
    [entries, selectedId],
  );

  const liveValidationErrors = useMemo(
    () => (draft ? validateWorkflow(draft) : []),
    [draft],
  );

  const handleSelectEntry = (entry: WorkflowListEntry) => {
    setSelectedId(entry.workflow.id);
    setSaveErrors([]);
    setStatusMessage(null);
    setDeleteError(null);
    if (entry.kind === "custom") {
      setDraft(structuredClone(entry.workflow));
    } else {
      setDraft(null);
    }
  };

  const handleNewWorkflow = () => {
    const id = services.idGenerator.newId();
    const fresh: Workflow = {
      id,
      name: "",
      steps: [
        {
          key: "step_1",
          title: "",
          anchor: "start",
          offsetDays: 0,
        },
      ],
      stopOutcomes: ["negative", "offer"],
    };
    setSelectedId(id);
    setDraft(fresh);
    setSaveErrors([]);
    setStatusMessage(null);
    setDeleteError(null);
  };

  const handleDuplicate = async (source: Workflow) => {
    setSaveErrors([]);
    setStatusMessage(null);
    setDeleteError(null);
    const copyName = `${workflowName(source, resolvedLocale)} ${t("pages.workflows.copySuffix")}`;
    const created = await services.workflows.duplicate(source.id, copyName);
    setSelectedId(created.id);
    setDraft(structuredClone(created));
    bumpRevision();
  };

  const handleDelete = async (id: string) => {
    setDeleteError(null);
    setStatusMessage(null);
    try {
      await services.workflows.delete(id);
      if (selectedId === id) {
        setSelectedId(null);
        setDraft(null);
      }
      bumpRevision();
    } catch (err) {
      if (err instanceof WorkflowInUseError) {
        setDeleteError(t("pages.workflows.inUseError"));
      } else {
        setDeleteError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleSaveDraft = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setStatusMessage(null);
    setDeleteError(null);
    const errors = validateWorkflow(draft);
    if (errors.length > 0) {
      setSaveErrors(errors);
      return;
    }
    setSaveErrors([]);
    try {
      const saved = await services.workflows.save(draft);
      setSelectedId(saved.id);
      setDraft(structuredClone(saved));
      setStatusMessage(t("pages.workflows.savedMessage"));
      bumpRevision();
    } catch (err) {
      if (err instanceof InvalidWorkflowError) {
        setSaveErrors(err.errors);
      } else {
        throw err;
      }
    }
  };

  const updateStep = (index: number, patch: Partial<WorkflowStep>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const steps = prev.steps.map((s, idx) => {
        if (idx !== index) return s;
        const next: WorkflowStep = { ...s, ...patch };
        if (!next.suggestsOutcome) {
          delete next.suggestsOutcome;
        }
        // Clear localized titles when user edits a custom workflow's step title
        if ("title" in patch) {
          delete next.titles;
        }
        return next;
      });
      return { ...prev, steps };
    });
  };

  const addStep = () => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextNum = prev.steps.length + 1;
      let key = `step_${nextNum}`;
      const existingKeys = new Set(prev.steps.map((s) => s.key));
      let suffix = nextNum;
      while (existingKeys.has(key)) {
        suffix++;
        key = `step_${suffix}`;
      }
      const nextStep: WorkflowStep = {
        key,
        title: "",
        anchor: "start",
        offsetDays: 0,
      };
      return { ...prev, steps: [...prev.steps, nextStep] };
    });
  };

  const removeStep = (index: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, steps: prev.steps.filter((_, idx) => idx !== index) };
    });
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.steps.length) return prev;
      const copy = [...prev.steps];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved!);
      return { ...prev, steps: copy };
    });
  };

  const toggleStopOutcome = (outcome: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const exists = prev.stopOutcomes.includes(outcome);
      const next = exists
        ? prev.stopOutcomes.filter((o) => o !== outcome)
        : [...prev.stopOutcomes, outcome];
      return { ...prev, stopOutcomes: next };
    });
  };

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("pages.workflows.title")}
          </h1>
          <p className="text-sm text-[var(--fg-muted)]">
            {t("pages.workflows.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleNewWorkflow}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3.5 py-2 text-sm font-medium text-[var(--primary-fg)] hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>{t("pages.workflows.newWorkflow")}</span>
        </button>
      </header>

      {deleteError && (
        <div
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] px-4 py-2.5 text-sm text-[var(--danger)]"
        >
          {deleteError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Workflow list */}
        <ul className="space-y-2 lg:col-span-4">
          {entries.map((entry) => {
            const wf = entry.workflow;
            const isSelected = selectedId === wf.id;
            return (
              <li
                key={wf.id}
                data-testid={`workflow-item-${wf.id}`}
                className={`rounded-lg border p-3 transition-colors ${
                  isSelected
                    ? "border-[var(--primary)] bg-[var(--surface)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]/60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectEntry(entry)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="font-medium leading-snug">
                      {workflowName(wf, resolvedLocale)}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                      <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5">
                        {entry.kind === "builtin"
                          ? t("pages.workflows.builtInBadge")
                          : t("pages.workflows.customBadge")}
                      </span>
                      <span>
                        {t("pages.workflows.stepCount", { count: wf.steps.length })}
                      </span>
                    </div>
                  </button>

                  {entry.kind === "custom" && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`${t("pages.workflows.edit")} — ${wf.name}`}
                        onClick={() => handleSelectEntry(entry)}
                        className="rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)]"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`${t("actions.delete")} — ${wf.name}`}
                        onClick={() => void handleDelete(wf.id)}
                        className="rounded p-1 text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* Right detail / editor */}
        <div className="lg:col-span-8">
          {draft ? (
            <form
              onSubmit={(e) => void handleSaveDraft(e)}
              noValidate
              className="space-y-5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div>
                <label
                  htmlFor="workflow-name-input"
                  className="block text-xs font-medium text-[var(--fg-muted)]"
                >
                  {t("pages.workflows.nameLabel")}
                </label>
                <input
                  id="workflow-name-input"
                  type="text"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, name: e.target.value, names: undefined } : prev,
                    )
                  }
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-[var(--fg-muted)]">
                  {t("pages.workflows.stopOutcomesLabel")}
                </legend>
                <div className="flex flex-wrap gap-3">
                  {STOP_OUTCOME_OPTIONS.map((outcome) => (
                    <label key={outcome} className="inline-flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.stopOutcomes.includes(outcome)}
                        onChange={() => toggleStopOutcome(outcome)}
                      />
                      <span>{t(`outcomes.${outcome}`)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{t("pages.workflows.stepsHeading")}</h2>
                  <button
                    type="button"
                    onClick={addStep}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-muted)]"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t("pages.workflows.addStep")}</span>
                  </button>
                </div>

                <ol className="space-y-3">
                  {draft.steps.map((step, index) => (
                    <li
                      key={index}
                      data-testid={`editor-step-${index}`}
                      className="space-y-2.5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3"
                    >
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor={`step-key-${index}`}
                            className="block text-xs text-[var(--fg-muted)]"
                          >
                            {t("pages.workflows.stepKeyLabel")}
                          </label>
                          <input
                            id={`step-key-${index}`}
                            type="text"
                            value={step.key}
                            onChange={(e) => updateStep(index, { key: e.target.value })}
                            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`step-title-${index}`}
                            className="block text-xs text-[var(--fg-muted)]"
                          >
                            {t("pages.workflows.stepTitleLabel")}
                          </label>
                          <input
                            id={`step-title-${index}`}
                            type="text"
                            value={step.title}
                            onChange={(e) => updateStep(index, { title: e.target.value })}
                            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div>
                          <label
                            htmlFor={`step-anchor-${index}`}
                            className="block text-xs text-[var(--fg-muted)]"
                          >
                            {t("pages.workflows.anchorLabel")}
                          </label>
                          <select
                            id={`step-anchor-${index}`}
                            value={step.anchor}
                            onChange={(e) =>
                              updateStep(index, { anchor: e.target.value as Anchor })
                            }
                            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
                          >
                            <option value="start">{t("pages.workflows.anchorStart")}</option>
                            {draft.steps
                              .filter((other, otherIdx) => otherIdx !== index && other.key.trim())
                              .map((other) => (
                                <option key={other.key} value={`step:${other.key}`}>
                                  {t("pages.workflows.anchorAfterStep", { step: other.key })}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor={`step-offset-${index}`}
                            className="block text-xs text-[var(--fg-muted)]"
                          >
                            {t("pages.workflows.offsetDaysLabel")}
                          </label>
                          <input
                            id={`step-offset-${index}`}
                            type="number"
                            min={0}
                            value={step.offsetDays}
                            onChange={(e) =>
                              updateStep(index, {
                                offsetDays: Number.isNaN(Number(e.target.value))
                                  ? 0
                                  : Number(e.target.value),
                              })
                            }
                            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor={`step-suggest-${index}`}
                            className="block text-xs text-[var(--fg-muted)]"
                          >
                            {t("pages.workflows.suggestsOutcomeLabel")}
                          </label>
                          <select
                            id={`step-suggest-${index}`}
                            value={step.suggestsOutcome ?? ""}
                            onChange={(e) =>
                              updateStep(index, {
                                suggestsOutcome: e.target.value || undefined,
                              })
                            }
                            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
                          >
                            <option value="">{t("pages.workflows.suggestsOutcomeNone")}</option>
                            {STOP_OUTCOME_OPTIONS.map((o) => (
                              <option key={o} value={o}>
                                {t(`outcomes.${o}`)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end gap-1 pt-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          aria-label={t("pages.workflows.moveUp")}
                          onClick={() => moveStep(index, -1)}
                          className="rounded border border-[var(--border)] p-1 text-xs hover:bg-[var(--surface-muted)] disabled:opacity-40"
                        >
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={index === draft.steps.length - 1}
                          aria-label={t("pages.workflows.moveDown")}
                          onClick={() => moveStep(index, 1)}
                          className="rounded border border-[var(--border)] p-1 text-xs hover:bg-[var(--surface-muted)] disabled:opacity-40"
                        >
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={t("pages.workflows.removeStep")}
                          onClick={() => removeStep(index)}
                          className="rounded border border-[var(--border)] p-1 text-xs text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {(saveErrors.length > 0 || liveValidationErrors.length > 0) && (
                <ul
                  role="alert"
                  className="list-disc space-y-1 rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 pl-7 text-xs text-[var(--danger)]"
                >
                  {(saveErrors.length > 0 ? saveErrors : liveValidationErrors).map((err, i) => (
                    <li key={`${err.code}-${err.stepKey ?? i}`}>{err.message}</li>
                  ))}
                </ul>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-xs font-medium text-[var(--success)]">
                  {statusMessage}
                </div>
                <button
                  type="submit"
                  className="rounded-md bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-[var(--primary-fg)] hover:opacity-90"
                >
                  {t("actions.save")}
                </button>
              </div>
            </form>
          ) : selectedEntry ? (
            <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    {workflowName(selectedEntry.workflow, resolvedLocale)}
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
                    {t("pages.workflows.builtInReadOnlyHint")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDuplicate(selectedEntry.workflow)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-fg)] hover:opacity-90"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t("pages.workflows.duplicateToCustomize")}</span>
                </button>
              </div>

              <ol className="space-y-2">
                {selectedEntry.workflow.steps.map((step) => (
                  <li
                    key={step.key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                  >
                    <span className="font-medium">
                      {localizedText(step.title, step.titles, resolvedLocale)}
                    </span>
                    <span className="font-mono text-xs text-[var(--fg-muted)]">
                      {step.anchor} +{step.offsetDays}d
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
