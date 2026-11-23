import { isValidISODate, type ContactStatus, type ISODate } from "@jobfollo/core";
import type { CreateItemInput, StoredItem } from "@jobfollo/data";
import { isSafeHttpUrl } from "../lib/externalUrl.js";

const UTF8_BOM = "\uFEFF";

export const CSV_HEADERS = [
  "title",
  "role",
  "channel",
  "workflowId",
  "startDate",
  "outcome",
  "notes",
  "contactName",
  "contactProfileUrl",
  "contactStatus",
  "archived",
] as const;

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

function sanitizeForSpreadsheet(value: string): string {
  if (FORMULA_PREFIX_RE.test(value)) {
    return `'${value}`;
  }
  return value;
}

function escapeCsvCell(value: string): string {
  const safe = sanitizeForSpreadsheet(value);
  if (/[",\r\n;]/.test(safe)) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}

/**
 * Exports items to an Excel-compatible UTF-8 BOM CSV string.
 * Never exports secrets or settings.
 */
export function exportItemsToCsv(items: readonly StoredItem[]): string {
  const lines: string[] = [CSV_HEADERS.join(",")];

  for (const item of items) {
    const firstContact = item.contacts[0];
    const cells = [
      item.title,
      item.role ?? "",
      item.channel ?? "",
      item.workflowId,
      item.startDate,
      item.outcome ?? "",
      item.notes ?? "",
      firstContact?.name ?? "",
      firstContact?.profileUrl ?? "",
      firstContact?.status ?? "",
      item.archivedAt ? "true" : "false",
    ];
    lines.push(cells.map(escapeCsvCell).join(","));
  }

  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}

export interface ParsedCsvRow {
  rowNumber: number;
  input: CreateItemInput;
  outcome?: string;
  archived: boolean;
}

export interface CsvRowError {
  rowNumber: number;
  message: string;
}

export interface ParseCsvOptions {
  defaultWorkflowId: string;
  defaultStartDate: ISODate;
  validWorkflowIds: ReadonlySet<string>;
}

export interface ParseCsvResult {
  rows: ParsedCsvRow[];
  errors: CsvRowError[];
}

function detectDelimiter(headerLine: string): "," | ";" {
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === ",") commas++;
      else if (ch === ";") semis++;
    }
  }
  return semis > commas ? ";" : ",";
}

/** RFC 4180 CSV parser supporting `,` or `;`, quoted fields, escaped quotes, and multiline values. */
function parseCsvMatrix(raw: string): string[][] {
  const text = raw.startsWith(UTF8_BOM) ? raw.slice(1) : raw;
  const firstNewline = text.search(/\r?\n/);
  const firstLine = firstNewline === -1 ? text : text.slice(0, firstNewline);
  const delimiter = detectDelimiter(firstLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
    } else {
      field += ch;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

type CanonicalColumn = (typeof CSV_HEADERS)[number];

const HEADER_ALIASES: Record<string, CanonicalColumn> = {
  title: "title",
  name: "title",
  company: "title",
  "başlık": "title",
  baslik: "title",
  "şirket": "title",
  sirket: "title",
  role: "role",
  position: "role",
  rol: "role",
  pozisyon: "role",
  channel: "channel",
  source: "channel",
  kanal: "channel",
  workflowid: "workflowId",
  workflow: "workflowId",
  "iş akışı": "workflowId",
  "is akisi": "workflowId",
  startdate: "startDate",
  start_date: "startDate",
  date: "startDate",
  "başlangıç tarihi": "startDate",
  "baslangic tarihi": "startDate",
  tarih: "startDate",
  outcome: "outcome",
  status: "outcome",
  "sonuç": "outcome",
  sonuc: "outcome",
  notes: "notes",
  note: "notes",
  notlar: "notes",
  not: "notes",
  contactname: "contactName",
  contact_name: "contactName",
  contact: "contactName",
  "kişi": "contactName",
  kisi: "contactName",
  contactprofileurl: "contactProfileUrl",
  contact_profile_url: "contactProfileUrl",
  profileurl: "contactProfileUrl",
  url: "contactProfileUrl",
  profil: "contactProfileUrl",
  contactstatus: "contactStatus",
  contact_status: "contactStatus",
  "bağlantı durumu": "contactStatus",
  archived: "archived",
  "arşivli": "archived",
  arsivli: "archived",
};

const VALID_CONTACT_STATUSES = new Set<ContactStatus>([
  "pending",
  "accepted",
  "not_accepted",
]);

function normalizeHeader(raw: string): CanonicalColumn | null {
  const key = raw.trim().toLocaleLowerCase("tr");
  return HEADER_ALIASES[key] ?? null;
}

export function parseItemsFromCsv(
  csvText: string,
  options: ParseCsvOptions,
): ParseCsvResult {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length < 2) {
    return { rows: [], errors: [] };
  }

  const headerRow = matrix[0]!;
  const columnMap = new Map<CanonicalColumn, number>();
  headerRow.forEach((raw, idx) => {
    const col = normalizeHeader(raw);
    if (col && !columnMap.has(col)) {
      columnMap.set(col, idx);
    }
  });

  if (!columnMap.has("title")) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, message: "Missing required column: title" }],
    };
  }

  const rows: ParsedCsvRow[] = [];
  const errors: CsvRowError[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r]!;
    const rowNumber = r + 1;
    const get = (col: CanonicalColumn): string => {
      const idx = columnMap.get(col);
      return idx === undefined ? "" : (cells[idx] ?? "").trim();
    };

    const title = get("title");
    if (!title) {
      errors.push({ rowNumber, message: "Title is required" });
      continue;
    }

    const rawStartDate = get("startDate");
    const startDate = rawStartDate || options.defaultStartDate;
    if (!isValidISODate(startDate)) {
      errors.push({ rowNumber, message: `Invalid start date: ${rawStartDate}` });
      continue;
    }

    const rawWorkflowId = get("workflowId");
    const workflowId =
      rawWorkflowId && options.validWorkflowIds.has(rawWorkflowId)
        ? rawWorkflowId
        : options.defaultWorkflowId;

    const role = get("role") || undefined;
    const channel = get("channel") || undefined;
    const notes = get("notes") || undefined;
    const outcome = get("outcome") || undefined;
    const archivedRaw = get("archived").toLowerCase();
    const archived = archivedRaw === "true" || archivedRaw === "1" || archivedRaw === "yes" || archivedRaw === "evet";

    const contactName = get("contactName");
    const contactUrl = get("contactProfileUrl");
    const rawContactStatus = get("contactStatus") as ContactStatus;
    const contactStatus: ContactStatus = VALID_CONTACT_STATUSES.has(rawContactStatus)
      ? rawContactStatus
      : "pending";

    if (contactUrl && !isSafeHttpUrl(contactUrl)) {
      errors.push({ rowNumber, message: `Unsupported contact URL: ${contactUrl}` });
      continue;
    }

    const input: CreateItemInput = {
      title,
      role,
      channel,
      workflowId,
      startDate,
      notes,
      contacts: contactName
        ? [{ name: contactName, profileUrl: contactUrl || undefined, status: contactStatus }]
        : undefined,
    };

    rows.push({ rowNumber, input, outcome, archived });
  }

  return { rows, errors };
}
