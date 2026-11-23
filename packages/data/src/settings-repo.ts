import { SettingValidationError, UnknownSettingError } from "./errors.js";
import type { FieldValidationIssue, SqlExecutor, SqlStatement } from "./types.js";
import {
  isValidIntegerInRange,
  isValidRecipientEmail,
  isValidSendTime,
  isValidSmtpHost,
  isValidSmtpUsername,
} from "./validation.js";

export type LanguageSetting = "system" | "tr" | "en";
export type ThemeSetting = "system" | "light" | "dark";
export type SmtpSecuritySetting = "starttls" | "tls";

interface SettingDefinition<T> {
  readonly default: T;
  readonly validate: (value: unknown) => value is T;
}

function defineSetting<T>(def: SettingDefinition<T>): SettingDefinition<T> {
  return def;
}

export const SETTINGS_REGISTRY = {
  language: defineSetting<LanguageSetting>({
    default: "system",
    validate: (v): v is LanguageSetting => v === "system" || v === "tr" || v === "en",
  }),
  theme: defineSetting<ThemeSetting>({
    default: "system",
    validate: (v): v is ThemeSetting => v === "system" || v === "light" || v === "dark",
  }),
  "reminders.enabled": defineSetting<boolean>({
    default: false,
    validate: (v): v is boolean => typeof v === "boolean",
  }),
  "reminders.sendTime": defineSetting<string>({
    default: "09:00",
    validate: isValidSendTime,
  }),
  "reminders.recipient": defineSetting<string | null>({
    default: null,
    validate: (v): v is string | null => v === null || isValidRecipientEmail(v),
  }),
  "reminders.upcomingDays": defineSetting<number>({
    default: 0,
    validate: (v): v is number => isValidIntegerInRange(v, 0, 30),
  }),
  "smtp.host": defineSetting<string | null>({
    default: null,
    validate: (v): v is string | null => v === null || isValidSmtpHost(v),
  }),
  "smtp.port": defineSetting<number>({
    default: 587,
    validate: (v): v is number => isValidIntegerInRange(v, 1, 65535),
  }),
  "smtp.security": defineSetting<SmtpSecuritySetting>({
    default: "starttls",
    validate: (v): v is SmtpSecuritySetting => v === "starttls" || v === "tls",
  }),
  "smtp.username": defineSetting<string | null>({
    default: null,
    validate: (v): v is string | null => v === null || isValidSmtpUsername(v),
  }),
} as const;

export type SettingKey = keyof typeof SETTINGS_REGISTRY;

export type SettingValues = {
  [K in SettingKey]: (typeof SETTINGS_REGISTRY)[K]["default"];
};

export const SETTING_KEYS: readonly SettingKey[] = Object.keys(
  SETTINGS_REGISTRY,
) as readonly SettingKey[];

export interface SettingsGetAllResult {
  values: SettingValues;
  invalid: SettingKey[];
}

export interface SettingsRepository {
  get<K extends SettingKey>(key: K): Promise<SettingValues[K]>;
  set<K extends SettingKey>(key: K, value: SettingValues[K]): Promise<void>;
  setMany(entries: Partial<SettingValues>): Promise<void>;
  reset(key: SettingKey): Promise<void>;
  getAll(): Promise<SettingsGetAllResult>;
}

function isKnownSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS_REGISTRY, key);
}

function assertKnownSettingKey(key: string): asserts key is SettingKey {
  if (!isKnownSettingKey(key)) {
    throw new UnknownSettingError(key);
  }
}

function parseStoredValue<K extends SettingKey>(
  key: K,
  rawJson: string,
): { ok: true; value: SettingValues[K] } | { ok: false } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false };
  }
  const def = SETTINGS_REGISTRY[key];
  if (!def.validate(parsed)) {
    return { ok: false };
  }
  return { ok: true, value: parsed as SettingValues[K] };
}

interface SettingRow {
  key: string;
  value: string;
}

export function createSettingsRepository(executor: SqlExecutor): SettingsRepository {
  async function get<K extends SettingKey>(key: K): Promise<SettingValues[K]> {
    assertKnownSettingKey(key);
    const rows = await executor.select<SettingRow>(
      "SELECT key, value FROM app_setting WHERE key = ?",
      [key],
    );
    const defaultValue = SETTINGS_REGISTRY[key].default as SettingValues[K];
    const row = rows[0];
    if (!row) {
      return defaultValue;
    }
    const parsed = parseStoredValue(key, row.value);
    return parsed.ok ? parsed.value : defaultValue;
  }

  async function set<K extends SettingKey>(key: K, value: SettingValues[K]): Promise<void> {
    assertKnownSettingKey(key);
    if (!SETTINGS_REGISTRY[key].validate(value)) {
      throw new SettingValidationError([
        { field: key, message: `Invalid value for setting "${key}".` },
      ]);
    }
    await executor.batch([
      {
        sql: `INSERT INTO app_setting (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        params: [key, JSON.stringify(value)],
      },
    ]);
  }

  async function setMany(entries: Partial<SettingValues>): Promise<void> {
    const pairs = Object.entries(entries).filter(([, value]) => value !== undefined);
    if (pairs.length === 0) {
      return;
    }

    const issues: FieldValidationIssue[] = [];
    const statements: SqlStatement[] = [];

    for (const [key, value] of pairs) {
      assertKnownSettingKey(key);
      if (!SETTINGS_REGISTRY[key].validate(value)) {
        issues.push({ field: key, message: `Invalid value for setting "${key}".` });
      } else {
        statements.push({
          sql: `INSERT INTO app_setting (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          params: [key, JSON.stringify(value)],
        });
      }
    }

    if (issues.length > 0) {
      throw new SettingValidationError(issues);
    }

    await executor.batch(statements);
  }

  async function reset(key: SettingKey): Promise<void> {
    assertKnownSettingKey(key);
    await executor.batch([
      {
        sql: "DELETE FROM app_setting WHERE key = ?",
        params: [key],
      },
    ]);
  }

  async function getAll(): Promise<SettingsGetAllResult> {
    const rows = await executor.select<SettingRow>("SELECT key, value FROM app_setting");
    const byKey = new Map<string, string>();
    for (const row of rows) {
      byKey.set(row.key, row.value);
    }

    const values: Record<string, unknown> = {};
    const invalid: SettingKey[] = [];

    for (const key of SETTING_KEYS) {
      const raw = byKey.get(key);
      if (raw === undefined) {
        values[key] = SETTINGS_REGISTRY[key].default;
        continue;
      }
      const parsed = parseStoredValue(key, raw);
      if (parsed.ok) {
        values[key] = parsed.value;
      } else {
        values[key] = SETTINGS_REGISTRY[key].default;
        invalid.push(key);
      }
    }

    return {
      values: values as SettingValues,
      invalid,
    };
  }

  return {
    get,
    set,
    setMany,
    reset,
    getAll,
  };
}
