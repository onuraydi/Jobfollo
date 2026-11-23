import type { Clock, IdGenerator } from "../../src/types.js";

export function createAdvancingClock(
  startEpochMs = Date.UTC(2026, 10, 10, 9, 0, 0),
  stepMs = 1000,
): Clock {
  let current = startEpochMs;
  return {
    nowIso(): string {
      const iso = new Date(current).toISOString();
      current += stepMs;
      return iso;
    },
  };
}

export function createSequentialIds(prefix = "id"): IdGenerator {
  let counter = 1;
  return {
    newId: () => `${prefix}-${counter++}`,
  };
}
