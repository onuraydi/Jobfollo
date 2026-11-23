import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(TEST_DIR, "..", "src");

function collectAppSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectAppSourceFiles(fullPath));
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("@jobfollo/desktop import boundaries", () => {
  it("forbids importing @jobfollo/data/testing from any non-test file in apps/desktop/src", () => {
    const files = collectAppSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content, `Forbidden @jobfollo/data/testing import in ${file}`).not.toMatch(
        /["']@jobfollo\/data\/testing["']/,
      );
    }
  });

  it("restricts @tauri-apps/api imports under src/db to src/db/default.ts only", () => {
    const dbDir = join(SRC_DIR, "db");
    const files = collectAppSourceFiles(dbDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const rel = relative(SRC_DIR, file).replaceAll("\\", "/");
      const content = readFileSync(file, "utf8");
      if (rel === "db/default.ts") {
        expect(content).toMatch(/["']@tauri-apps\/api\/core["']/);
      } else {
        expect(content, `Unexpected @tauri-apps/api import in ${rel}`).not.toMatch(
          /["']@tauri-apps\/api/,
        );
      }
    }
  });
});
