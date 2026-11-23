import {
  createItemRepository,
  createReminderLogRepository,
  createSettingsRepository,
  createWorkflowRepository,
  runMigrations,
} from "@jobfollo/data";
import { localToday } from "../time/index.js";
import { classifyBootError } from "./classifyBootError.js";
import { createCryptoIdGenerator } from "./idGenerator.js";
import type { AppServices, BootResult, BootstrapDeps, CryptoLike } from "./types.js";

async function checkEnvironment(env: CryptoLike | undefined): Promise<string | null> {
  if (!env) {
    return "WebCrypto API (globalThis.crypto) is unavailable in this environment.";
  }

  if (typeof env.getRandomValues !== "function") {
    return "crypto.getRandomValues is unavailable in this environment.";
  }

  try {
    env.getRandomValues(new Uint8Array(16));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return `crypto.getRandomValues failed: ${detail}`;
  }

  if (!env.subtle || typeof env.subtle.digest !== "function") {
    return "crypto.subtle.digest (WebCrypto SHA-256) is unavailable on this origin.";
  }

  try {
    const digest = await env.subtle.digest("SHA-256", new Uint8Array([1, 2, 3]));
    if (!(digest instanceof ArrayBuffer) || digest.byteLength !== 32) {
      return "crypto.subtle.digest returned an unexpected SHA-256 digest length.";
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return `crypto.subtle.digest("SHA-256") failed: ${detail}`;
  }

  return null;
}

export async function bootstrap(deps: BootstrapDeps): Promise<BootResult> {
  // (a) Environment check — actively exercise WebCrypto before touching IPC/DB
  const envFailure = await checkEnvironment(deps.env);
  if (envFailure !== null) {
    return {
      status: "error",
      error: {
        kind: "unsupported_environment",
        technicalDetails: envFailure,
      },
      dataLocation: null,
    };
  }

  // (b) Best-effort data location lookup (never fatal)
  let dataLocation: string | null = null;
  if (deps.getDataLocation) {
    try {
      dataLocation = await deps.getDataLocation();
    } catch {
      dataLocation = null;
    }
  }

  // (c) Run migrations
  try {
    await runMigrations(deps.executor, deps.migrations, deps.clock);
  } catch (err) {
    return {
      status: "error",
      error: classifyBootError(err),
      dataLocation,
    };
  }

  // (d) Build services
  const idGenerator = createCryptoIdGenerator(deps.env!);
  const workflows = createWorkflowRepository(deps.executor, {
    clock: deps.clock,
    idGenerator,
  });
  const items = createItemRepository(deps.executor, workflows, {
    clock: deps.clock,
    idGenerator,
  });
  const settings = createSettingsRepository(deps.executor);
  const reminderLog = createReminderLogRepository(deps.executor, {
    clock: deps.clock,
    idGenerator,
  });

  const services: AppServices = {
    workflows,
    items,
    settings,
    reminderLog,
    clock: deps.clock,
    idGenerator,
    localToday,
    dataLocation,
  };

  return { status: "ready", services };
}
