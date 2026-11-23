import type { Clock, IdGenerator } from "./types.js";

export const systemClock: Clock = {
  nowIso: () => new Date().toISOString(),
};

export const randomIdGenerator: IdGenerator = {
  newId: () => globalThis.crypto.randomUUID(),
};
