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
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider, type AppServices } from "../src/boot/index.js";
import "../src/i18n/index.js";
import { ItemsPage } from "../src/pages/ItemsPage.js";
import { DataRevisionProvider, PreferencesProvider } from "../src/shell/index.js";
import { localToday } from "../src/time/index.js";

const TODAY = "2026-03-10";

describe("KanbanBoard in ItemsPage (integration with real in-memory SQLite)", () => {
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
    const idGenerator = createSequentialIds("kb");
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

  it("groups items by outcome across 5 columns and moves cards via the keyboard-accessible outcome menu", async () => {
    const user = userEvent.setup();
    const services = await setupServices();

    const alpha = await services.items.create({
      title: "Alpha Corp",
      role: "Backend Engineer",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-10",
    });
    const beta = await services.items.create({
      title: "Beta Inc",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-10",
    });
    await services.items.setOutcome(beta.id, "interview");

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
      expect(screen.getByText("Alpha Corp")).toBeTruthy();
    });

    // Switch from Table to Board view
    await user.click(screen.getByRole("button", { name: "Board" }));

    const inProgressCol = await screen.findByTestId("kanban-col-in_progress");
    const interviewCol = screen.getByTestId("kanban-col-interview");
    const offerCol = screen.getByTestId("kanban-col-offer");

    expect(within(inProgressCol).getByText("Alpha Corp")).toBeTruthy();
    expect(within(interviewCol).getByText("Beta Inc")).toBeTruthy();
    expect(within(offerCol).getByText("No items")).toBeTruthy();

    // Move Alpha Corp from in_progress -> offer using the accessible menu on the card
    const alphaMenu = within(inProgressCol).getByLabelText("Move Alpha Corp to outcome");
    await user.selectOptions(alphaMenu, "offer");

    await waitFor(() => {
      expect(within(screen.getByTestId("kanban-col-offer")).getByText("Alpha Corp")).toBeTruthy();
    });
    expect((await services.items.get(alpha.id))?.outcome).toBe("offer");

    // Move Beta Inc back to in_progress -> clears outcome to undefined/null
    const betaMenu = within(screen.getByTestId("kanban-col-interview")).getByLabelText(
      "Move Beta Inc to outcome",
    );
    await user.selectOptions(betaMenu, "in_progress");

    await waitFor(() => {
      expect(
        within(screen.getByTestId("kanban-col-in_progress")).getByText("Beta Inc"),
      ).toBeTruthy();
    });
    expect((await services.items.get(beta.id))?.outcome).toBeUndefined();
  });
});
