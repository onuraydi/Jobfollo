import type { SmtpSecuritySetting } from "@jobfollo/data";

export type MailErrorKind =
  | "invalid_argument"
  | "keychain"
  | "missing_password"
  | "smtp"
  | "ipc";

export class MailClientError extends Error {
  readonly kind: MailErrorKind;

  constructor(kind: MailErrorKind, message: string) {
    super(message);
    this.name = "MailClientError";
    this.kind = kind;
  }
}

export interface SendEmailPayload {
  host: string;
  port: number;
  security: SmtpSecuritySetting;
  username: string;
  recipient: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailClient {
  setPassword(password: string): Promise<void>;
  hasPassword(): Promise<boolean>;
  deletePassword(): Promise<void>;
  sendEmail(payload: SendEmailPayload): Promise<void>;
}

export function createUnavailableMailClient(): MailClient {
  return {
    async setPassword() {
      throw new MailClientError("keychain", "Keychain is unavailable in this environment.");
    },
    async hasPassword() {
      return false;
    },
    async deletePassword() {
      // No-op when keychain is unavailable
    },
    async sendEmail() {
      throw new MailClientError("smtp", "SMTP transport is unavailable in this environment.");
    },
  };
}
