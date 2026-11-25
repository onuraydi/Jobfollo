import type { ISODate } from "@jobfollo/core";
import type {
  Clock,
  IdGenerator,
  ItemRepository,
  Migration,
  ReminderLogRepository,
  SettingsRepository,
  SqlExecutor,
  TemplateRepository,
  WorkflowRepository,
} from "@jobfollo/data";
import type { MailClient } from "../mail/index.js";

export interface CryptoLike {
  getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
  randomUUID?: () => string;
  subtle?: {
    digest?: (algorithm: string, data: BufferSource) => Promise<ArrayBuffer>;
  };
}

export interface AppServices {
  workflows: WorkflowRepository;
  items: ItemRepository;
  settings: SettingsRepository;
  reminderLog: ReminderLogRepository;
  templates?: TemplateRepository;
  clock: Clock;
  idGenerator: IdGenerator;
  localToday: (now?: Date) => ISODate;
  dataLocation: string | null;
  mail?: MailClient;
}

export interface BootstrapDeps {
  executor: SqlExecutor;
  migrations: readonly Migration[];
  env: CryptoLike | undefined;
  clock: Clock;
  getDataLocation?: () => Promise<string>;
  mail?: MailClient;
}

export type BootError =
  | { kind: "unsupported_environment"; technicalDetails: string }
  | { kind: "open_failed"; technicalDetails: string }
  | { kind: "database_busy"; technicalDetails: string }
  | { kind: "database_io"; technicalDetails: string }
  | {
      kind: "database_newer";
      dbVersion: number;
      appVersion: number;
      technicalDetails: string;
    }
  | {
      kind: "migration_checksum";
      version: number;
      migrationName: string;
      technicalDetails: string;
    }
  | { kind: "migration_invalid"; technicalDetails: string }
  | { kind: "migration_failed"; technicalDetails: string }
  | { kind: "unknown"; technicalDetails: string };

export type BootErrorKind = BootError["kind"];

export type BootResult =
  | { status: "ready"; services: AppServices }
  | { status: "error"; error: BootError; dataLocation: string | null };

export type BootSnapshot = { status: "loading" } | BootResult;
