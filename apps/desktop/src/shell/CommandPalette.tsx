import type { StoredItem } from "@jobfollo/data";
import {
  BarChart3,
  Briefcase,
  CalendarCheck2,
  CalendarDays,
  FileText,
  FolderKanban,
  GitBranch,
  Monitor,
  Moon,
  Search,
  Send,
  Settings,
  Sun,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useServices } from "../boot/index.js";
import { useDataRevision } from "./DataRevisionContext.js";
import { usePreferences } from "./PreferencesContext.js";

interface PaletteEntry {
  id: string;
  group: "navigation" | "items" | "actions";
  label: string;
  sublabel?: string;
  keywords: string;
  icon: typeof Search;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const services = useServices();
  const { setTheme } = usePreferences();
  const { revision } = useDataRevision();

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<StoredItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    let active = true;
    void services.items.list().then((loaded) => {
      if (active) setItems(loaded);
    });
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      active = false;
    };
  }, [open, services, revision]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const entries = useMemo<PaletteEntry[]>(() => {
    const nav: PaletteEntry[] = [
      {
        id: "nav-today",
        group: "navigation",
        label: t("nav.today"),
        keywords: "today bugun",
        icon: CalendarCheck2,
        onSelect: () => {
          navigate("/");
          onClose();
        },
      },
      {
        id: "nav-job-postings",
        group: "navigation",
        label: t("nav.jobPostings"),
        keywords: "job postings acik ilan ilanlar",
        icon: Briefcase,
        onSelect: () => {
          navigate("/job-postings");
          onClose();
        },
      },
      {
        id: "nav-general-applications",
        group: "navigation",
        label: t("nav.generalApplications"),
        keywords: "general applications genel basvuru basvurular",
        icon: Send,
        onSelect: () => {
          navigate("/general-applications");
          onClose();
        },
      },
      {
        id: "nav-items",
        group: "navigation",
        label: t("nav.items"),
        keywords: "items kayitlar kanban",
        icon: FolderKanban,
        onSelect: () => {
          navigate("/items");
          onClose();
        },
      },
      {
        id: "nav-calendar",
        group: "navigation",
        label: t("nav.calendar"),
        keywords: "calendar takvim schedule",
        icon: CalendarDays,
        onSelect: () => {
          navigate("/calendar");
          onClose();
        },
      },
      {
        id: "nav-stats",
        group: "navigation",
        label: t("nav.stats"),
        keywords: "stats istatistikler analytics funnel",
        icon: BarChart3,
        onSelect: () => {
          navigate("/stats");
          onClose();
        },
      },
      {
        id: "nav-templates",
        group: "navigation",
        label: t("nav.templates"),
        keywords: "templates sablonlar mail email message mesaj",
        icon: FileText,
        onSelect: () => {
          navigate("/templates");
          onClose();
        },
      },
      {
        id: "nav-workflows",
        group: "navigation",
        label: t("nav.workflows"),
        keywords: "workflows is akislari templates",
        icon: GitBranch,
        onSelect: () => {
          navigate("/workflows");
          onClose();
        },
      },
      {
        id: "nav-settings",
        group: "navigation",
        label: t("nav.settings"),
        keywords: "settings ayarlar smtp theme",
        icon: Settings,
        onSelect: () => {
          navigate("/settings");
          onClose();
        },
      },
    ];

    const itemEntries: PaletteEntry[] = items.map((item) => ({
      id: `item-${item.id}`,
      group: "items",
      label: item.title,
      sublabel: [item.company, item.role].filter(Boolean).join(" · ") || undefined,
      keywords: [item.title, item.company, item.role, ...(item.tags ?? [])]
        .filter(Boolean)
        .join(" "),
      icon: FolderKanban,
      onSelect: () => {
        navigate(`/items/${item.id}`);
        onClose();
      },
    }));

    const actions: PaletteEntry[] = [
      {
        id: "theme-light",
        group: "actions",
        label: t("commandPalette.actionLightTheme"),
        keywords: "light acik theme tema",
        icon: Sun,
        onSelect: () => {
          void setTheme("light");
          onClose();
        },
      },
      {
        id: "theme-dark",
        group: "actions",
        label: t("commandPalette.actionDarkTheme"),
        keywords: "dark koyu theme tema",
        icon: Moon,
        onSelect: () => {
          void setTheme("dark");
          onClose();
        },
      },
      {
        id: "theme-system",
        group: "actions",
        label: t("commandPalette.actionSystemTheme"),
        keywords: "system sistem theme tema",
        icon: Monitor,
        onSelect: () => {
          void setTheme("system");
          onClose();
        },
      },
    ];

    return [...nav, ...itemEntries, ...actions];
  }, [items, navigate, onClose, setTheme, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return entries;
    return entries.filter((entry) => {
      const hay = `${entry.label} ${entry.sublabel ?? ""} ${entry.keywords}`.toLocaleLowerCase("tr");
      return hay.includes(q);
    });
  }, [entries, query]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("commandPalette.openButton")}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-20 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3.5 py-2.5">
          <Search className="h-4 w-4 text-[var(--fg-muted)]" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered[0]) {
                e.preventDefault();
                filtered[0].onSelect();
              }
            }}
            placeholder={t("commandPalette.placeholder")}
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="rounded border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--fg-muted)]">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-[var(--fg-muted)]">
              {t("commandPalette.empty")}
            </p>
          ) : (
            (["navigation", "items", "actions"] as const).map((group) => {
              const groupRows = filtered.filter((e) => e.group === group);
              if (groupRows.length === 0) return null;
              const groupLabel =
                group === "navigation"
                  ? t("commandPalette.groupNavigation")
                  : group === "items"
                    ? t("commandPalette.groupItems")
                    : t("commandPalette.groupActions");
              return (
                <div key={group} className="mb-2 last:mb-0">
                  <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                    {groupLabel}
                  </div>
                  <ul className="space-y-0.5">
                    {groupRows.slice(0, 8).map((entry) => {
                      const Icon = entry.icon;
                      return (
                        <li key={entry.id}>
                          <button
                            type="button"
                            onClick={entry.onSelect}
                            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-[var(--surface-muted)]"
                          >
                            <Icon
                              className="h-4 w-4 shrink-0 text-[var(--fg-muted)]"
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{entry.label}</div>
                              {entry.sublabel && (
                                <div className="truncate text-xs text-[var(--fg-muted)]">
                                  {entry.sublabel}
                                </div>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
