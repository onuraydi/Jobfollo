import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BootErrorScreen,
  resolveBootLocale,
  type BootError,
  type BootErrorKind,
} from "../src/boot/index.js";

const ALL_ERROR_KINDS: BootErrorKind[] = [
  "unsupported_environment",
  "open_failed",
  "database_busy",
  "database_io",
  "database_newer",
  "migration_checksum",
  "migration_invalid",
  "migration_failed",
  "unknown",
];

const RETRYABLE_KINDS = new Set<BootErrorKind>(["open_failed", "database_busy", "database_io"]);

function makeBootError(kind: BootErrorKind): BootError {
  switch (kind) {
    case "database_newer":
      return { kind, dbVersion: 3, appVersion: 1, technicalDetails: "dbVersion 3 newer than appVersion 1" };
    case "migration_checksum":
      return {
        kind,
        version: 1,
        migrationName: "0001_init",
        technicalDetails: "checksum mismatch",
      };
    default:
      return { kind, technicalDetails: `details for ${kind}` };
  }
}

describe("resolveBootLocale", () => {
  it("maps tr* locales to tr and everything else to en", () => {
    expect(resolveBootLocale("tr")).toBe("tr");
    expect(resolveBootLocale("tr-TR")).toBe("tr");
    expect(resolveBootLocale("TR-cy")).toBe("tr");
    expect(resolveBootLocale("en")).toBe("en");
    expect(resolveBootLocale("en-US")).toBe("en");
    expect(resolveBootLocale("de-DE")).toBe("en");
    expect(resolveBootLocale(undefined)).toBe("en");
  });
});

describe("BootErrorScreen", () => {
  it.each(["en", "tr"] as const)(
    "renders every BootError kind in %s with appropriate action, data path, details, and never offers reset/delete",
    (locale) => {
      for (const kind of ALL_ERROR_KINDS) {
        const html = renderToStaticMarkup(
          React.createElement(BootErrorScreen, {
            error: makeBootError(kind),
            dataLocation: "C:\\Users\\demo\\AppData\\Roaming\\io.github.onuraydi.jobfollo",
            locale,
            onRetry: () => {},
          }),
        );

        // Data location shown
        expect(html).toContain("io.github.onuraydi.jobfollo");
        // Collapsible technical details present
        expect(html).toContain("<details");
        expect(html).toContain(makeBootError(kind).technicalDetails);

        // Retry button shown ONLY for retryable kinds
        const retryLabel = locale === "tr" ? "Tekrar dene" : "Try again";
        if (RETRYABLE_KINDS.has(kind)) {
          expect(html).toContain(retryLabel);
        } else {
          expect(html).not.toContain(retryLabel);
        }

        // Never offers destructive delete / reset / recreate actions
        expect(html.toLowerCase()).not.toMatch(/delete database|reset database|recreate database|veritabanını sil|veritabanını sıfırla/);
      }
    },
  );
});
