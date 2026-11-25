import type { Item } from "./types.js";

export interface MessageTemplateVars {
  company: string;
  title: string;
  role: string;
  contact: string;
}

export function buildTemplateVars(item: Pick<Item, "title" | "company" | "role" | "contacts">): MessageTemplateVars {
  const company = item.company?.trim() || item.title.trim();
  const title = item.title.trim();
  const role = item.role?.trim() || "";
  const contact = item.contacts[0]?.name.trim() || "";
  return { company, title, role, contact };
}

/**
 * Pure placeholder substitution for copy-ready outreach messages.
 * Replaces `{{company}}`, `{{title}}`, `{{role}}`, and `{{contact}}`.
 */
export function renderMessageTemplate(
  template: string,
  vars: Partial<MessageTemplateVars>,
): string {
  const replacements: Record<string, string> = {
    company: vars.company ?? vars.title ?? "",
    title: vars.title ?? vars.company ?? "",
    role: vars.role ?? "",
    contact: vars.contact ?? "",
  };

  return template.replace(/\{\{\s*(company|title|role|contact)\s*\}\}/g, (_match, key: string) => {
    return replacements[key] ?? "";
  });
}
