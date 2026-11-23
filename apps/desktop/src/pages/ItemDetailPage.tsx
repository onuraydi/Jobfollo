import {
  computeSchedule,
  isValidISODate,
  localizedText,
  workflowName,
  type ContactStatus,
  type ISODate,
  type StepInstance,
  type StepStatus,
  type Workflow,
} from "@jobfollo/core";
import {
  ItemValidationError,
  type StoredContact,
  type StoredItem,
} from "@jobfollo/data";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
  Pencil,
  Plus,
  SkipForward,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { useServices } from "../boot/index.js";
import {
  isSafeHttpUrl,
  openExternalUrl,
  type ExternalUrlOpener,
} from "../lib/externalUrl.js";
import { useDataRevision, usePreferences } from "../shell/index.js";
import { formatDisplayDate, useLocalToday } from "../time/index.js";

const OUTCOME_VALUES = ["reply", "interview", "offer", "negative"] as const;

interface ContactDialogState {
  stepKey: string;
  completionDate: ISODate;
  statuses: Record<string, ContactStatus>;
}

export interface ItemDetailPageProps {
  /** Optional override for deterministic testing. */
  todayOverride?: ISODate;
  /** Optional override for testing external URL opening without Tauri runtime. */
  externalUrlOpener?: ExternalUrlOpener;
}

function StepStatusChip({ status, label }: { status: StepStatus; label: string }) {
  switch (status) {
    case "done":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--success)]">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case "overdue":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--danger-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--danger)]">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case "due_today":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--warning-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--warning)]">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--fg)]">
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case "skipped":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--fg-muted)]">
          <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case "blocked":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--fg-muted)]">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case "stopped":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--fg-muted)]">
          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
  }
}

export function ItemDetailPage({
  todayOverride,
  externalUrlOpener,
}: ItemDetailPageProps = {}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const services = useServices();
  const { resolvedLocale } = usePreferences();
  const { revision, bumpRevision } = useDataRevision();
  const hookToday = useLocalToday();
  const today = todayOverride ?? hookToday;

  const [item, setItem] = useState<StoredItem | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Header edit state
  const [editingHeader, setEditingHeader] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editChannel, setEditChannel] = useState("");
  const [editWorkflowId, setEditWorkflowId] = useState("");
  const [editStartDate, setEditStartDate] = useState<ISODate>(today);
  const [headerErrors, setHeaderErrors] = useState<Record<string, string>>({});

  // Timeline state
  const [customDates, setCustomDates] = useState<Record<string, ISODate>>({});
  const [contactDialog, setContactDialog] = useState<ContactDialogState | null>(null);
  const [dialogNewContactName, setDialogNewContactName] = useState("");

  // Contacts state
  const [addingContact, setAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactUrl, setNewContactUrl] = useState("");
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editContactName, setEditContactName] = useState("");
  const [editContactUrl, setEditContactUrl] = useState("");
  const [editContactErrors, setEditContactErrors] = useState<Record<string, string>>({});

  // Notes state
  const [notesDraft, setNotesDraft] = useState("");
  const [notesJustSaved, setNotesJustSaved] = useState(false);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (!id) {
      setItem(null);
      setLoaded(true);
      return;
    }
    let active = true;
    void Promise.all([services.items.get(id), services.workflows.listAll()]).then(
      ([loadedItem, wfEntries]) => {
        if (!active) return;
        setItem(loadedItem);
        setWorkflows(wfEntries.map((e) => e.workflow));
        setLoaded(true);
      },
    );
    return () => {
      active = false;
    };
  }, [id, services, revision]);

  // Sync notesDraft when switching to a different item
  useEffect(() => {
    setNotesDraft(item?.notes ?? "");
    setNotesJustSaved(false);
  }, [item?.id]);

  const savedNotes = item?.notes ?? "";
  const notesDirty = item !== null && notesDraft !== savedNotes;

  useEffect(() => {
    if (!notesDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [notesDirty]);

  const workflow = useMemo(
    () => (item ? workflows.find((w) => w.id === item.workflowId) ?? null : null),
    [item, workflows],
  );

  const schedule = useMemo<StepInstance[]>(() => {
    if (!item || !workflow) return [];
    return computeSchedule(item, workflow, today);
  }, [item, workflow, today]);

  const openHeaderEditor = useCallback(() => {
    if (!item) return;
    setEditTitle(item.title);
    setEditRole(item.role ?? "");
    setEditChannel(item.channel ?? "");
    setEditWorkflowId(item.workflowId);
    setEditStartDate(item.startDate);
    setHeaderErrors({});
    setEditingHeader(true);
  }, [item]);

  const handleHeaderSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!item) return;
    setHeaderErrors({});
    try {
      await services.items.update(item.id, {
        title: editTitle,
        role: editRole.trim() ? editRole.trim() : null,
        channel: editChannel.trim() ? editChannel.trim() : null,
        workflowId: editWorkflowId,
        startDate: editStartDate,
      });
      setEditingHeader(false);
      bumpRevision();
    } catch (err) {
      if (err instanceof ItemValidationError) {
        const mapped: Record<string, string> = {};
        for (const issue of err.issues) {
          if (!mapped[issue.field]) mapped[issue.field] = issue.message;
        }
        setHeaderErrors(mapped);
      } else {
        throw err;
      }
    }
  };

  const handleBackClick = () => {
    if (notesDirty && !window.confirm(t("pages.itemDetail.unsavedLeaveConfirm"))) {
      return;
    }
    navigate("/items");
  };

  const handleOutcomeChange = async (value: string) => {
    if (!item) return;
    await services.items.setOutcome(item.id, value === "" ? null : value);
    bumpRevision();
  };

  const handleToggleArchive = async () => {
    if (!item) return;
    if (item.archivedAt) {
      await services.items.unarchive(item.id);
    } else {
      await services.items.archive(item.id);
    }
    bumpRevision();
  };

  const handleConfirmDelete = async () => {
    if (!item) return;
    await services.items.delete(item.id);
    setDeleteDialogOpen(false);
    bumpRevision();
    navigate("/items");
  };

  const handleStepDone = async (stepKey: string) => {
    if (!item || !workflow) return;
    const rawDate = customDates[stepKey];
    const completionDate = rawDate && isValidISODate(rawDate) ? rawDate : today;
    const wfStep = workflow.steps.find((s) => s.key === stepKey);
    if (wfStep?.records === "contactStatus") {
      const initialStatuses: Record<string, ContactStatus> = {};
      for (const c of item.contacts) {
        initialStatuses[c.id] = c.status;
      }
      setContactDialog({
        stepKey,
        completionDate,
        statuses: initialStatuses,
      });
      setDialogNewContactName("");
      return;
    }
    await services.items.completeStep(item.id, stepKey, completionDate);
    bumpRevision();
  };

  const handleDialogAddContact = async () => {
    if (!item || !contactDialog) return;
    const name = dialogNewContactName.trim();
    if (!name) return;
    const added = await services.items.addContact(item.id, { name, status: "pending" });
    setDialogNewContactName("");
    setContactDialog((prev) =>
      prev
        ? {
            ...prev,
            statuses: { ...prev.statuses, [added.id]: added.status },
          }
        : null,
    );
    bumpRevision();
  };

  const handleDialogConfirm = async () => {
    if (!item || !contactDialog) return;
    const updates = Object.entries(contactDialog.statuses).map(([contactId, status]) => ({
      contactId,
      status,
    }));
    await services.items.completeStep(
      item.id,
      contactDialog.stepKey,
      contactDialog.completionDate,
      updates.length > 0 ? { contactStatuses: updates } : undefined,
    );
    setContactDialog(null);
    bumpRevision();
  };

  const handleStepSkip = async (stepKey: string) => {
    if (!item) return;
    await services.items.skipStep(item.id, stepKey);
    bumpRevision();
  };

  const handleStepUndo = async (stepKey: string) => {
    if (!item) return;
    await services.items.undoStep(item.id, stepKey);
    bumpRevision();
  };

  const handleAddContact = async (e: FormEvent) => {
    e.preventDefault();
    if (!item) return;
    setContactErrors({});
    try {
      await services.items.addContact(item.id, {
        name: newContactName,
        profileUrl: newContactUrl.trim() ? newContactUrl.trim() : undefined,
      });
      setNewContactName("");
      setNewContactUrl("");
      setAddingContact(false);
      bumpRevision();
    } catch (err) {
      if (err instanceof ItemValidationError) {
        const mapped: Record<string, string> = {};
        for (const issue of err.issues) {
          if (!mapped[issue.field]) mapped[issue.field] = issue.message;
        }
        setContactErrors(mapped);
      } else {
        throw err;
      }
    }
  };

  const startEditContact = (contact: StoredContact) => {
    setEditingContactId(contact.id);
    setEditContactName(contact.name);
    setEditContactUrl(contact.profileUrl ?? "");
    setEditContactErrors({});
  };

  const handleSaveContactEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!item || !editingContactId) return;
    setEditContactErrors({});
    try {
      await services.items.updateContact(item.id, editingContactId, {
        name: editContactName,
        profileUrl: editContactUrl.trim() ? editContactUrl.trim() : null,
      });
      setEditingContactId(null);
      bumpRevision();
    } catch (err) {
      if (err instanceof ItemValidationError) {
        const mapped: Record<string, string> = {};
        for (const issue of err.issues) {
          if (!mapped[issue.field]) mapped[issue.field] = issue.message;
        }
        setEditContactErrors(mapped);
      } else {
        throw err;
      }
    }
  };

  const handleContactStatusChange = async (contactId: string, status: ContactStatus) => {
    if (!item) return;
    await services.items.updateContact(item.id, contactId, { status });
    bumpRevision();
  };

  const handleRemoveContact = async (contactId: string) => {
    if (!item) return;
    await services.items.removeContact(item.id, contactId);
    bumpRevision();
  };

  const handleSaveNotes = async () => {
    if (!item) return;
    const nextNotes = notesDraft.trim() ? notesDraft : null;
    await services.items.update(item.id, { notes: nextNotes });
    setNotesDraft(nextNotes ?? "");
    setNotesJustSaved(true);
    bumpRevision();
  };

  if (!loaded) {
    return null;
  }

  if (!item) {
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <Link
          to="/items"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>{t("pages.itemDetail.backToItems")}</span>
        </Link>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <h1 className="text-lg font-semibold">{t("pages.itemDetail.notFoundTitle")}</h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            {t("pages.itemDetail.notFoundBody")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBackClick}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>{t("pages.itemDetail.backToItems")}</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
            <span>{t("pages.itemDetail.outcomeLabel")}</span>
            <select
              aria-label={t("pages.itemDetail.outcomeLabel")}
              value={item.outcome ?? ""}
              onChange={(e) => void handleOutcomeChange(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--fg)]"
            >
              <option value="">{t("outcomes.in_progress")}</option>
              {OUTCOME_VALUES.map((o) => (
                <option key={o} value={o}>
                  {t(`outcomes.${o}`)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => void handleToggleArchive()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-muted)]"
          >
            {item.archivedAt ? (
              <>
                <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                <span>{t("pages.itemDetail.unarchive")}</span>
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" aria-hidden="true" />
                <span>{t("pages.itemDetail.archive")}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setDeleteDialogOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--danger)] px-3 py-1.5 text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-bg)]"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span>{t("pages.itemDetail.deleteItem")}</span>
          </button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        {!editingHeader ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
                {item.archivedAt && (
                  <span className="rounded bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--fg-muted)]">
                    {t("pages.items.archivedBadge")}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--fg-muted)]">
                {item.role && (
                  <span>
                    <strong className="font-medium text-[var(--fg)]">
                      {t("pages.itemDetail.roleLabel")}:
                    </strong>{" "}
                    {item.role}
                  </span>
                )}
                {item.channel && (
                  <span>
                    <strong className="font-medium text-[var(--fg)]">
                      {t("pages.itemDetail.channelLabel")}:
                    </strong>{" "}
                    {item.channel}
                  </span>
                )}
                <span>
                  {workflow ? workflowName(workflow, resolvedLocale) : item.workflowId}
                </span>
                <span>
                  {t("pages.itemDetail.startDateLabel", {
                    date: formatDisplayDate(item.startDate, resolvedLocale),
                  })}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={openHeaderEditor}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-muted)]"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("pages.itemDetail.editHeader")}</span>
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleHeaderSubmit(e)} noValidate className="space-y-4">
            <div>
              <label htmlFor="edit-item-title" className="block text-xs font-medium text-[var(--fg-muted)]">
                {t("pages.items.fieldTitle")}
              </label>
              <input
                id="edit-item-title"
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
              />
              {headerErrors.title && (
                <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                  {headerErrors.title}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="edit-item-role" className="block text-xs font-medium text-[var(--fg-muted)]">
                  {t("pages.items.fieldRole")}
                </label>
                <input
                  id="edit-item-role"
                  type="text"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                />
                {headerErrors.role && (
                  <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                    {headerErrors.role}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="edit-item-channel" className="block text-xs font-medium text-[var(--fg-muted)]">
                  {t("pages.items.fieldChannel")}
                </label>
                <input
                  id="edit-item-channel"
                  type="text"
                  value={editChannel}
                  onChange={(e) => setEditChannel(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                />
                {headerErrors.channel && (
                  <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                    {headerErrors.channel}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="edit-item-workflow" className="block text-xs font-medium text-[var(--fg-muted)]">
                  {t("pages.items.fieldWorkflow")}
                </label>
                <select
                  id="edit-item-workflow"
                  value={editWorkflowId}
                  onChange={(e) => setEditWorkflowId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                >
                  {workflows.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {workflowName(wf, resolvedLocale)}
                    </option>
                  ))}
                </select>
                {headerErrors.workflowId && (
                  <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                    {headerErrors.workflowId}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="edit-item-start-date" className="block text-xs font-medium text-[var(--fg-muted)]">
                  {t("pages.items.fieldStartDate")}
                </label>
                <input
                  id="edit-item-start-date"
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                />
                {headerErrors.startDate && (
                  <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                    {headerErrors.startDate}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingHeader(false)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-muted)]"
              >
                {t("actions.cancel")}
              </button>
              <button
                type="submit"
                className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-fg)] hover:opacity-90"
              >
                {t("actions.save")}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Step timeline */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">{t("pages.itemDetail.timelineTitle")}</h2>
        {!workflow ? (
          <div className="rounded-lg border border-[var(--warning)] bg-[var(--warning-bg)] p-4 text-sm text-[var(--warning)]">
            {t("pages.itemDetail.workflowMissing", { workflowId: item.workflowId })}
          </div>
        ) : (
          <ol className="space-y-2">
            {schedule.map((step) => {
              const title = localizedText(step.title, step.titles, resolvedLocale);
              const canComplete =
                step.status === "overdue" ||
                step.status === "due_today" ||
                step.status === "pending";
              const canUndo = step.status === "done" || step.status === "skipped";
              const dateVal = customDates[step.stepKey] ?? today;

              return (
                <li
                  key={step.stepKey}
                  data-testid={`timeline-step-${step.stepKey}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3.5"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{title}</span>
                      <StepStatusChip
                        status={step.status}
                        label={t(`status.${step.status}`)}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 text-xs text-[var(--fg-muted)]">
                      {step.dueDate && (
                        <span>
                          {t("pages.itemDetail.dueLabel", {
                            date: formatDisplayDate(step.dueDate, resolvedLocale),
                          })}
                        </span>
                      )}
                      {step.completedOn && (
                        <span>
                          {t("pages.itemDetail.completedLabel", {
                            date: formatDisplayDate(step.completedOn, resolvedLocale),
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {canComplete && (
                      <>
                        <input
                          type="date"
                          aria-label={`${t("pages.today.customDateLabel")} — ${title}`}
                          value={dateVal}
                          onChange={(e) =>
                            setCustomDates((prev) => ({
                              ...prev,
                              [step.stepKey]: e.target.value,
                            }))
                          }
                          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => void handleStepDone(step.stepKey)}
                          className="inline-flex items-center gap-1 rounded-md bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-[var(--primary-fg)] hover:opacity-90"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{t("actions.done")}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleStepSkip(step.stepKey)}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-muted)]"
                        >
                          <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{t("actions.skip")}</span>
                        </button>
                      </>
                    )}
                    {canUndo && (
                      <button
                        type="button"
                        onClick={() => void handleStepUndo(step.stepKey)}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-muted)]"
                      >
                        <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t("actions.undo")}</span>
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Contacts */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("pages.itemDetail.contactsTitle")}</h2>
          {!addingContact && (
            <button
              type="button"
              onClick={() => {
                setContactErrors({});
                setAddingContact(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-muted)]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("pages.itemDetail.addContact")}</span>
            </button>
          )}
        </div>

        {addingContact && (
          <form
            onSubmit={(e) => void handleAddContact(e)}
            noValidate
            className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="new-contact-name" className="block text-xs font-medium text-[var(--fg-muted)]">
                  {t("pages.items.fieldContactName")}
                </label>
                <input
                  id="new-contact-name"
                  type="text"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                />
                {contactErrors.name && (
                  <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                    {contactErrors.name}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="new-contact-url" className="block text-xs font-medium text-[var(--fg-muted)]">
                  {t("pages.items.fieldContactUrl")}
                </label>
                <input
                  id="new-contact-url"
                  type="url"
                  value={newContactUrl}
                  onChange={(e) => setNewContactUrl(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                />
                {contactErrors.profileUrl && (
                  <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                    {contactErrors.profileUrl}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddingContact(false)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-muted)]"
              >
                {t("actions.cancel")}
              </button>
              <button
                type="submit"
                className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-fg)] hover:opacity-90"
              >
                {t("actions.save")}
              </button>
            </div>
          </form>
        )}

        {item.contacts.length === 0 ? (
          <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--fg-muted)]">
            {t("pages.itemDetail.contactsEmpty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {item.contacts.map((contact) => {
              const isEditing = editingContactId === contact.id;
              const hasUrl = Boolean(contact.profileUrl && contact.profileUrl.trim().length > 0);
              const safeUrl = isSafeHttpUrl(contact.profileUrl);

              return (
                <li
                  key={contact.id}
                  data-testid={`contact-row-${contact.id}`}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3.5"
                >
                  {isEditing ? (
                    <form
                      onSubmit={(e) => void handleSaveContactEdit(e)}
                      noValidate
                      className="space-y-3"
                    >
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor={`edit-contact-name-${contact.id}`}
                            className="block text-xs font-medium text-[var(--fg-muted)]"
                          >
                            {t("pages.items.fieldContactName")}
                          </label>
                          <input
                            id={`edit-contact-name-${contact.id}`}
                            type="text"
                            value={editContactName}
                            onChange={(e) => setEditContactName(e.target.value)}
                            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                          />
                          {editContactErrors.name && (
                            <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                              {editContactErrors.name}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-contact-url-${contact.id}`}
                            className="block text-xs font-medium text-[var(--fg-muted)]"
                          >
                            {t("pages.items.fieldContactUrl")}
                          </label>
                          <input
                            id={`edit-contact-url-${contact.id}`}
                            type="url"
                            value={editContactUrl}
                            onChange={(e) => setEditContactUrl(e.target.value)}
                            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                          />
                          {editContactErrors.profileUrl && (
                            <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                              {editContactErrors.profileUrl}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingContactId(null)}
                          className="rounded-md border border-[var(--border)] px-3 py-1 text-xs hover:bg-[var(--surface-muted)]"
                        >
                          {t("actions.cancel")}
                        </button>
                        <button
                          type="submit"
                          className="rounded-md bg-[var(--primary)] px-3 py-1 text-xs font-medium text-[var(--primary-fg)] hover:opacity-90"
                        >
                          {t("actions.save")}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="font-medium">{contact.name}</div>
                        {hasUrl &&
                          (safeUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                void openExternalUrl(contact.profileUrl!, externalUrlOpener)
                              }
                              className="inline-flex items-center gap-1 text-xs text-[var(--primary)] underline-offset-2 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              <span>{t("pages.itemDetail.openProfile")}</span>
                            </button>
                          ) : (
                            <span className="block text-xs text-[var(--fg-muted)]">
                              {t("pages.itemDetail.unsafeUrlLabel")}
                            </span>
                          ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`${t("pages.itemDetail.contactStatusLabel")} — ${contact.name}`}
                          value={contact.status}
                          onChange={(e) =>
                            void handleContactStatusChange(
                              contact.id,
                              e.target.value as ContactStatus,
                            )
                          }
                          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                        >
                          <option value="pending">{t("pages.today.contactPending")}</option>
                          <option value="accepted">{t("pages.today.contactAccepted")}</option>
                          <option value="not_accepted">
                            {t("pages.today.contactNotAccepted")}
                          </option>
                        </select>

                        <button
                          type="button"
                          onClick={() => startEditContact(contact)}
                          className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--surface-muted)]"
                        >
                          {t("pages.itemDetail.editContact")}
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleRemoveContact(contact.id)}
                          className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                        >
                          {t("pages.itemDetail.removeContact")}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="item-notes" className="text-base font-semibold">
            {t("pages.itemDetail.notesTitle")}
          </label>
          <div className="flex items-center gap-3">
            {notesDirty ? (
              <span className="text-xs font-medium text-[var(--warning)]">
                {t("pages.itemDetail.notesUnsaved")}
              </span>
            ) : notesJustSaved ? (
              <span className="text-xs font-medium text-[var(--success)]">
                {t("pages.itemDetail.notesSaved")}
              </span>
            ) : null}
            <button
              type="button"
              disabled={!notesDirty}
              onClick={() => void handleSaveNotes()}
              className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-fg)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("actions.save")}
            </button>
          </div>
        </div>
        <textarea
          id="item-notes"
          rows={5}
          value={notesDraft}
          onChange={(e) => {
            setNotesDraft(e.target.value);
            setNotesJustSaved(false);
          }}
          placeholder={t("pages.itemDetail.notesPlaceholder")}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm"
        />
      </div>

      {/* Contact status dialog for records="contactStatus" steps */}
      {contactDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-contact-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg">
            <div>
              <h2 id="detail-contact-dialog-title" className="text-base font-semibold">
                {t("pages.today.contactDialogTitle")}
              </h2>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                {t("pages.today.contactDialogBody")}
              </p>
            </div>

            {item.contacts.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-[var(--fg-muted)]">
                  {t("pages.today.contactDialogNoContacts")}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={dialogNewContactName}
                    onChange={(e) => setDialogNewContactName(e.target.value)}
                    placeholder={t("pages.today.contactNamePlaceholder")}
                    className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleDialogAddContact()}
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-muted)]"
                  >
                    {t("pages.today.addContact")}
                  </button>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {item.contacts.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] p-2.5"
                  >
                    <span className="text-sm font-medium">{c.name}</span>
                    <select
                      aria-label={c.name}
                      value={contactDialog.statuses[c.id] ?? c.status}
                      onChange={(e) =>
                        setContactDialog((prev) =>
                          prev
                            ? {
                                ...prev,
                                statuses: {
                                  ...prev.statuses,
                                  [c.id]: e.target.value as ContactStatus,
                                },
                              }
                            : null,
                        )
                      }
                      className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                    >
                      <option value="pending">{t("pages.today.contactPending")}</option>
                      <option value="accepted">{t("pages.today.contactAccepted")}</option>
                      <option value="not_accepted">{t("pages.today.contactNotAccepted")}</option>
                    </select>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setContactDialog(null)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-muted)]"
              >
                {t("actions.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleDialogConfirm()}
                className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-fg)] hover:opacity-90"
              >
                {t("pages.today.confirmComplete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg">
            <div>
              <h2 id="delete-confirm-title" className="text-base font-semibold">
                {t("pages.itemDetail.deleteConfirmTitle")}
              </h2>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                {t("pages.itemDetail.deleteConfirmBody", { title: item.title })}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteDialogOpen(false)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-muted)]"
              >
                {t("actions.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                className="rounded-md bg-[var(--danger)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                {t("actions.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
