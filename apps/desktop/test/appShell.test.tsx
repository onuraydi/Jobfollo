// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createItemRepository,
  createReminderLogRepository,
  createWorkflowRepository,
  type SettingsRepository,
  type SettingKey,
  type SettingValues,
} from "@jobfollo/data";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider, type AppServices } from "../src/boot/index.js";
import { AppShell, DataRevisionProvider, PreferencesProvider, usePreferences } from "../src/shell/index.js";
import { localToday } from "../src/time/index.js";

function createInMemorySettings(): SettingsRepository {
  const store = new Map<SettingKey, unknown>();
  const defaults: SettingValues = {
    language: "system",
    theme: "system",
    "reminders.enabled": false,
    "reminders.sendTime": "09:00",
    "reminders.recipient": null,
    "reminders.upcomingDays": 0,
    "smtp.host": null,
    "smtp.port": 587,
    "smtp.security": "starttls",
    "smtp.username": null,
  };

  return {
    async get<K extends SettingKey>(key: K): Promise<SettingValues[K]> {
      return (store.has(key) ? store.get(key) : defaults[key]) as SettingValues[K];
    },
    async set<K extends SettingKey>(key: K, value: SettingValues[K]): Promise<void> {
      store.set(key, value);
    },
    async setMany(entries: Partial<SettingValues>): Promise<void> {
      for (const [k, v] of Object.entries(entries)) {
        if (v !== undefined) store.set(k as SettingKey, v);
      }
    },
    async reset(key: SettingKey): Promise<void> {
      store.delete(key);
    },
    async getAll() {
      const values = { ...defaults };
      for (const [k, v] of store.entries()) {
        (values as Record<string, unknown>)[k] = v;
      }
      return { values, invalid: [] };
    },
  };
}

function createFakeServices(settings: SettingsRepository): AppServices {
  const noopExecutor = {
    select: async () => [],
    batch: async () => [],
  };
  const clock = { nowIso: () => "2026-03-10T09:00:00.000Z" };
  const idGenerator = { newId: () => "id-1" };
  const workflows = createWorkflowRepository(noopExecutor, { clock, idGenerator });
  return {
    workflows,
    items: createItemRepository(noopExecutor, workflows, { clock, idGenerator }),
    settings,
    reminderLog: createReminderLogRepository(noopExecutor, { clock, idGenerator }),
    clock,
    idGenerator,
    localToday,
    dataLocation: "/tmp/jobfollo",
  };
}

function PreferenceControls() {
  const { setLanguage, setTheme, resolvedLocale, resolvedTheme } = usePreferences();
  return (
    <div>
      <span data-testid="resolved-locale">{resolvedLocale}</span>
      <span data-testid="resolved-theme">{resolvedTheme}</span>
      <button type="button" onClick={() => void setLanguage("tr")}>
        Set TR
      </button>
      <button type="button" onClick={() => void setTheme("dark")}>
        Set Dark
      </button>
      <button type="button" onClick={() => void setTheme("light")}>
        Set Light
      </button>
    </div>
  );
}

describe("AppShell & PreferencesProvider", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("navigates between Today, Items, and Settings via accessible sidebar links", async () => {
    const user = userEvent.setup();
    const settings = createInMemorySettings();
    await settings.set("language", "en");
    const services = createFakeServices(settings);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <ServicesProvider services={services}>
          <DataRevisionProvider>
            <PreferencesProvider>
              <AppShell />
            </PreferencesProvider>
          </DataRevisionProvider>
        </ServicesProvider>
      </MemoryRouter>,
    );

    const todayLink = await screen.findByRole("link", { name: "Today" });
    expect(todayLink.getAttribute("aria-current")).toBe("page");

    await user.click(screen.getByRole("link", { name: "Job postings" }));
    expect(
      screen.getByRole("link", { name: "Job postings" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Job posting applications",
    );

    await user.click(screen.getByRole("link", { name: "General applications" }));
    expect(
      screen.getByRole("link", { name: "General applications" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("General applications");

    await user.click(screen.getByRole("link", { name: "Items" }));
    expect(screen.getByRole("link", { name: "Items" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("All items");

    await user.click(screen.getByRole("link", { name: "Settings" }));
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Settings");
  });

  it("switches language and theme and persists them via SettingsRepository", async () => {
    const user = userEvent.setup();
    const settings = createInMemorySettings();
    await settings.set("language", "en");
    await settings.set("theme", "light");
    const services = createFakeServices(settings);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <ServicesProvider services={services}>
          <DataRevisionProvider>
            <PreferencesProvider>
              <PreferenceControls />
              <AppShell />
            </PreferencesProvider>
          </DataRevisionProvider>
        </ServicesProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("resolved-locale").textContent).toBe("en");
    });

    await user.click(screen.getByRole("button", { name: "Set TR" }));
    await waitFor(() => {
      expect(screen.getByTestId("resolved-locale").textContent).toBe("tr");
      expect(screen.getByRole("link", { name: "Bugün" })).toBeTruthy();
      expect(document.documentElement.lang).toBe("tr");
    });
    expect(await settings.get("language")).toBe("tr");

    await user.click(screen.getByRole("button", { name: "Set Dark" }));
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(screen.getByTestId("resolved-theme").textContent).toBe("dark");
    });
    expect(await settings.get("theme")).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Set Light" }));
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
    expect(await settings.get("theme")).toBe("light");
  });
});
