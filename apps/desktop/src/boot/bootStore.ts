import { builtInMigrations, systemClock } from "@jobfollo/data";
import { defaultSqlExecutor, getDefaultDataLocation } from "../db/default.js";
import { defaultMailClient } from "../mail/index.js";
import { bootstrap } from "./bootstrap.js";
import type { BootResult, BootSnapshot } from "./types.js";

export interface BootController {
  getBoot(): Promise<BootResult>;
  retryBoot(): Promise<BootResult>;
  subscribe(listener: () => void): () => void;
  getSnapshot(): BootSnapshot;
}

export function createBootController(run: () => Promise<BootResult>): BootController {
  let inFlight: Promise<BootResult> | null = null;
  let generation = 0;
  let snapshot: BootSnapshot = { status: "loading" };
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function startRun(): Promise<BootResult> {
    const runId = ++generation;
    const promise = run().then((result) => {
      if (runId === generation) {
        snapshot = result;
        notify();
      }
      return result;
    });
    inFlight = promise;
    return promise;
  }

  function getBoot(): Promise<BootResult> {
    if (inFlight !== null) {
      return inFlight;
    }
    return startRun();
  }

  function retryBoot(): Promise<BootResult> {
    inFlight = null;
    snapshot = { status: "loading" };
    notify();
    return startRun();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    if (inFlight === null) {
      void startRun();
    }
    return () => {
      listeners.delete(listener);
    };
  }

  function getSnapshot(): BootSnapshot {
    return snapshot;
  }

  return {
    getBoot,
    retryBoot,
    subscribe,
    getSnapshot,
  };
}

const defaultController = createBootController(() =>
  bootstrap({
    executor: defaultSqlExecutor,
    migrations: builtInMigrations,
    env: globalThis.crypto,
    clock: systemClock,
    getDataLocation: getDefaultDataLocation,
    mail: defaultMailClient,
  }),
);

export function getBoot(): Promise<BootResult> {
  return defaultController.getBoot();
}

export function retryBoot(): Promise<BootResult> {
  return defaultController.retryBoot();
}

export function subscribeBoot(listener: () => void): () => void {
  return defaultController.subscribe(listener);
}

export function getBootSnapshot(): BootSnapshot {
  return defaultController.getSnapshot();
}
