import {
  computeNextStep,
  localizedText,
  workflowName,
  type ApplicationType,
  type ISODate,
  type ItemPriority,
  type NextStep,
  type WorkMode,
  type Workflow,
} from "@jobfollo/core";
import { ItemValidationError, type CreateItemInput, type StoredItem } from "@jobfollo/data";
import {
  AlertCircle,
  Award,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Kanban,
  LayoutList,
  MessageSquare,
  PauseCircle,
  Plus,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useServices } from "../boot/index.js";
import { useDataRevision, usePreferences } from "../shell/index.js";
import { formatDisplayDate, useLocalToday } from "../time/index.js";
import {
  exportItemsToCsv,
  parseItemsFromCsv,
  type ParseCsvResult,
} from "../transfer/index.js";
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
  lockedApplicationType?: ApplicationType;
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

export function ItemsPage({ todayOverride, lockedApplicationType }: ItemsPageProps = {}) {
  const { t } = useTranslation();
  const services = useServices();
  const { resolvedLocale, skipWeekends } = usePreferences();
  const { revision, bumpRevision } = useDataRevision();
  const hookToday = useLocalToday();
  const today = todayOverride ?? hookToday;

  const [items, setItems] = useState<StoredItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [importOpen, setImportOpen] = useState(false);
  const [importDefaultWorkflow, setImportDefaultWorkflow] = useState("");
  const [importCsvText, setImportCsvText] = useState("");
  const [importBanner, setImportBanner] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [search, setSearch] = useState("");
  const [appTypeTab, setAppTypeTab] = useState<"all" | ApplicationType>("all");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | ItemPriority>("all");
  const [workModeFilter, setWorkModeFilter] = useState<"all" | WorkMode>("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>("dueDate");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [applicationType, setApplicationType] = useState<ApplicationType>("job_posting");
  const [role, setRole] = useState("");
  const [channel, setChannel] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [location, setLocation] = useState("");
  const [workMode, setWorkMode] = useState<WorkMode | "">("");
  const [salaryRange, setSalaryRange] = useState("");
  const [priority, setPriority] = useState<ItemPriority>("normal");
  const [tagsInput, setTagsInput] = useState("");
  const [cvVersion, setCvVersion] = useState("");
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
    setCompany("");
    setApplicationType(
      lockedApplicationType ?? (appTypeTab === "general" ? "general" : "job_posting"),
    );
    setRole("");
    setChannel("");
    setJobUrl("");
    setLocation("");
    setWorkMode("");
    setSalaryRange("");
    setPriority("normal");
    setTagsInput("");
    setCvVersion("");
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

    const parsedTags = tagsInput
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const input: CreateItemInput = {
      title,
      applicationType,
      workflowId,
      startDate,
      priority,
    };
    if (company.trim().length > 0) input.company = company.trim();
    if (role.trim().length > 0) input.role = role.trim();
    if (channel.trim().length > 0) input.channel = channel.trim();
    if (jobUrl.trim().length > 0) input.jobUrl = jobUrl.trim();
    if (location.trim().length > 0) input.location = location.trim();
    if (workMode !== "") input.workMode = workMode;
    if (salaryRange.trim().length > 0) input.salaryRange = salaryRange.trim();
    if (parsedTags.length > 0) input.tags = parsedTags;
    if (cvVersion.trim().length > 0) input.cvVersion = cvVersion.trim();
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

  const tabCounts = useMemo(() => {
    let jobPostings = 0;
    let general = 0;
    for (const item of items) {
      if (item.applicationType === "general") general++;
      else if (item.applicationType === "job_posting") jobPostings++;
    }
    return { all: items.length, jobPostings, general };
  }, [items]);

  const effectiveAppType = lockedApplicationType ?? appTypeTab;

  const rows = useMemo<ItemRowView[]>(() => {
    const query = search.trim().toLocaleLowerCase("tr");
    const computed: ItemRowView[] = [];

    for (const item of items) {
      if (effectiveAppType !== "all" && item.applicationType !== effectiveAppType) {
        continue;
      }
      if (query.length > 0) {
        const hay = [item.title, item.company, item.role, ...(item.tags ?? [])]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("tr");
        if (!hay.includes(query)) {
          continue;
        }
      }
      if (workflowFilter !== "all" && item.workflowId !== workflowFilter) {
        continue;
      }
      const effectiveOutcome = item.outcome ?? "in_progress";
      if (outcomeFilter !== "all" && effectiveOutcome !== outcomeFilter) {
        continue;
      }
      const effectivePriority: ItemPriority = item.priority ?? "normal";
      if (priorityFilter !== "all" && effectivePriority !== priorityFilter) {
        continue;
      }
      if (workModeFilter !== "all" && item.workMode !== workModeFilter) {
        continue;
      }

      const workflow = workflowsById.get(item.workflowId);
      const nextStep = workflow
        ? computeNextStep(item, workflow, today, { skipWeekends })
        : null;
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
  }, [
    items,
    search,
    appTypeTab,
    workflowFilter,
    outcomeFilter,
    priorityFilter,
    workModeFilter,
    workflowsById,
    today,
    skipWeekends,
    sortBy,
  ]);

  const handleLoadSampleData = async () => {
    const wfId = workflows[0]?.id ?? "job-application-networking";
    await services.items.create({
      title: "Senior Frontend Engineer",
      company: "Trendyol Tech",
      applicationType: "job_posting",
      role: "Frontend Engineer",
      channel: "LinkedIn",
      location: "İstanbul",
      workMode: "hybrid",
      priority: "high",
      tags: ["Favori", "React"],
      workflowId: wfId,
      startDate: today,
    });
    await services.items.create({
      title: "Genel Başvuru — Yazılım Mühendisliği",
      company: "Insider",
      applicationType: "general",
      role: "Software Engineer",
      channel: "Kariyer Sitesi",
      location: "İstanbul",
      workMode: "remote",
      priority: "normal",
      tags: ["Genel"],
      workflowId: wfId,
      startDate: today,
    });
    await services.items.create({
      title: "Full-Stack Developer",
      company: "Getir",
      applicationType: "job_posting",
      role: "Full-Stack Developer",
      channel: "Referans",
      location: "Uzaktan",
      workMode: "remote",
      priority: "high",
      workflowId: wfId,
      startDate: today,
    });
    bumpRevision();
  };

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

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.item.id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.item.id)));
    }
  };

  const handleBulkOutcome = async (value: string) => {
    if (selectedIds.size === 0 || value === "") return;
    const outcome = value === "in_progress" ? null : value;
    for (const id of selectedIds) {
      await services.items.setOutcome(id, outcome);
    }
    setSelectedIds(new Set());
    bumpRevision();
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    for (const id of selectedIds) {
      await services.items.archive(id);
    }
    setSelectedIds(new Set());
    bumpRevision();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(
      t("pages.items.bulkDeleteConfirm", { count: selectedIds.size }),
    );
    if (!confirmed) return;
    for (const id of selectedIds) {
      await services.items.delete(id);
    }
    setSelectedIds(new Set());
    bumpRevision();
  };

  const validWorkflowIds = useMemo(
    () => new Set(workflows.map((w) => w.id)),
    [workflows],
  );

  const importPreview = useMemo<ParseCsvResult | null>(() => {
    if (!importCsvText) return null;
    const fallbackWf = importDefaultWorkflow || workflows[0]?.id || "";
    if (!fallbackWf) return null;
    return parseItemsFromCsv(importCsvText, {
      defaultWorkflowId: fallbackWf,
      defaultStartDate: today,
      validWorkflowIds,
    });
  }, [importCsvText, importDefaultWorkflow, workflows, today, validWorkflowIds]);

  const handleExportCsv = async () => {
    const allItems = await services.items.list({ includeArchived: true });
    const csv = exportItemsToCsv(allItems);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jobfollo-items-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleOpenImport = () => {
    setImportDefaultWorkflow(workflows[0]?.id ?? "");
    setImportCsvText("");
    setImportBanner(null);
    setImportOpen(true);
  };

  const handleImportFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      setImportCsvText(text);
    });
  };

  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.rows.length === 0) return;
    let importedCount = 0;
    for (const row of importPreview.rows) {
      const created = await services.items.create(row.input);
      if (row.outcome) {
        await services.items.setOutcome(created.id, row.outcome);
      }
      if (row.archived) {
        await services.items.archive(created.id);
      }
      importedCount++;
    }
    setImportOpen(false);
    setImportCsvText("");
    setImportBanner(t("pages.items.importDone", { count: importedCount }));
    bumpRevision();
  };

  const pageTitle =
    lockedApplicationType === "job_posting"
      ? t("pages.items.titleJobPostings")
      : lockedApplicationType === "general"
        ? t("pages.items.titleGeneral")
        : t("pages.items.title");

  const pageSubtitle =
    lockedApplicationType === "job_posting"
      ? t("pages.items.subtitleJobPostings")
      : lockedApplicationType === "general"
        ? t("pages.items.subtitleGeneral")
        : t("pages.items.subtitle");

  const newButtonLabel =
    lockedApplicationType === "job_posting"
      ? t("pages.items.newJobPosting")
      : lockedApplicationType === "general"
        ? t("pages.items.newGeneralApplication")
        : t("pages.items.newItem");

  const summary = useMemo(() => {
    let needsAction = 0;
    let interviews = 0;
    let offers = 0;
    for (const row of rows) {
      if (row.statusKind === "overdue" || row.statusKind === "due_today") needsAction++;
      if (row.item.outcome === "interview") interviews++;
      if (row.item.outcome === "offer") offers++;
    }
    return { total: rows.length, needsAction, interviews, offers };
  }, [rows]);

  return (
    <div className="w-full space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{pageTitle}</h1>
          <p className="text-sm text-[var(--fg-muted)]">{pageSubtitle}</p>
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
            onClick={() => void handleExportCsv()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium hover:bg-[var(--surface-muted)]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("pages.items.exportCsv")}</span>
          </button>
          <button
            type="button"
            onClick={handleOpenImport}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium hover:bg-[var(--surface-muted)]"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("pages.items.importCsv")}</span>
          </button>
          <button
            type="button"
            onClick={openCreateDialog}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3.5 py-2 text-sm font-medium text-[var(--primary-fg)] hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{newButtonLabel}</span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--fg-muted)]">
            <span>{t("pages.items.kpiTotal")}</span>
            <Briefcase className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
          </div>
          <div className="mt-1.5 text-2xl font-bold tracking-tight">{summary.total}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--fg-muted)]">
            <span>{t("pages.items.kpiNeedsAction")}</span>
            <AlertCircle className="h-4 w-4 text-[var(--warning)]" aria-hidden="true" />
          </div>
          <div className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--warning)]">
            {summary.needsAction}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--fg-muted)]">
            <span>{t("pages.items.kpiInterviews")}</span>
            <MessageSquare className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
          </div>
          <div className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--primary)]">
            {summary.interviews}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--fg-muted)]">
            <span>{t("pages.items.kpiOffers")}</span>
            <Award className="h-4 w-4 text-[var(--success)]" aria-hidden="true" />
          </div>
          <div className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--success)]">
            {summary.offers}
          </div>
        </div>
      </div>

      {importBanner && (
        <div
          role="status"
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--success)]"
        >
          {importBanner}
        </div>
      )}

      {/* Application type section tabs (only shown on the combined All items view) */}
      {!lockedApplicationType ? (
        <div
          role="tablist"
          aria-label={t("pages.items.fieldApplicationType")}
          className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] pb-2"
        >
          {(
            [
              { id: "all", label: t("pages.items.tabAll", { count: tabCounts.all }) },
              {
                id: "job_posting",
                label: t("pages.items.tabJobPostings", { count: tabCounts.jobPostings }),
              },
              {
                id: "general",
                label: t("pages.items.tabGeneral", { count: tabCounts.general }),
              },
            ] as const
          ).map((tab) => {
            const active = appTypeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setAppTypeTab(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                    : "text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}

          {items.length === 0 && (
            <button
              type="button"
              onClick={() => void handleLoadSampleData()}
              className="ml-auto rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--primary)] hover:bg-[var(--surface-muted)]"
            >
              {t("pages.items.loadSampleData")}
            </button>
          )}
        </div>
      ) : (
        items.length === 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleLoadSampleData()}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--primary)] hover:bg-[var(--surface-muted)]"
            >
              {t("pages.items.loadSampleData")}
            </button>
          </div>
        )
      )}

      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-[var(--shadow-card)]">
        <input
          type="search"
          aria-label={t("pages.items.searchLabel")}
          placeholder={t("pages.items.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 min-w-52 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
        />

        <select
          aria-label={t("pages.items.filterWorkflow")}
          value={workflowFilter}
          onChange={(e) => setWorkflowFilter(e.target.value)}
          className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-sm"
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
          className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-sm"
        >
          <option value="all">{t("pages.items.allOutcomes")}</option>
          <option value="in_progress">{t("outcomes.in_progress")}</option>
          <option value="reply">{t("outcomes.reply")}</option>
          <option value="interview">{t("outcomes.interview")}</option>
          <option value="offer">{t("outcomes.offer")}</option>
          <option value="negative">{t("outcomes.negative")}</option>
        </select>

        <select
          aria-label={t("pages.items.filterPriority")}
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as "all" | ItemPriority)}
          className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-sm"
        >
          <option value="all">{t("pages.items.allPriorities")}</option>
          <option value="high">{t("priority.high")}</option>
          <option value="normal">{t("priority.normal")}</option>
          <option value="low">{t("priority.low")}</option>
        </select>

        <select
          aria-label={t("pages.items.filterWorkMode")}
          value={workModeFilter}
          onChange={(e) => setWorkModeFilter(e.target.value as "all" | WorkMode)}
          className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-sm"
        >
          <option value="all">{t("pages.items.allWorkModes")}</option>
          <option value="remote">{t("workMode.remote")}</option>
          <option value="hybrid">{t("workMode.hybrid")}</option>
          <option value="onsite">{t("workMode.onsite")}</option>
        </select>

        <select
          aria-label={t("pages.items.sortBy")}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortMode)}
          className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-sm"
        >
          <option value="dueDate">{t("pages.items.sortDueDate")}</option>
          <option value="created">{t("pages.items.sortCreated")}</option>
          <option value="title">{t("pages.items.sortTitle")}</option>
        </select>

        <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-xs font-medium">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          <span>{t("pages.items.showArchived")}</span>
        </label>
      </div>

      {selectedIds.size > 0 && viewMode === "table" && (
        <div
          role="region"
          aria-label={t("pages.items.bulkSelectedCount", { count: selectedIds.size })}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--primary)] bg-[var(--accent-soft)] px-4 py-2.5 text-xs"
        >
          <span className="font-semibold text-[var(--primary)]">
            {t("pages.items.bulkSelectedCount", { count: selectedIds.size })}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t("pages.items.bulkSetOutcome")}
              value=""
              onChange={(e) => void handleBulkOutcome(e.target.value)}
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
            >
              <option value="">{t("pages.items.bulkSetOutcome")}</option>
              <option value="in_progress">{t("outcomes.in_progress")}</option>
              <option value="reply">{t("outcomes.reply")}</option>
              <option value="interview">{t("outcomes.interview")}</option>
              <option value="offer">{t("outcomes.offer")}</option>
              <option value="negative">{t("outcomes.negative")}</option>
            </select>
            <button
              type="button"
              onClick={() => void handleBulkArchive()}
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 font-medium hover:bg-[var(--surface-muted)]"
            >
              {t("pages.items.bulkArchive")}
            </button>
            <button
              type="button"
              onClick={() => void handleBulkDelete()}
              className="rounded border border-[var(--danger)] bg-[var(--surface)] px-2.5 py-1 font-medium text-[var(--danger)] hover:bg-[var(--danger-bg)]"
            >
              {t("pages.items.bulkDelete")}
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="rounded px-2 py-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              {t("pages.items.bulkClear")}
            </button>
          </div>
        </div>
      )}

      {viewMode === "board" ? (
        <KanbanBoard
          rows={rows}
          locale={resolvedLocale}
          onChangeOutcome={handleKanbanOutcomeChange}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/70 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label={t("pages.items.selectAllItems")}
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                />
              </th>
              <th className="px-4 py-2.5">{t("pages.items.colTitle")}</th>
              <th className="px-4 py-2.5">{t("pages.items.colCompany")}</th>
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
                <td colSpan={8} className="px-4 py-10 text-center text-[var(--fg-muted)]">
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
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={t("pages.items.selectItem", { title: item.title })}
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelectRow(item.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link to={`/items/${item.id}`} className="hover:underline">
                          {item.title}
                        </Link>
                        {!lockedApplicationType && item.applicationType && (
                          <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary)]">
                            {t(`applicationType.${item.applicationType}`)}
                          </span>
                        )}
                        {item.priority === "high" && (
                          <span className="rounded bg-[var(--danger-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--danger)]">
                            {t("priority.high")}
                          </span>
                        )}
                        {item.archivedAt && (
                          <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-xs text-[var(--fg-muted)]">
                            {t("pages.items.archivedBadge")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--fg-muted)]">
                      {item.company || item.location || item.workMode ? (
                        <div>
                          {item.company && (
                            <div className="font-medium text-[var(--fg)]">{item.company}</div>
                          )}
                          {(item.location || item.workMode) && (
                            <div className="text-xs text-[var(--fg-muted)]">
                              {[
                                item.location,
                                item.workMode ? t(`workMode.${item.workMode}`) : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}
                        </div>
                      ) : (
                        "—"
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
            className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl"
          >
            <h2 id="create-item-title" className="text-lg font-semibold">
              {t("pages.items.createDialogTitle")}
            </h2>

            <div className="space-y-1">
              <label htmlFor="item-app-type" className="block text-sm font-medium">
                {t("pages.items.fieldApplicationType")}
              </label>
              <select
                id="item-app-type"
                value={applicationType}
                onChange={(e) => setApplicationType(e.target.value as ApplicationType)}
                className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
              >
                <option value="job_posting">{t("applicationType.job_posting")}</option>
                <option value="general">{t("applicationType.general")}</option>
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

              <div className="space-y-1">
                <label htmlFor="item-company" className="block text-sm font-medium">
                  {t("pages.items.fieldCompany")}
                </label>
                <input
                  id="item-company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                />
                {fieldErrors["company"] && (
                  <p role="alert" className="text-xs text-[var(--overdue-fg)]">
                    {fieldErrors["company"]}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="item-location" className="block text-sm font-medium">
                  {t("pages.items.fieldLocation")}
                </label>
                <input
                  id="item-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="item-work-mode" className="block text-sm font-medium">
                  {t("pages.items.fieldWorkMode")}
                </label>
                <select
                  id="item-work-mode"
                  value={workMode}
                  onChange={(e) => setWorkMode(e.target.value as WorkMode | "")}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                >
                  <option value="">{t("workMode.unspecified")}</option>
                  <option value="remote">{t("workMode.remote")}</option>
                  <option value="hybrid">{t("workMode.hybrid")}</option>
                  <option value="onsite">{t("workMode.onsite")}</option>
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="item-priority" className="block text-sm font-medium">
                  {t("pages.items.fieldPriority")}
                </label>
                <select
                  id="item-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as ItemPriority)}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                >
                  <option value="high">{t("priority.high")}</option>
                  <option value="normal">{t("priority.normal")}</option>
                  <option value="low">{t("priority.low")}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="item-job-url" className="block text-sm font-medium">
                  {t("pages.items.fieldJobUrl")}
                </label>
                <input
                  id="item-job-url"
                  type="url"
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                />
                {fieldErrors["jobUrl"] && (
                  <p role="alert" className="text-xs text-[var(--overdue-fg)]">
                    {fieldErrors["jobUrl"]}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="item-salary" className="block text-sm font-medium">
                  {t("pages.items.fieldSalaryRange")}
                </label>
                <input
                  id="item-salary"
                  type="text"
                  value={salaryRange}
                  onChange={(e) => setSalaryRange(e.target.value)}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="item-tags" className="block text-sm font-medium">
                  {t("pages.items.fieldTags")}
                </label>
                <input
                  id="item-tags"
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="item-cv" className="block text-sm font-medium">
                  {t("pages.items.fieldCvVersion")}
                </label>
                <input
                  id="item-cv"
                  type="text"
                  value={cvVersion}
                  onChange={(e) => setCvVersion(e.target.value)}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                />
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

      {importOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-csv-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg">
            <h2 id="import-csv-title" className="text-lg font-semibold">
              {t("pages.items.importDialogTitle")}
            </h2>

            <div className="space-y-3">
              <div>
                <label htmlFor="import-default-workflow" className="block text-xs font-medium">
                  {t("pages.items.importDefaultWorkflow")}
                </label>
                <select
                  id="import-default-workflow"
                  value={importDefaultWorkflow}
                  onChange={(e) => setImportDefaultWorkflow(e.target.value)}
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm"
                >
                  {workflows.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {workflowName(wf, resolvedLocale)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="import-csv-file" className="block text-xs font-medium">
                  {t("pages.items.importFileLabel")}
                </label>
                <input
                  id="import-csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleImportFileChange}
                  className="mt-1 w-full text-sm"
                />
              </div>

              {importPreview && (
                <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
                  <p className="font-medium">
                    {t("pages.items.importPreviewValid", {
                      count: importPreview.rows.length,
                    })}
                  </p>
                  {importPreview.errors.length > 0 && (
                    <div className="space-y-1 text-[var(--danger)]">
                      <p className="font-medium">
                        {t("pages.items.importPreviewErrors", {
                          count: importPreview.errors.length,
                        })}
                      </p>
                      <ul className="list-disc pl-4">
                        {importPreview.errors.slice(0, 5).map((err) => (
                          <li key={`${err.rowNumber}-${err.message}`}>
                            #{err.rowNumber}: {err.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                {t("actions.cancel")}
              </button>
              <button
                type="button"
                disabled={!importPreview || importPreview.rows.length === 0}
                onClick={() => void handleConfirmImport()}
                className="rounded-md bg-[var(--primary)] px-3.5 py-1.5 text-sm font-medium text-[var(--primary-fg)] disabled:opacity-50"
              >
                {t("pages.items.importConfirm", {
                  count: importPreview?.rows.length ?? 0,
                })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
