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
import { WorkflowsPage } from "../src/pages/WorkflowsPage.js";
import { DataRevisionProvider, PreferencesProvider } from "../src/shell/index.js";
import { localToday } from "../src/time/index.js";

describe("WorkflowsPage (integration with real in-memory SQLite)", () => {
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
    const idGenerator = createSequentialIds("wf");
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

  it("duplicates a built-in workflow, adds a step, saves to SQLite, and blocks deleting while in use", async () => {
    const user = userEvent.setup();
    const services = await setupServices();

    render(
      <MemoryRouter initialEntries={["/workflows"]}>
        <ServicesProvider services={services}>
          <DataRevisionProvider>
            <PreferencesProvider>
              <WorkflowsPage />
            </PreferencesProvider>
          </DataRevisionProvider>
        </ServicesProvider>
      </MemoryRouter>,
    );

    // Wait for built-in workflow to load
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Duplicate to customize" }),
      ).toBeTruthy();
    });

    // Duplicate built-in template into a custom copy
    await user.click(screen.getByRole("button", { name: "Duplicate to customize" }));

    const nameInput = (await screen.findByLabelText("Workflow name")) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "My Custom Outreach");

    // Add a new step and fill its title
    await user.click(screen.getByRole("button", { name: "Add step" }));
    const titleInputs = screen.getAllByLabelText("Step title");
    const lastTitleInput = titleInputs[titleInputs.length - 1]!;
    await user.type(lastTitleInput, "Send thank-you note");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Workflow saved.")).toBeTruthy();
    });

    const customList = await services.workflows.listCustom();
    expect(customList.workflows).toHaveLength(1);
    const savedWorkflow = customList.workflows[0]!;
    expect(savedWorkflow.name).toBe("My Custom Outreach");
    expect(savedWorkflow.steps.some((s) => s.title === "Send thank-you note")).toBe(true);

    // Create an item referencing this custom workflow -> delete must be blocked
    const item = await services.items.create({
      title: "Delta Corp",
      workflowId: savedWorkflow.id,
      startDate: "2026-03-10",
    });

    await user.click(
      screen.getByRole("button", { name: "Delete — My Custom Outreach" }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/cannot delete this workflow because one or more items/i),
      ).toBeTruthy();
    });

    // Delete item -> now workflow can be deleted cleanly
    await services.items.delete(item.id);
    await user.click(
      screen.getByRole("button", { name: "Delete — My Custom Outreach" }),
    );

    await waitFor(async () => {
      const after = await services.workflows.listCustom();
      expect(after.workflows).toHaveLength(0);
    });
  });
});
