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
import { TodayPage } from "../src/pages/TodayPage.js";
import { DataRevisionProvider, PreferencesProvider } from "../src/shell/index.js";
import { localToday } from "../src/time/index.js";

const TODAY = "2026-03-10";

describe("TodayPage (integration with real in-memory SQLite)", () => {
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
    const idGenerator = createSequentialIds("t");
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

  function renderToday(services: AppServices, todayOverride = TODAY) {
    return render(
      <MemoryRouter initialEntries={["/"]}>
        <ServicesProvider services={services}>
          <DataRevisionProvider>
            <PreferencesProvider>
              <TodayPage todayOverride={todayOverride} />
            </PreferencesProvider>
          </DataRevisionProvider>
        </ServicesProvider>
      </MemoryRouter>,
    );
  }

  it("shows distinct empty states for 'no items yet' vs 'all caught up'", async () => {
    const services = await setupServices("en");
    const view = renderToday(services);

    expect(await screen.findByText("No items yet")).toBeTruthy();

    // Add an item with an outcome so nothing is due
    const item = await services.items.create({
      title: "Closed Co",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-01",
    });
    await services.items.setOutcome(item.id, "offer");

    view.unmount();
    renderToday(services);

    expect(await screen.findByText("You're all caught up")).toBeTruthy();
  });

  it("groups overdue, today, and upcoming rows, completes a step, and supports Undo", async () => {
    const user = userEvent.setup();
    const services = await setupServices("en");

    const overdueItem = await services.items.create({
      title: "Overdue Corp",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-07",
    });
    await services.items.create({
      title: "Today Corp",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-10",
    });
    await services.items.create({
      title: "Upcoming Corp",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-13",
    });

    renderToday(services);

    const overdueSection = await screen.findByRole("region", { name: "Overdue" });
    const todaySection = screen.getByRole("region", { name: "Due today" });
    const upcomingSection = screen.getByRole("region", { name: "Upcoming (next 7 days)" });

    expect(within(overdueSection).getByText("Overdue Corp")).toBeTruthy();
    expect(within(todaySection).getByText("Today Corp")).toBeTruthy();
    expect(within(upcomingSection).getByText("Upcoming Corp")).toBeTruthy();

    // Click Done on Overdue Corp -> apply done on 2026-03-10 -> connect_request due 2026-03-10 (moves to Due today!)
    await user.click(within(overdueSection).getByRole("button", { name: "Done" }));

    await waitFor(() => {
      const updatedToday = screen.getByRole("region", { name: "Due today" });
      expect(within(updatedToday).getByText("Overdue Corp")).toBeTruthy();
      expect(within(updatedToday).getByText("Send LinkedIn connection request")).toBeTruthy();
    });

    // Undo toast appears and restores Overdue Corp back to Overdue
    expect(screen.getByText(/Undo will not revert contact statuses/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      const restoredOverdue = screen.getByRole("region", { name: "Overdue" });
      expect(within(restoredOverdue).getByText("Overdue Corp")).toBeTruthy();
    });

    const reloaded = await services.items.get(overdueItem.id);
    expect(reloaded?.steps).toEqual([]);
  });

  it("opens contact status dialog for check_accept and drives first_message vs followup_1", async () => {
    const user = userEvent.setup();
    const services = await setupServices("en");

    const acceptedCase = await services.items.create({
      title: "Accepted Co",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-09",
      contacts: [{ name: "Alice", status: "pending" }],
      steps: [
        { stepKey: "apply", completedOn: "2026-03-09" },
        { stepKey: "connect_request", completedOn: "2026-03-09" },
      ],
    });
    const rejectedCase = await services.items.create({
      title: "Rejected Co",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-09",
      contacts: [{ name: "Bob", status: "pending" }],
      steps: [
        { stepKey: "apply", completedOn: "2026-03-09" },
        { stepKey: "connect_request", completedOn: "2026-03-09" },
      ],
    });

    renderToday(services);

    // 1. Accepted Co -> default "Accepted" -> first_message appears due today
    const acceptedRow = (await screen.findByText("Accepted Co")).closest("li")!;
    await user.click(within(acceptedRow).getByRole("button", { name: "Done" }));

    const dialog1 = await screen.findByRole("dialog");
    expect(within(dialog1).getByText("Alice")).toBeTruthy();
    await user.click(within(dialog1).getByRole("button", { name: "Complete step" }));

    await waitFor(() => {
      const rowAfter = screen.getByText("Accepted Co").closest("li")!;
      expect(within(rowAfter).getByText("Send first message")).toBeTruthy();
    });

    // 2. Rejected Co -> pick "Not accepted" -> skips first_message, moves to followup_1 in Upcoming
    const rejectedRow = screen.getByText("Rejected Co").closest("li")!;
    await user.click(within(rejectedRow).getByRole("button", { name: "Done" }));

    const dialog2 = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog2).getByLabelText("Bob"), "not_accepted");
    await user.click(within(dialog2).getByRole("button", { name: "Complete step" }));

    await waitFor(() => {
      const upcoming = screen.getByRole("region", { name: "Upcoming (next 7 days)" });
      expect(within(upcoming).getByText("Rejected Co")).toBeTruthy();
      expect(within(upcoming).getByText("Reminder 1")).toBeTruthy();
    });

    expect((await services.items.get(acceptedCase.id))?.contacts[0]?.status).toBe("accepted");
    expect((await services.items.get(rejectedCase.id))?.contacts[0]?.status).toBe("not_accepted");
  });

  it("stops the flow when clicking the suggestsOutcome button (Mark as Negative)", async () => {
    const user = userEvent.setup();
    const services = await setupServices("en");

    const closing = await services.items.create({
      title: "Closing Co",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-02-20",
      contacts: [{ name: "Jane", status: "not_accepted" }],
      steps: [
        { stepKey: "apply", completedOn: "2026-02-20" },
        { stepKey: "connect_request", completedOn: "2026-02-20" },
        { stepKey: "check_accept", completedOn: "2026-02-21" },
        { stepKey: "followup_1", completedOn: "2026-02-27" },
        { stepKey: "followup_2", completedOn: "2026-03-07" },
      ],
    });

    renderToday(services);

    const markBtn = await screen.findByRole("button", { name: "Mark as Negative" });
    await user.click(markBtn);

    await waitFor(() => {
      expect(screen.getByText("You're all caught up")).toBeTruthy();
    });
    expect((await services.items.get(closing.id))?.outcome).toBe("negative");
  });
});
