import { invoke } from "@tauri-apps/api/core";
import {
  MailClientError,
  type MailClient,
  type MailErrorKind,
  type SendEmailPayload,
} from "./types.js";

const VALID_KINDS: readonly MailErrorKind[] = [
  "invalid_argument",
  "keychain",
  "missing_password",
  "smtp",
  "ipc",
];

function toMailClientError(err: unknown): MailClientError {
  if (err instanceof MailClientError) return err;
  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>;
    const kind = record.kind;
    const message = record.message;
    if (
      typeof kind === "string" &&
      (VALID_KINDS as readonly string[]).includes(kind) &&
      typeof message === "string"
    ) {
      return new MailClientError(kind as MailErrorKind, message);
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  return new MailClientError("ipc", msg);
}

export const defaultMailClient: MailClient = {
  async setPassword(password: string): Promise<void> {
    try {
      await invoke("smtp_set_password", { password });
    } catch (err) {
      throw toMailClientError(err);
    }
  },

  async hasPassword(): Promise<boolean> {
    try {
      return await invoke<boolean>("smtp_has_password");
    } catch (err) {
      throw toMailClientError(err);
    }
  },

  async deletePassword(): Promise<void> {
    try {
      await invoke("smtp_delete_password");
    } catch (err) {
      throw toMailClientError(err);
    }
  },

  async sendEmail(request: SendEmailPayload): Promise<void> {
    try {
      await invoke("send_email", { request });
    } catch (err) {
      throw toMailClientError(err);
    }
  },
};
