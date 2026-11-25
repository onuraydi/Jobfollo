import { diffDays, isValidISODate } from "./date.js";
import type { ApplicationType, ISODate, Item, ItemPriority, WorkMode } from "./types.js";

export interface StatBucket {
  label: string;
  count: number;
}

export interface ItemStats {
  total: number;
  byOutcome: {
    in_progress: number;
    reply: number;
    interview: number;
    offer: number;
    negative: number;
  };
  byApplicationType: Record<ApplicationType | "unspecified", number>;
  byPriority: Record<ItemPriority, number>;
  byWorkMode: Record<WorkMode | "unspecified", number>;
  byChannel: StatBucket[];
  /** Number of items with startDate within the last 7 days (inclusive of `today`). */
  recent7DaysCount: number;
  /** Percentage (0..100) of items that reached reply, interview, or offer. */
  responseRate: number;
  /** Percentage (0..100) of items that reached interview or offer. */
  interviewRate: number;
  /** Percentage (0..100) of items that reached offer. */
  offerRate: number;
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

/**
 * Pure local analytics over a set of items.
 */
export function computeStats(items: readonly Item[], today?: ISODate): ItemStats {
  const byOutcome = {
    in_progress: 0,
    reply: 0,
    interview: 0,
    offer: 0,
    negative: 0,
  };

  const byApplicationType: Record<ApplicationType | "unspecified", number> = {
    job_posting: 0,
    general: 0,
    unspecified: 0,
  };

  const byPriority: Record<ItemPriority, number> = {
    high: 0,
    normal: 0,
    low: 0,
  };

  const byWorkMode: Record<WorkMode | "unspecified", number> = {
    remote: 0,
    hybrid: 0,
    onsite: 0,
    unspecified: 0,
  };

  const channelCounts = new Map<string, number>();
  let recent7DaysCount = 0;
  const validToday = today !== undefined && isValidISODate(today);

  for (const item of items) {
    const outcome = item.outcome;
    if (outcome === "reply") byOutcome.reply++;
    else if (outcome === "interview") byOutcome.interview++;
    else if (outcome === "offer") byOutcome.offer++;
    else if (outcome === "negative") byOutcome.negative++;
    else byOutcome.in_progress++;

    const appType = item.applicationType ?? "unspecified";
    byApplicationType[appType]++;

    const priority: ItemPriority = item.priority ?? "normal";
    byPriority[priority]++;

    const wm = item.workMode ?? "unspecified";
    byWorkMode[wm]++;

    const ch = item.channel?.trim();
    if (ch) {
      channelCounts.set(ch, (channelCounts.get(ch) ?? 0) + 1);
    }

    if (validToday && isValidISODate(item.startDate)) {
      const age = diffDays(item.startDate, today);
      if (age >= 0 && age < 7) {
        recent7DaysCount++;
      }
    }
  }

  const byChannel: StatBucket[] = [...channelCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label, "en")));

  const total = items.length;
  const responded = byOutcome.reply + byOutcome.interview + byOutcome.offer;
  const interviewed = byOutcome.interview + byOutcome.offer;

  return {
    total,
    byOutcome,
    byApplicationType,
    byPriority,
    byWorkMode,
    byChannel,
    recent7DaysCount,
    responseRate: pct(responded, total),
    interviewRate: pct(interviewed, total),
    offerRate: pct(byOutcome.offer, total),
  };
}
