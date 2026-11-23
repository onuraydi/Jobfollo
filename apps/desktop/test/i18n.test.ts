import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import en from "../src/i18n/locales/en.json";
import tr from "../src/i18n/locales/tr.json";
import { resolveUiLocale } from "../src/i18n/index.js";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(TEST_DIR, "..", "src");

function flattenKeys(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenKeys(value as Record<string, unknown>, fullKey));
    } else if (typeof value === "string") {
      result[fullKey] = value;
    } else {
      throw new Error(`Unexpected non-string i18n value at "${fullKey}"`);
    }
  }
  return result;
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

describe("i18n resources and locale resolution", () => {
  it("has identical key sets in en.json and tr.json with no empty values", () => {
    const enFlat = flattenKeys(en);
    const trFlat = flattenKeys(tr);

    expect(Object.keys(enFlat).sort()).toEqual(Object.keys(trFlat).sort());
    expect(Object.keys(enFlat).length).toBeGreaterThan(0);

    for (const [key, value] of Object.entries(enFlat)) {
      expect(value.trim().length, `Empty en value for "${key}"`).toBeGreaterThan(0);
    }
    for (const [key, value] of Object.entries(trFlat)) {
      expect(value.trim().length, `Empty tr value for "${key}"`).toBeGreaterThan(0);
    }
  });

  it("defines every static t('...') key used anywhere in apps/desktop/src/", () => {
    const enFlat = flattenKeys(en);
    const trFlat = flattenKeys(tr);
    const files = collectSourceFiles(SRC_DIR);
    const keyUsageRe = /\bt\(\s*["']([a-zA-Z0-9_.-]+)["']/g;

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(keyUsageRe)) {
        const usedKey = match[1]!;
        const existsEn =
          usedKey in enFlat || (`${usedKey}_one` in enFlat && `${usedKey}_other` in enFlat);
        const existsTr =
          usedKey in trFlat || (`${usedKey}_one` in trFlat && `${usedKey}_other` in trFlat);
        expect(existsEn, `Missing EN i18n key "${usedKey}" used in ${file}`).toBe(true);
        expect(existsTr, `Missing TR i18n key "${usedKey}" used in ${file}`).toBe(true);
      }
    }
  });

  it("resolves UI locale from setting and navigator.language", () => {
    expect(resolveUiLocale("tr", "en-US")).toBe("tr");
    expect(resolveUiLocale("en", "tr-TR")).toBe("en");
    expect(resolveUiLocale("system", "tr-TR")).toBe("tr");
    expect(resolveUiLocale("system", "tr")).toBe("tr");
    expect(resolveUiLocale("system", "en-US")).toBe("en");
    expect(resolveUiLocale("system", "de-DE")).toBe("en");
    expect(resolveUiLocale("system", undefined)).toBe("en");
  });
});
