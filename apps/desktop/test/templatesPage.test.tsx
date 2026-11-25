// @vitest-environment jsdom
import {
  builtInMigrations,
  createItemRepository,
  createReminderLogRepository,
  createSettingsRepository,
  createTemplateRepository,
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
import { TemplatesPage } from "../src/pages/TemplatesPage.js";
import { DataRevisionProvider, PreferencesProvider } from "../src/shell/index.js";
import { localToday } from "../src/time/index.js";

describe("TemplatesPage (integration with real in-memory SQLite)", () => {
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

  it("renders built-in templates with live item preview, creates a custom email template, and persists to SQLite", async () => {
    const user = userEvent.setup();
    db = createSqliteExecutor();
    const clock = createAdvancingClock(Date.UTC(2026, 3, 1, 9, 0, 0));
    const idGenerator = createSequentialIds("tpl-test");
    await runMigrations(db, builtInMigrations, clock);

    const workflows = createWorkflowRepository(db, { clock, idGenerator });
    const items = createItemRepository(db, workflows, { clock, idGenerator });
    const settings = createSettingsRepository(db);
    const reminderLog = createReminderLogRepository(db, { clock, idGenerator });
    const templates = createTemplateRepository(db, { clock, idGenerator });

    await settings.set("language", "en");

    const services: AppServices = {
      workflows,
      items,
      settings,
      reminderLog,
      templates,
      clock,
      idGenerator,
      localToday,
      dataLocation: "/tmp/jobfollo-test",
    };

    const item = await items.create({
      title: "Senior Frontend",
      company: "Nova Labs",
      role: "Staff Frontend Engineer",
      workflowId: "job-application-networking",
      startDate: "2026-04-01",
      contacts: [{ name: "Mert", status: "pending" }],
    });

    render(
      <MemoryRouter>
        <ServicesProvider services={services}>
          <DataRevisionProvider>
            <PreferencesProvider>
              <TemplatesPage />
            </PreferencesProvider>
          </DataRevisionProvider>
        </ServicesProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Email & message templates" }),
    ).toBeTruthy();

    // Fill preview from the created item
    await user.selectOptions(screen.getByLabelText("Fill from item"), item.id);
    await waitFor(() => {
      expect(screen.getByTestId("rendered-subject").textContent).toContain(
        "Staff Frontend Engineer",
      );
      expect(screen.getByTestId("rendered-body").textContent).toContain("Nova Labs");
      expect(screen.getByTestId("rendered-body").textContent).toContain("Mert");
    });

    // Create a custom template
    await user.click(screen.getByRole("button", { name: "New template" }));
    await user.type(screen.getByLabelText("Template name"), "My Custom Outreach");
    await user.type(screen.getByLabelText("Email subject"), "Hello {{{{company}}");
    await user.type(screen.getByLabelText("Body"), "Hi {{{{contact}}, excited about {{{{role}}.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Template saved.")).toBeTruthy();
      expect(screen.getByTestId("rendered-subject").textContent).toBe("Hello Nova Labs");
      expect(screen.getByTestId("rendered-body").textContent).toContain("Hi Mert");
    });

    const saved = await templates.listCustom();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe("My Custom Outreach");
  });
});
