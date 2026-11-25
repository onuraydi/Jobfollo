import type { MessageTemplate, TemplateCategory, TemplateChannel } from "@jobfollo/core";
import { randomIdGenerator, systemClock } from "./defaults.js";
import type { Clock, IdGenerator, SqlExecutor } from "./types.js";

export interface StoredMessageTemplate extends MessageTemplate {
  builtIn: false;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  name: string;
  channel: TemplateChannel;
  category: TemplateCategory;
  subject?: string;
  body: string;
}

export interface UpdateTemplateInput {
  name?: string;
  channel?: TemplateChannel;
  category?: TemplateCategory;
  subject?: string | null;
  body?: string;
}

export interface TemplateRepository {
  listCustom(): Promise<StoredMessageTemplate[]>;
  getById(id: string): Promise<StoredMessageTemplate | null>;
  create(input: CreateTemplateInput): Promise<StoredMessageTemplate>;
  update(id: string, input: UpdateTemplateInput): Promise<StoredMessageTemplate | null>;
  delete(id: string): Promise<boolean>;
}

export interface TemplateRepositoryDeps {
  clock?: Clock;
  idGenerator?: IdGenerator;
}

const VALID_CHANNELS = new Set<string>(["email", "message"]);
const VALID_CATEGORIES = new Set<string>([
  "application",
  "general",
  "follow_up",
  "networking",
  "thank_you",
]);

interface TemplateRow {
  id: string;
  name: string;
  channel: string;
  category: string;
  subject: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: TemplateRow): StoredMessageTemplate {
  const channel: TemplateChannel = VALID_CHANNELS.has(row.channel)
    ? (row.channel as TemplateChannel)
    : "email";
  const category: TemplateCategory = VALID_CATEGORIES.has(row.category)
    ? (row.category as TemplateCategory)
    : "application";
  return {
    id: row.id,
    name: row.name,
    channel,
    category,
    ...(row.subject !== null && row.subject.length > 0 ? { subject: row.subject } : {}),
    body: row.body,
    builtIn: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createTemplateRepository(
  executor: SqlExecutor,
  deps: TemplateRepositoryDeps = {},
): TemplateRepository {
  const clock = deps.clock ?? systemClock;
  const idGenerator = deps.idGenerator ?? randomIdGenerator;

  return {
    async listCustom(): Promise<StoredMessageTemplate[]> {
      const rows = await executor.select<TemplateRow>(
        "SELECT id, name, channel, category, subject, body, created_at, updated_at FROM message_template ORDER BY updated_at DESC, name ASC",
      );
      return rows.map(mapRow);
    },

    async getById(id: string): Promise<StoredMessageTemplate | null> {
      const rows = await executor.select<TemplateRow>(
        "SELECT id, name, channel, category, subject, body, created_at, updated_at FROM message_template WHERE id = ?",
        [id],
      );
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async create(input: CreateTemplateInput): Promise<StoredMessageTemplate> {
      const name = input.name.trim();
      const body = input.body.trim();
      if (!name) throw new Error("Template name is required");
      if (!body) throw new Error("Template body is required");
      if (!VALID_CHANNELS.has(input.channel)) throw new Error("Invalid template channel");
      if (!VALID_CATEGORIES.has(input.category)) throw new Error("Invalid template category");

      const id = idGenerator.newId();
      const now = clock.nowIso();
      const subject =
        input.channel === "email" && input.subject && input.subject.trim().length > 0
          ? input.subject.trim()
          : null;

      await executor.batch([
        {
          sql: "INSERT INTO message_template (id, name, channel, category, subject, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          params: [id, name, input.channel, input.category, subject, body, now, now],
        },
      ]);

      return {
        id,
        name,
        channel: input.channel,
        category: input.category,
        ...(subject ? { subject } : {}),
        body,
        builtIn: false,
        createdAt: now,
        updatedAt: now,
      };
    },

    async update(id: string, input: UpdateTemplateInput): Promise<StoredMessageTemplate | null> {
      const existing = await this.getById(id);
      if (!existing) return null;

      const name = input.name !== undefined ? input.name.trim() : existing.name;
      const channel = input.channel ?? existing.channel;
      const category = input.category ?? existing.category;
      const body = input.body !== undefined ? input.body.trim() : existing.body;
      if (!name) throw new Error("Template name is required");
      if (!body) throw new Error("Template body is required");
      if (!VALID_CHANNELS.has(channel)) throw new Error("Invalid template channel");
      if (!VALID_CATEGORIES.has(category)) throw new Error("Invalid template category");

      const rawSubject =
        input.subject === null
          ? null
          : input.subject !== undefined
            ? input.subject.trim()
            : (existing.subject ?? null);
      const subject = channel === "email" && rawSubject && rawSubject.length > 0 ? rawSubject : null;
      const now = clock.nowIso();

      await executor.batch([
        {
          sql: "UPDATE message_template SET name = ?, channel = ?, category = ?, subject = ?, body = ?, updated_at = ? WHERE id = ?",
          params: [name, channel, category, subject, body, now, id],
        },
      ]);

      return {
        id,
        name,
        channel,
        category,
        ...(subject ? { subject } : {}),
        body,
        builtIn: false,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
    },

    async delete(id: string): Promise<boolean> {
      const [result] = await executor.batch([
        { sql: "DELETE FROM message_template WHERE id = ?", params: [id] },
      ]);
      return (result?.rowsAffected ?? 0) > 0;
    },
  };
}
