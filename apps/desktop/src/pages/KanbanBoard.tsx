import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  localizedText,
  workflowName,
  type Locale,
  type NextStep,
  type Workflow,
} from "@jobfollo/core";
import type { StoredItem } from "@jobfollo/data";
import { GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { formatDisplayDate } from "../time/index.js";

export const KANBAN_OUTCOMES = [
  "in_progress",
  "reply",
  "interview",
  "offer",
  "negative",
] as const;

export type KanbanOutcomeKey = (typeof KANBAN_OUTCOMES)[number];

export interface KanbanCardRow {
  item: StoredItem;
  workflow: Workflow | undefined;
  nextStep: NextStep | null;
}

export interface KanbanBoardProps {
  rows: KanbanCardRow[];
  locale: Locale;
  onChangeOutcome: (itemId: string, outcome: string | null) => Promise<void>;
}

export function outcomeKeyToStoredValue(key: KanbanOutcomeKey): string | null {
  return key === "in_progress" ? null : key;
}

export function storedOutcomeToKey(outcome: string | undefined): KanbanOutcomeKey {
  if (!outcome) return "in_progress";
  if ((KANBAN_OUTCOMES as readonly string[]).includes(outcome)) {
    return outcome as KanbanOutcomeKey;
  }
  return "in_progress";
}

function KanbanCard({
  row,
  locale,
  onChangeOutcome,
}: {
  row: KanbanCardRow;
  locale: Locale;
  onChangeOutcome: (itemId: string, outcome: string | null) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { item, workflow, nextStep } = row;
  const currentKey = storedOutcomeToKey(item.outcome);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      data-testid={`kanban-card-${item.id}`}
      className={`space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-sm shadow-xs transition-opacity ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/items/${item.id}`}
          className="font-medium leading-snug hover:underline"
        >
          {item.title}
        </Link>
        <button
          type="button"
          aria-label={t("pages.items.dragCardLabel", { title: item.title })}
          className="cursor-grab rounded p-0.5 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)] active:cursor-grabbing"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {item.role && (
        <p className="text-xs text-[var(--fg-muted)]">{item.role}</p>
      )}

      <p className="text-xs text-[var(--fg-muted)]">
        {workflow ? workflowName(workflow, locale) : item.workflowId}
      </p>

      {nextStep && (
        <div className="rounded bg-[var(--surface-muted)] px-2 py-1 text-xs">
          <div className="font-medium">
            {localizedText(nextStep.title, nextStep.titles, locale)}
          </div>
          <div className="text-[var(--fg-muted)]">
            {formatDisplayDate(nextStep.dueDate, locale)}
          </div>
        </div>
      )}

      <div className="pt-1">
        <select
          aria-label={t("pages.items.moveOutcomeLabel", { title: item.title })}
          value={currentKey}
          onChange={(e) => {
            const nextKey = e.target.value as KanbanOutcomeKey;
            void onChangeOutcome(item.id, outcomeKeyToStoredValue(nextKey));
          }}
          className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--fg)]"
        >
          {KANBAN_OUTCOMES.map((key) => (
            <option key={key} value={key}>
              {t(`outcomes.${key}`)}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

function KanbanColumn({
  outcomeKey,
  rows,
  locale,
  onChangeOutcome,
}: {
  outcomeKey: KanbanOutcomeKey;
  rows: KanbanCardRow[];
  locale: Locale;
  onChangeOutcome: (itemId: string, outcome: string | null) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: outcomeKey });

  return (
    <section
      ref={setNodeRef}
      data-testid={`kanban-col-${outcomeKey}`}
      aria-label={t(`outcomes.${outcomeKey}`)}
      className={`flex min-h-64 flex-col gap-2.5 rounded-lg border p-3 transition-colors ${
        isOver
          ? "border-[var(--primary)] bg-[var(--surface-muted)]"
          : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      <header className="flex items-center justify-between gap-2 pb-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
          {t(`outcomes.${outcomeKey}`)}
        </h2>
        <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--fg-muted)]">
          {rows.length}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-2">
        {rows.length === 0 ? (
          <p className="py-4 text-center text-xs text-[var(--fg-muted)]">
            {t("pages.items.boardEmptyColumn")}
          </p>
        ) : (
          rows.map((row) => (
            <KanbanCard
              key={row.item.id}
              row={row}
              locale={locale}
              onChangeOutcome={onChangeOutcome}
            />
          ))
        )}
      </div>
    </section>
  );
}

export function KanbanBoard({ rows, locale, onChangeOutcome }: KanbanBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const itemId = String(active.id);
    const targetKey = String(over.id) as KanbanOutcomeKey;
    if (!(KANBAN_OUTCOMES as readonly string[]).includes(targetKey)) return;

    const currentRow = rows.find((r) => r.item.id === itemId);
    if (!currentRow) return;
    if (storedOutcomeToKey(currentRow.item.outcome) === targetKey) return;

    void onChangeOutcome(itemId, outcomeKeyToStoredValue(targetKey));
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {KANBAN_OUTCOMES.map((key) => {
          const columnRows = rows.filter(
            (row) => storedOutcomeToKey(row.item.outcome) === key,
          );
          return (
            <KanbanColumn
              key={key}
              outcomeKey={key}
              rows={columnRows}
              locale={locale}
              onChangeOutcome={onChangeOutcome}
            />
          );
        })}
      </div>
    </DndContext>
  );
}
