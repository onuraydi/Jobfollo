import {
  computeNextStep,
  localizedText,
  workflowName,
  type ISODate,
  type NextStep,
  type Workflow,
} from "@jobfollo/core";
import { ItemValidationError, type CreateItemInput, type StoredItem } from "@jobfollo/data";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Kanban,
  LayoutList,
  PauseCircle,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useServices } from "../boot/index.js";
import { useDataRevision, usePreferences } from "../shell/index.js";
import { formatDisplayDate, useLocalToday } from "../time/index.js";
import { KanbanBoard } from "./KanbanBoard.js";

type SortMode = "dueDate" | "created" | "title";
type ViewMode = "table" | "board";

interface ItemRowView {
  item: StoredItem;
  workflow: Workflow | undefined;
  nextStep: NextStep | null;
  statusKind: "overdue" | "due_today" | "pending" | "stopped" | "done";
}

export interface ItemsPageProps {
  todayOverride?: ISODate;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function ItemsPage({ todayOverride }: ItemsPageProps = {}) {
  const { t } = useTranslation();
  const services = useServices();
  const { resolvedLocale } = usePreferences();
  const { revision, bumpRevision } = useDataRevision();
  const hookToday = useLocalToday();
  const today = todayOverride ?? hookToday;

  const [items, setItems] = useState<StoredItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [search, setSearch] = useState("");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>("dueDate");

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("");
  const [channel, setChannel] = useState("");
  const [workflowId, setWorkflowId] = useState("job-application-networking");
  const [startDate, setStartDate] = useState<ISODate>(today);
  const [contactName, setContactName] = useState("");
  const [contactUrl, setContactUrl] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void Promise.all([
      services.items.list({ includeArchived }),
      services.workflows.listAll(),
    ]).then(([loadedItems, wfEntries]) => {
      if (!active) return;
      setItems(loadedItems);
      setWorkflows(wfEntries.map((e) => e.workflow));
    });
    return () => {
      active = false;
    };
  }, [services, includeArchived, revision, today]);

  // Keyboard shortcut: press N to open Create dialog
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === "n" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !createOpen &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        openCreateDialog();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [createOpen, today]);

  function openCreateDialog() {
    setTitle("");
    setRole("");
    setChannel("");
    setWorkflowId(workflows[0]?.id ?? "job-application-networking");
    setStartDate(today);
    setContactName("");
    setContactUrl("");
    setFieldErrors({});
    setCreateOpen(true);
  }

  async function handleCreateSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});

    const input: CreateItemInput = {
      title,
      workflowId,
      startDate,
    };
    if (role.trim().length > 0) input.role = role.trim();
    if (channel.trim().length > 0) input.channel = channel.trim();
    if (contactName.trim().length > 0 || contactUrl.trim().length > 0) {
      input.contacts = [
        {
          name: contactName,
          status: "pending",
          ...(contactUrl.trim().length > 0 ? { profileUrl: contactUrl.trim() } : {}),
        },
      ];
    }

    try {
      await services.items.create(input);
      setCreateOpen(false);
      bumpRevision();
    } catch (err) {
      if (err instanceof ItemValidationError) {
        const mapped: Record<string, string> = {};
        for (const issue of err.issues) {
          mapped[issue.field] = issue.message;
        }
        setFieldErrors(mapped);
        return;
      }
      throw err;
    }
  }

  const workflowsById = useMemo(
    () => new Map(workflows.map((w) => [w.id, w])),
    [workflows],
  );

  const rows = useMemo<ItemRowView[]>(() => {
    const query = search.trim().toLocaleLowerCase("tr");
    const computed: ItemRowView[] = [];

    for (const item of items) {
      if (query.length > 0 && !item.title.toLocaleLowerCase("tr").includes(query)) {
        continue;
      }
      if (workflowFilter !== "all" && item.workflowId !== workflowFilter) {
        continue;
      }
      const effectiveOutcome = item.outcome ?? "in_progress";
      if (outcomeFilter !== "all" && effectiveOutcome !== outcomeFilter) {
        continue;
      }

      const workflow = workflowsById.get(item.workflowId);
      const nextStep = workflow ? computeNextStep(item, workflow, today) : null;
      const isStopped =
        item.outcome !== undefined &&
        workflow !== undefined &&
        workflow.stopOutcomes.includes(item.outcome);

      let statusKind: ItemRowView["statusKind"];
      if (isStopped) {
        statusKind = "stopped";
      } else if (nextStep === null) {
        statusKind = "done";
      } else if (nextStep.daysLeft < 0) {
        statusKind = "overdue";
      } else if (nextStep.daysLeft === 0) {
        statusKind = "due_today";
      } else {
        statusKind = "pending";
      }

      computed.push({ item, workflow, nextStep, statusKind });
    }

    const compareTitlesTr = (a: ItemRowView, b: ItemRowView) =>
      a.item.title.localeCompare(b.item.title, "tr", { sensitivity: "base" });

    computed.sort((a, b) => {
      if (sortBy === "title") {
        return compareTitlesTr(a, b);
      }
      if (sortBy === "created") {
        if (a.item.createdAt !== b.item.createdAt) {
          return a.item.createdAt < b.item.createdAt ? 1 : -1;
        }
        return compareTitlesTr(a, b);
      }
      // dueDate (default)
      if (a.nextStep && b.nextStep) {
        if (a.nextStep.daysLeft !== b.nextStep.daysLeft) {
          return a.nextStep.daysLeft - b.nextStep.daysLeft;
        }
        return compareTitlesTr(a, b);
      }
      if (a.nextStep) return -1;
      if (b.nextStep) return 1;
      return compareTitlesTr(a, b);
    });

    return computed;
  }, [items, search, workflowFilter, outcomeFilter, workflowsById, today, sortBy]);

  function renderStatusChip(kind: ItemRowView["statusKind"]) {
    const config = {
      overdue: {
        icon: AlertCircle,
        cls: "bg-[var(--overdue-bg)] text-[var(--overdue-fg)]",
        label: t("status.overdue"),
      },
      due_today: {
        icon: Clock,
        cls: "bg-[var(--today-bg)] text-[var(--today-fg)]",
        label: t("status.due_today"),
      },
      pending: {
        icon: Calendar,
        cls: "bg-[var(--surface-muted)] text-[var(--fg-muted)]",
        label: t("status.pending"),
      },
      stopped: {
        icon: PauseCircle,
        cls: "bg-[var(--surface-muted)] text-[var(--fg-muted)]",
        label: t("status.stopped"),
      },
      done: {
        icon: CheckCircle2,
        cls: "bg-[var(--done-bg)] text-[var(--done-fg)]",
        label: t("status.done"),
      },
    }[kind];

    const Icon = config.icon;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.cls}`}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        <span>{config.label}</span>
      </span>
    );
  }

  const handleKanbanOutcomeChange = async (itemId: string, outcome: string | null) => {
    await services.items.setOutcome(itemId, outcome);
    bumpRevision();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pages.items.title")}</h1>
          <p className="text-sm text-[var(--fg-muted)]">{t("pages.items.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5">
            <button
              type="button"
              aria-pressed={viewMode === "table"}
              onClick={() => setViewMode("table")}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                  : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("pages.items.viewTable")}</span>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "board"}
              onClick={() => setViewMode("board")}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "board"
                  ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                  : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
              }`}
            >
              <Kanban className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("pages.items.viewBoard")}</span>
            </button>
          </div>
          <button
            type="button"
            onClick={openCreateDialog}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3.5 py-2 text-sm font-medium text-[var(--primary-fg)] hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{t("pages.items.newItem")}</span>
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        <input
          type="search"
          aria-label={t("pages.items.searchLabel")}
          placeholder={t("pages.items.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-48 flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
        />

        <select
          aria-label={t("pages.items.filterWorkflow")}
          value={workflowFilter}
          onChange={(e) => setWorkflowFilter(e.target.value)}
          className="rounded border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm"
        >
          <option value="all">{t("pages.items.allWorkflows")}</option>
          {workflows.map((wf) => (
            <option key={wf.id} value={wf.id}>
              {workflowName(wf, resolvedLocale)}
            </option>
          ))}
        </select>

        <select
          aria-label={t("pages.items.filterOutcome")}
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value)}
          className="rounded border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm"
        >
          <option value="all">{t("pages.items.allOutcomes")}</option>
          <option value="in_progress">{t("outcomes.in_progress")}</option>
          <option value="reply">{t("outcomes.reply")}</option>
          <option value="interview">{t("outcomes.interview")}</option>
          <option value="offer">{t("outcomes.offer")}</option>
          <option value="negative">{t("outcomes.negative")}</option>
        </select>

        <select
          aria-label={t("pages.items.sortBy")}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortMode)}
          className="rounded border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm"
        >
          <option value="dueDate">{t("pages.items.sortDueDate")}</option>
          <option value="created">{t("pages.items.sortCreated")}</option>
          <option value="title">{t("pages.items.sortTitle")}</option>
        </select>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          <span>{t("pages.items.showArchived")}</span>
        </label>
      </div>

      {viewMode === "board" ? (
        <KanbanBoard
          rows={rows}
          locale={resolvedLocale}
          onChangeOutcome={handleKanbanOutcomeChange}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-xs font-semibold text-[var(--fg-muted)]">
              <th className="px-4 py-2.5">{t("pages.items.colTitle")}</th>
              <th className="px-4 py-2.5">{t("pages.items.colRole")}</th>
              <th className="px-4 py-2.5">{t("pages.items.colWorkflow")}</th>
              <th className="px-4 py-2.5">{t("pages.items.colNextStep")}</th>
              <th className="px-4 py-2.5">{t("pages.items.colOutcome")}</th>
              <th className="px-4 py-2.5">{t("pages.items.colStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--fg-muted)]">
                  {t("pages.items.emptyTable")}
                </td>
              </tr>
            ) : (
              rows.map(({ item, workflow, nextStep, statusKind }) => {
                const outcomeKey = item.outcome ?? "in_progress";
                return (
                  <tr
                    key={item.id}
                    className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-muted)]/50"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/items/${item.id}`} className="hover:underline">
                        {item.title}
                      </Link>
                      {item.archivedAt && (
                        <span className="ml-2 rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-xs text-[var(--fg-muted)]">
                          {t("pages.items.archivedBadge")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--fg-muted)]">{item.role ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--fg-muted)]">
                      {workflow ? workflowName(workflow, resolvedLocale) : item.workflowId}
                    </td>
                    <td className="px-4 py-3">
                      {nextStep ? (
                        <div>
                          <div>
                            {localizedText(nextStep.title, nextStep.titles, resolvedLocale)}
                          </div>
                          <div className="text-xs text-[var(--fg-muted)]">
                            {formatDisplayDate(nextStep.dueDate, resolvedLocale)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[var(--fg-muted)]">
                          {t("pages.items.noNextStep")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t(`outcomes.${outcomeKey}`, { defaultValue: outcomeKey })}
                    </td>
                    <td className="px-4 py-3">{renderStatusChip(statusKind)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}

      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-item-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <form
            onSubmit={(e) => void handleCreateSubmit(e)}
            noValidate
            className="w-full max-w-lg space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl"
          >
            <h2 id="create-item-title" className="text-lg font-semibold">
              {t("pages.items.createDialogTitle")}
            </h2>

            <div className="space-y-1">
              <label htmlFor="item-title" className="block text-sm font-medium">
                {t("pages.items.fieldTitle")}
              </label>
              <input
                id="item-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
              />
              {fieldErrors["title"] && (
                <p role="alert" className="text-xs text-[var(--overdue-fg)]">
                  {fieldErrors["title"]}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="item-role" className="block text-sm font-medium">
                  {t("pages.items.fieldRole")}
                </label>
                <input
                  id="item-role"
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                />
                {fieldErrors["role"] && (
                  <p role="alert" className="text-xs text-[var(--overdue-fg)]">
                    {fieldErrors["role"]}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="item-channel" className="block text-sm font-medium">
                  {t("pages.items.fieldChannel")}
                </label>
                <input
                  id="item-channel"
                  type="text"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                />
                {fieldErrors["channel"] && (
                  <p role="alert" className="text-xs text-[var(--overdue-fg)]">
                    {fieldErrors["channel"]}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="item-workflow" className="block text-sm font-medium">
                  {t("pages.items.fieldWorkflow")}
                </label>
                <select
                  id="item-workflow"
                  value={workflowId}
                  onChange={(e) => setWorkflowId(e.target.value)}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm"
                >
                  {workflows.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {workflowName(wf, resolvedLocale)}
                    </option>
                  ))}
                </select>
                {fieldErrors["workflowId"] && (
                  <p role="alert" className="text-xs text-[var(--overdue-fg)]">
                    {fieldErrors["workflowId"]}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="item-start-date" className="block text-sm font-medium">
                  {t("pages.items.fieldStartDate")}
                </label>
                <input
                  id="item-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                />
                {fieldErrors["startDate"] && (
                  <p role="alert" className="text-xs text-[var(--overdue-fg)]">
                    {fieldErrors["startDate"]}
                  </p>
                )}
              </div>
            </div>

            <fieldset className="space-y-2 rounded border border-[var(--border)] p-3">
              <legend className="px-1 text-xs font-medium text-[var(--fg-muted)]">
                {t("pages.items.fieldContactSection")}
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="item-contact-name" className="block text-xs font-medium">
                    {t("pages.items.fieldContactName")}
                  </label>
                  <input
                    id="item-contact-name"
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm"
                  />
                  {fieldErrors["contacts[0].name"] && (
                    <p role="alert" className="text-xs text-[var(--overdue-fg)]">
                      {fieldErrors["contacts[0].name"]}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label htmlFor="item-contact-url" className="block text-xs font-medium">
                    {t("pages.items.fieldContactUrl")}
                  </label>
                  <input
                    id="item-contact-url"
                    type="text"
                    value={contactUrl}
                    onChange={(e) => setContactUrl(e.target.value)}
                    className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm"
                  />
                  {fieldErrors["contacts[0].profileUrl"] && (
                    <p role="alert" className="text-xs text-[var(--overdue-fg)]">
                      {fieldErrors["contacts[0].profileUrl"]}
                    </p>
                  )}
                </div>
              </div>
            </fieldset>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                {t("actions.cancel")}
              </button>
              <button
                type="submit"
                className="rounded-md bg-[var(--primary)] px-3.5 py-1.5 text-sm font-medium text-[var(--primary-fg)]"
              >
                {t("pages.items.createSubmit")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
