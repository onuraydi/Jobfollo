// @vitest-environment jsdom
import { jobApplicationNetworking } from "@jobfollo/core";
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
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider, type AppServices } from "../src/boot/index.js";
import "../src/i18n/index.js";
import { ItemDetailPage } from "../src/pages/ItemDetailPage.js";
import { ItemsPage } from "../src/pages/ItemsPage.js";
import { AppShell, DataRevisionProvider, PreferencesProvider } from "../src/shell/index.js";
import { localToday } from "../src/time/index.js";

const TODAY = "2026-03-10";

describe("Productivity tools (Command Palette, Snooze, Bulk Actions)", () => {
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
  });

  afterEach(() => {
    cleanup();
    db?.close();
    db = undefined;
  });

  async function setupServices(): Promise<AppServices> {
    db = createSqliteExecutor(":memory:");
    const clock = createAdvancingClock();
    const idGenerator = createSequentialIds("pt");
    await runMigrations(db, builtInMigrations, clock);
    const workflows = createWorkflowRepository(db, { clock, idGenerator });
    const items = createItemRepository(db, workflows, { clock, idGenerator });
    const settings = createSettingsRepository(db);
    const reminderLog = createReminderLogRepository(db, { clock, idGenerator });
    await settings.set("language", "en");
    return {
      workflows,
      items,
      settings,
      reminderLog,
      clock,
      idGenerator,
      localToday,
      dataLocation: ":memory:",
    };
  }

  it("opens Command Palette with Ctrl+K, filters by company name, and navigates to item detail", async () => {
    const user = userEvent.setup();
    const services = await setupServices();

    const item = await services.items.create({
      title: "Platform Engineer",
      company: "Orion Cloud",
      workflowId: jobApplicationNetworking.id,
      startDate: TODAY,
    });

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

    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog");
    const searchInput = within(dialog).getByPlaceholderText(/search items, pages/i);
    await user.type(searchInput, "Orion");

    const itemButton = await within(dialog).findByRole("button", {
      name: /Platform Engineer/i,
    });
    await user.click(itemButton);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Platform Engineer" })).toBeTruthy();
      expect(screen.getByText("Orion Cloud")).toBeTruthy();
    });
    expect(item.id).toBeTruthy();
  });

  it("snoozes a step to tomorrow in ItemDetailPage and persists snoozedUntil in SQLite", async () => {
    const user = userEvent.setup();
    const services = await setupServices();

    const item = await services.items.create({
      title: "Snooze Test Role",
      workflowId: jobApplicationNetworking.id,
      startDate: TODAY,
    });

    render(
      <MemoryRouter initialEntries={[`/items/${item.id}`]}>
        <ServicesProvider services={services}>
          <DataRevisionProvider>
            <PreferencesProvider>
              <Routes>
                <Route
                  path="/items/:id"
                  element={<ItemDetailPage todayOverride={TODAY} />}
                />
              </Routes>
            </PreferencesProvider>
          </DataRevisionProvider>
        </ServicesProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Snooze Test Role" })).toBeTruthy();
    });

    const applyRow = screen.getByTestId("timeline-step-apply");
    const snoozeSelect = within(applyRow).getByLabelText(/Snooze —/i);
    await user.selectOptions(snoozeSelect, "tomorrow");

    await waitFor(async () => {
      const fresh = await services.items.get(item.id);
      expect(fresh?.steps).toContainEqual({
        stepKey: "apply",
        snoozedUntil: "2026-03-11",
      });
    });
  });

  it("supports bulk outcome assignment and bulk archiving in ItemsPage", async () => {
    const user = userEvent.setup();
    const services = await setupServices();

    const a = await services.items.create({
      title: "Alpha Role",
      workflowId: jobApplicationNetworking.id,
      startDate: TODAY,
    });
    const b = await services.items.create({
      title: "Beta Role",
      workflowId: jobApplicationNetworking.id,
      startDate: TODAY,
    });

    render(
      <MemoryRouter initialEntries={["/items"]}>
        <ServicesProvider services={services}>
          <DataRevisionProvider>
            <PreferencesProvider>
              <ItemsPage todayOverride={TODAY} />
            </PreferencesProvider>
          </DataRevisionProvider>
        </ServicesProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Alpha Role")).toBeTruthy();
      expect(screen.getByText("Beta Role")).toBeTruthy();
    });

    await user.click(screen.getByLabelText("Select all visible items"));
    expect(screen.getByText("2 selected")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Set outcome…"), "interview");

    await waitFor(async () => {
      expect((await services.items.get(a.id))?.outcome).toBe("interview");
      expect((await services.items.get(b.id))?.outcome).toBe("interview");
    });

    await user.click(screen.getByLabelText("Select all visible items"));
    await user.click(screen.getByRole("button", { name: "Archive selected" }));

    await waitFor(() => {
      expect(screen.getByText("No matching items.")).toBeTruthy();
    });
    expect((await services.items.get(a.id))?.archivedAt).toBeTruthy();
    expect((await services.items.get(b.id))?.archivedAt).toBeTruthy();
  });
});
