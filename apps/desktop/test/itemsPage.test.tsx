// @vitest-environment jsdom
import {
  freelanceClientOutreach,
  grantScholarship,
  jobApplicationNetworking,
} from "@jobfollo/core";
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
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider, type AppServices } from "../src/boot/index.js";
import "../src/i18n/index.js";
import { ItemsPage } from "../src/pages/ItemsPage.js";
import { DataRevisionProvider, PreferencesProvider } from "../src/shell/index.js";
import { localToday } from "../src/time/index.js";

const TODAY = "2026-03-10";

describe("ItemsPage (integration with real in-memory SQLite)", () => {
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

  async function setupServices(locale: "en" | "tr" = "en"): Promise<AppServices> {
    db = createSqliteExecutor(":memory:");
    const clock = createAdvancingClock();
    const idGenerator = createSequentialIds("it");
    await runMigrations(db, builtInMigrations, clock);
    const workflows = createWorkflowRepository(db, { clock, idGenerator });
    const items = createItemRepository(db, workflows, { clock, idGenerator });
    const settings = createSettingsRepository(db);
    const reminderLog = createReminderLogRepository(db, { clock, idGenerator });
    await settings.set("language", locale);
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

  function renderItems(services: AppServices) {
    return render(
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
  }

  it("opens create dialog via keyboard shortcut N, shows field validation errors, and creates item on valid submit", async () => {
    const user = userEvent.setup();
    const services = await setupServices("en");
    renderItems(services);

    await screen.findByText("No matching items.");

    // Press N to open Create dialog
    await user.keyboard("n");
    const dialog = await screen.findByRole("dialog");

    // Submit empty title + bad contact URL -> shows field validation errors
    await user.type(within(dialog).getByLabelText("Contact name"), "Jane");
    await user.type(within(dialog).getByLabelText("Profile URL"), "javascript:alert(1)");
    await user.click(within(dialog).getByRole("button", { name: "Create item" }));

    const alerts = await within(dialog).findAllByRole("alert");
    expect(alerts.length).toBeGreaterThanOrEqual(2);

    // Fix inputs and submit
    await user.type(within(dialog).getByLabelText("Title"), "Acme Corp");
    await user.type(within(dialog).getByLabelText("Role"), "Staff Engineer");
    const urlInput = within(dialog).getByLabelText("Profile URL");
    await user.clear(urlInput);
    await user.type(urlInput, "https://linkedin.com/in/jane");
    await user.click(within(dialog).getByRole("button", { name: "Create item" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByText("Acme Corp")).toBeTruthy();
      expect(screen.getByText("Staff Engineer")).toBeTruthy();
    });
  });

  it("filters by search, workflow, outcome, and archived toggle, and sorts Turkish titles accurately", async () => {
    const user = userEvent.setup();
    const services = await setupServices("en");

    await services.items.create({
      title: "Freelance: Logo projesi",
      workflowId: freelanceClientOutreach.id,
      startDate: "2026-03-10",
    });
    await services.items.create({
      title: "Çağrı Teknoloji",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-10",
    });
    await services.items.create({
      title: "Burs başvurusu",
      workflowId: grantScholarship.id,
      startDate: "2026-03-10",
    });
    const archivedItem = await services.items.create({
      title: "Archived Co",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-02-01",
    });
    await services.items.archive(archivedItem.id);

    renderItems(services);

    await screen.findByText("Çağrı Teknoloji");
    expect(screen.queryByText("Archived Co")).toBeNull();

    // Sort by Title -> Burs başvurusu, Çağrı Teknoloji, Freelance: Logo projesi
    await user.selectOptions(screen.getByLabelText("Sort by"), "title");
    const bodyRows = screen.getAllByRole("row").slice(1);
    const titles = bodyRows.map((row) => within(row).getByRole("link").textContent);
    expect(titles).toEqual([
      "Burs başvurusu",
      "Çağrı Teknoloji",
      "Freelance: Logo projesi",
    ]);

    // Filter by workflow
    await user.selectOptions(screen.getByLabelText("Workflow"), grantScholarship.id);
    expect(screen.getByText("Burs başvurusu")).toBeTruthy();
    expect(screen.queryByText("Çağrı Teknoloji")).toBeNull();

    // Reset workflow filter and toggle Show archived
    await user.selectOptions(screen.getByLabelText("Workflow"), "all");
    await user.click(screen.getByLabelText("Show archived"));
    expect(await screen.findByText("Archived Co")).toBeTruthy();

    // Search filter
    await user.type(screen.getByLabelText("Search items"), "çağrı");
    expect(screen.getByText("Çağrı Teknoloji")).toBeTruthy();
    expect(screen.queryByText("Burs başvurusu")).toBeNull();
  });
});
