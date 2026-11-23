import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as dataApi from "../src/index.js";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(TEST_DIR, "..", "src");

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (entry.name.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("@jobfollo/data package boundaries", () => {
  it("never imports node:* or fs modules anywhere under packages/data/src", () => {
    const files = collectTsFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);

    const forbiddenImportRe = /(?:from|import)\s+["'](?:node:[^"']+|fs(?:\/[^"']+)?)["']/;

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content, `Forbidden Node/fs import found in ${file}`).not.toMatch(forbiddenImportRe);
    }
  });

  it("exports only the explicit public API allowlist from src/index.ts", () => {
    const expectedExports = [
      "AlreadySentError",
      "BuiltInWorkflowError",
      "ContactNotFoundError",
      "CorruptWorkflowError",
      "DatabaseNewerThanAppError",
      "InvalidMigrationSetError",
      "InvalidWorkflowError",
      "ItemNotFoundError",
      "ItemValidationError",
      "MigrationChecksumMismatchError",
      "MigrationError",
      "MigrationFailedError",
      "SETTINGS_REGISTRY",
      "SETTING_KEYS",
      "SettingValidationError",
      "StepNotInWorkflowError",
      "UnknownSettingError",
      "WorkflowInUseError",
      "WorkflowNotFoundError",
      "builtInMigrations",
      "computeChecksum",
      "createItemRepository",
      "createReminderLogRepository",
      "createSettingsRepository",
      "createWorkflowRepository",
      "randomIdGenerator",
      "runMigrations",
      "splitStatements",
      "systemClock",
    ].sort();

    expect(Object.keys(dataApi).sort()).toEqual(expectedExports);
  });
});
