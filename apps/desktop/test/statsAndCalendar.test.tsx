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
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider, type AppServices } from "../src/boot/index.js";
import "../src/i18n/index.js";
import { CalendarPage } from "../src/pages/CalendarPage.js";
import { StatsPage } from "../src/pages/StatsPage.js";
import { DataRevisionProvider, PreferencesProvider } from "../src/shell/index.js";
import { localToday } from "../src/time/index.js";

const TODAY = "2026-03-10";

describe("StatsPage and CalendarPage (integration with real in-memory SQLite)", () => {
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
    const idGenerator = createSequentialIds("sc");
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

  it("renders local funnel stats and conversion rates in StatsPage", async () => {
    const services = await setupServices();

    const a = await services.items.create({
      title: "Role A",
      company: "Company A",
      channel: "LinkedIn",
      workMode: "remote",
      priority: "high",
      workflowId: jobApplicationNetworking.id,
      startDate: TODAY,
    });
    await services.items.setOutcome(a.id, "offer");

    await services.items.create({
      title: "Role B",
      company: "Company B",
      channel: "Referral",
      workMode: "hybrid",
      workflowId: jobApplicationNetworking.id,
      startDate: TODAY,
    });

    render(
      <MemoryRouter initialEntries={["/stats"]}>
        <ServicesProvider services={services}>
          <DataRevisionProvider>
            <PreferencesProvider>
              <StatsPage />
            </PreferencesProvider>
          </DataRevisionProvider>
        </ServicesProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("stat-total").textContent).toBe("2");
      expect(screen.getByTestId("stat-response-rate").textContent).toBe("50%");
      expect(screen.getByTestId("stat-offer-rate").textContent).toBe("50%");
    });
    expect(screen.getByText("LinkedIn")).toBeTruthy();
    expect(screen.getByText("Referral")).toBeTruthy();
  });

  it("displays scheduled steps on their calendar dates and shows day details on click", async () => {
    const user = userEvent.setup();
    const services = await setupServices();

    await services.items.create({
      title: "Frontend Role",
      company: "Nova Tech",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-15",
    });

    render(
      <MemoryRouter initialEntries={["/calendar"]}>
        <ServicesProvider services={services}>
          <DataRevisionProvider>
            <PreferencesProvider>
              <CalendarPage todayOverride={TODAY} />
            </PreferencesProvider>
          </DataRevisionProvider>
        </ServicesProvider>
      </MemoryRouter>,
    );

    const day15 = await screen.findByTestId("calendar-day-2026-03-15");
    await waitFor(() => {
      expect(day15.textContent).toContain("Nova Tech");
    });

    await user.click(day15);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Frontend Role" })).toBeTruthy();
    });
  });
});
