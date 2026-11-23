// @vitest-environment jsdom
import {
  builtInMigrations,
  createItemRepository,
  createReminderLogRepository,
  createSettingsRepository,
  createWorkflowRepository,
  runMigrations,
} from "@jobfollo/data";
import {
  createAdvancingClock,
  createSequentialIds,
  createSqliteExecutor,
  type TestSqliteExecutor,
} from "@jobfollo/data/testing";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider, type AppServices } from "../src/boot/index.js";
import "../src/i18n/index.js";
import { SettingsPage } from "../src/pages/SettingsPage.js";
import { PreferencesProvider } from "../src/shell/index.js";
import { localToday } from "../src/time/index.js";

describe("SettingsPage (integration with real in-memory SQLite)", () => {
  let db: TestSqliteExecutor | undefined;

  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    document.documentElement.classList.remove("dark");
    document.documentElement.lang = "en";
  });

  afterEach(() => {
    cleanup();
    db?.close();
    db = undefined;
  });

  async function setupServices(): Promise<AppServices> {
    db = createSqliteExecutor(":memory:");
    const clock = createAdvancingClock();
    const idGenerator = createSequentialIds("st");
    await runMigrations(db, builtInMigrations, clock);
    const workflows = createWorkflowRepository(db, { clock, idGenerator });
    const items = createItemRepository(db, workflows, { clock, idGenerator });
    const settings = createSettingsRepository(db);
    const reminderLog = createReminderLogRepository(db, { clock, idGenerator });
    await settings.set("language", "en");
    await settings.set("theme", "light");
    return {
      workflows,
      items,
      settings,
      reminderLog,
      clock,
      idGenerator,
      localToday,
      dataLocation: "/home/user/.local/share/io.github.onuraydi.jobfollo/jobfollo.db",
    };
  }

  it("persists language and theme changes to SQLite, updates DOM immediately, and displays read-only data location", async () => {
    const user = userEvent.setup();
    const services = await setupServices();

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <ServicesProvider services={services}>
          <PreferencesProvider>
            <SettingsPage />
          </PreferencesProvider>
        </ServicesProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    });

    // Read-only data location
    const locationInput = screen.getByLabelText("Database location") as HTMLInputElement;
    expect(locationInput.readOnly).toBe(true);
    expect(locationInput.value).toBe(
      "/home/user/.local/share/io.github.onuraydi.jobfollo/jobfollo.db",
    );

    // Switch theme to dark
    const themeSelect = screen.getByLabelText("Theme");
    await user.selectOptions(themeSelect, "dark");

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
    expect(await services.settings.get("theme")).toBe("dark");

    // Switch language to Turkish
    const languageSelect = screen.getByLabelText("Language");
    await user.selectOptions(languageSelect, "tr");

    await waitFor(() => {
      expect(document.documentElement.lang).toBe("tr");
      expect(screen.getByRole("heading", { name: "Ayarlar" })).toBeTruthy();
    });
    expect(await services.settings.get("language")).toBe("tr");
  });
});
