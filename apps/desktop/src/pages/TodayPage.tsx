import {
  buildDigest,
  isValidISODate,
  localizedText,
  type ContactStatus,
  type Digest,
  type DigestRow,
  type ISODate,
  type Workflow,
} from "@jobfollo/core";
import type { StoredItem } from "@jobfollo/data";
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  SkipForward,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useServices } from "../boot/index.js";
import { useDataRevision, usePreferences } from "../shell/index.js";
import { formatDisplayDate, useLocalToday } from "../time/index.js";

interface UndoToastState {
  itemId: string;
  stepKey: string;
  kind: "done" | "skipped";
}

interface ContactDialogState {
  item: StoredItem;
  stepKey: string;
  completionDate: ISODate;
  statuses: Record<string, ContactStatus>;
}

export interface TodayPageProps {
  /** Optional override for deterministic testing. */
  todayOverride?: ISODate;
}

export function TodayPage({ todayOverride }: TodayPageProps = {}) {
  const { t } = useTranslation();
  const services = useServices();
  const { resolvedLocale } = usePreferences();
  const { revision, bumpRevision } = useDataRevision();
  const hookToday = useLocalToday();
  const today = todayOverride ?? hookToday;

  const [items, setItems] = useState<StoredItem[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [customDates, setCustomDates] = useState<Record<string, ISODate>>({});
  const [toast, setToast] = useState<UndoToastState | null>(null);
  const [contactDialog, setContactDialog] = useState<ContactDialogState | null>(null);
  const [newContactName, setNewContactName] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([services.items.list(), services.workflows.listAll()]).then(
      ([loadedItems, wfEntries]) => {
        if (!active) return;
        setItems(loadedItems);
        setWorkflows(wfEntries.map((e) => e.workflow));
        setLoaded(true);
      },
    );
    return () => {
      active = false;
    };
  }, [services, revision, today]);

  const workflowsById = useMemo(
    () => new Map(workflows.map((w) => [w.id, w])),
    [workflows],
  );

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const { digest, unschedulableCount } = useMemo<{
    digest: Digest;
    unschedulableCount: number;
  }>(() => {
    const schedulable: StoredItem[] = [];
    let unschedulable = 0;
    for (const item of items) {
      if (workflowsById.has(item.workflowId)) {
        schedulable.push(item);
      } else {
        unschedulable += 1;
      }
    }
    return {
      digest: buildDigest(schedulable, workflows, today, { upcomingDays: 7 }),
      unschedulableCount: unschedulable,
    };
  }, [items, workflows, workflowsById, today]);

  const handleDoneClick = useCallback(
    async (row: DigestRow) => {
      const item = itemsById.get(row.itemId);
      const workflow = item ? workflowsById.get(item.workflowId) : undefined;
      const step = workflow?.steps.find((s) => s.key === row.stepKey);
      const chosenDate = customDates[row.itemId];
      const completionDate =
        chosenDate && isValidISODate(chosenDate) ? chosenDate : today;

      if (step?.records === "contactStatus" && item) {
        const initialStatuses: Record<string, ContactStatus> = {};
        for (const c of item.contacts) {
          initialStatuses[c.id] = c.status === "not_accepted" ? "not_accepted" : "accepted";
        }
        setNewContactName("");
        setContactDialog({
          item,
          stepKey: row.stepKey,
          completionDate,
          statuses: initialStatuses,
        });
        return;
      }

      await services.items.completeStep(row.itemId, row.stepKey, completionDate);
      setToast({ itemId: row.itemId, stepKey: row.stepKey, kind: "done" });
      bumpRevision();
    },
    [itemsById, workflowsById, customDates, today, services, bumpRevision],
  );

  const handleSkipClick = useCallback(
    async (row: DigestRow) => {
      await services.items.skipStep(row.itemId, row.stepKey);
      setToast({ itemId: row.itemId, stepKey: row.stepKey, kind: "skipped" });
      bumpRevision();
    },
    [services, bumpRevision],
  );

  const handleOutcomeClick = useCallback(
    async (itemId: string, outcome: string) => {
      await services.items.setOutcome(itemId, outcome);
      bumpRevision();
    },
    [services, bumpRevision],
  );

  const handleUndo = useCallback(async () => {
    if (!toast) return;
    await services.items.undoStep(toast.itemId, toast.stepKey);
    setToast(null);
    bumpRevision();
  }, [toast, services, bumpRevision]);

  const handleAddContactInDialog = useCallback(async () => {
    if (!contactDialog || newContactName.trim().length === 0) return;
    const added = await services.items.addContact(contactDialog.item.id, {
      name: newContactName.trim(),
    });
    setNewContactName("");
    setContactDialog((prev) =>
      prev
        ? {
            ...prev,
            item: { ...prev.item, contacts: [...prev.item.contacts, added] },
            statuses: { ...prev.statuses, [added.id]: "accepted" },
          }
        : null,
    );
    bumpRevision();
  }, [contactDialog, newContactName, services, bumpRevision]);

  const handleConfirmContactDialog = useCallback(async () => {
    if (!contactDialog) return;
    const contactStatuses = contactDialog.item.contacts.map((c) => ({
      contactId: c.id,
      status: contactDialog.statuses[c.id] ?? "accepted",
    }));
    await services.items.completeStep(
      contactDialog.item.id,
      contactDialog.stepKey,
      contactDialog.completionDate,
      contactStatuses.length > 0 ? { contactStatuses } : undefined,
    );
    setToast({
      itemId: contactDialog.item.id,
      stepKey: contactDialog.stepKey,
      kind: "done",
    });
    setContactDialog(null);
    bumpRevision();
  }, [contactDialog, services, bumpRevision]);

  function formatTiming(daysLeft: number): string {
    if (daysLeft < 0) {
      return t("pages.today.daysOverdue", { count: Math.abs(daysLeft) });
    }
    if (daysLeft === 0) {
      return t("pages.today.dueToday");
    }
    return t("pages.today.inDays", { count: daysLeft });
  }

  function renderGroup(
    heading: string,
    rows: readonly DigestRow[],
    variant: "overdue" | "today" | "upcoming",
  ) {
    if (rows.length === 0) return null;

    const Icon =
      variant === "overdue" ? AlertCircle : variant === "today" ? Clock : Calendar;
    const badgeClass =
      variant === "overdue"
        ? "bg-[var(--overdue-bg)] text-[var(--overdue-fg)]"
        : variant === "today"
          ? "bg-[var(--today-bg)] text-[var(--today-fg)]"
          : "bg-[var(--surface-muted)] text-[var(--fg-muted)]";

    return (
      <section aria-label={heading} className="space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{heading}</span>
            <span>({rows.length})</span>
          </span>
        </div>

        <ul className="space-y-2">
          {rows.map((row) => {
            const stepLabel = localizedText(row.stepTitle, row.stepTitles, resolvedLocale);
            const outcomeLabel = row.suggestsOutcome
              ? t(`outcomes.${row.suggestsOutcome}`, { defaultValue: row.suggestsOutcome })
              : null;

            return (
              <li
                key={row.itemId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/items/${row.itemId}`}
                      className="font-medium hover:underline"
                    >
                      {row.itemTitle}
                    </Link>
                    <span className="text-xs text-[var(--fg-muted)]">
                      {formatDisplayDate(row.dueDate, resolvedLocale)} ·{" "}
                      {formatTiming(row.daysLeft)}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--fg-muted)]">{stepLabel}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    aria-label={`${t("pages.today.customDateLabel")} (${row.itemTitle})`}
                    value={customDates[row.itemId] ?? today}
                    onChange={(e) =>
                      setCustomDates((prev) => ({ ...prev, [row.itemId]: e.target.value }))
                    }
                    className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                  />

                  <button
                    type="button"
                    onClick={() => void handleDoneClick(row)}
                    className="inline-flex items-center gap-1 rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-fg)] hover:opacity-90"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t("actions.done")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSkipClick(row)}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--surface-muted)]"
                  >
                    <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t("actions.skip")}</span>
                  </button>

                  {row.suggestsOutcome && outcomeLabel && (
                    <button
                      type="button"
                      onClick={() => void handleOutcomeClick(row.itemId, row.suggestsOutcome!)}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--overdue-fg)] px-2.5 py-1.5 text-xs font-medium text-[var(--overdue-fg)] hover:bg-[var(--overdue-bg)]"
                    >
                      {t("pages.today.markAsOutcome", { outcome: outcomeLabel })}
                    </button>
                  )}

                  <Link
                    to={`/items/${row.itemId}`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-[var(--fg-muted)] hover:bg-[var(--surface-muted)]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t("pages.today.openItem")}</span>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("pages.today.title")}</h1>
        <p className="text-sm text-[var(--fg-muted)]">{t("pages.today.subtitle")}</p>
      </header>

      {unschedulableCount > 0 && (
        <div
          role="status"
          className="flex items-center justify-between rounded-md border border-[var(--today-fg)] bg-[var(--today-bg)] px-4 py-2.5 text-sm text-[var(--today-fg)]"
        >
          <span>{t("pages.today.unschedulableBanner", { count: unschedulableCount })}</span>
          <Link to="/items" className="font-medium underline">
            {t("pages.today.viewItems")}
          </Link>
        </div>
      )}

      {loaded && items.length === 0 ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <h2 className="text-lg font-medium">{t("pages.today.emptyNoItemsTitle")}</h2>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            {t("pages.today.emptyNoItemsBody")}
          </p>
          <Link
            to="/items"
            className="mt-4 inline-flex items-center rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)]"
          >
            {t("pages.today.emptyNoItemsCta")}
          </Link>
        </section>
      ) : loaded && digest.isEmpty ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <CheckCircle2
            className="mx-auto h-8 w-8 text-[var(--done-fg)]"
            aria-hidden="true"
          />
          <h2 className="mt-2 text-lg font-medium">{t("pages.today.emptyCaughtUpTitle")}</h2>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            {t("pages.today.emptyCaughtUpBody")}
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          {renderGroup(t("pages.today.groupOverdue"), digest.overdue, "overdue")}
          {renderGroup(t("pages.today.groupToday"), digest.today, "today")}
          {renderGroup(t("pages.today.groupUpcoming"), digest.upcoming, "upcoming")}
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm shadow-lg"
        >
          <span>
            {toast.kind === "done" ? t("pages.today.toastDone") : t("pages.today.toastSkipped")}
          </span>
          <button
            type="button"
            onClick={() => void handleUndo()}
            className="inline-flex items-center gap-1 rounded bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-[var(--primary-fg)]"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("actions.undo")}</span>
          </button>
        </div>
      )}

      {contactDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <h2 id="contact-dialog-title" className="text-lg font-semibold">
              {t("pages.today.contactDialogTitle")}
            </h2>
            <p className="text-sm text-[var(--fg-muted)]">
              {t("pages.today.contactDialogBody")}
            </p>

            {contactDialog.item.contacts.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-[var(--fg-muted)]">
                  {t("pages.today.contactDialogNoContacts")}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder={t("pages.today.contactNamePlaceholder")}
                    className="flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddContactInDialog()}
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-muted)]"
                  >
                    {t("pages.today.addContact")}
                  </button>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {contactDialog.item.contacts.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex items-center justify-between gap-2 rounded border border-[var(--border)] px-3 py-2"
                  >
                    <span className="text-sm font-medium">{contact.name}</span>
                    <select
                      aria-label={contact.name}
                      value={contactDialog.statuses[contact.id] ?? "accepted"}
                      onChange={(e) =>
                        setContactDialog((prev) =>
                          prev
                            ? {
                                ...prev,
                                statuses: {
                                  ...prev.statuses,
                                  [contact.id]: e.target.value as ContactStatus,
                                },
                              }
                            : null,
                        )
                      }
                      className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
                    >
                      <option value="accepted">{t("pages.today.contactAccepted")}</option>
                      <option value="not_accepted">
                        {t("pages.today.contactNotAccepted")}
                      </option>
                      <option value="pending">{t("pages.today.contactPending")}</option>
                    </select>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setContactDialog(null)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                {t("actions.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmContactDialog()}
                className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-fg)]"
              >
                {t("pages.today.confirmComplete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
