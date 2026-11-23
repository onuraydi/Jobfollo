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
import type { ExternalUrlOpener } from "../src/lib/externalUrl.js";
import { ItemDetailPage } from "../src/pages/ItemDetailPage.js";
import { DataRevisionProvider, PreferencesProvider } from "../src/shell/index.js";
import { localToday } from "../src/time/index.js";

const TODAY = "2026-03-10";

describe("ItemDetailPage (integration with real in-memory SQLite)", () => {
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
    vi.restoreAllMocks();
    db?.close();
    db = undefined;
  });

  async function setupServices(locale: "en" | "tr" = "en"): Promise<AppServices> {
    db = createSqliteExecutor(":memory:");
    const clock = createAdvancingClock();
    const idGenerator = createSequentialIds("dt");
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

  function renderDetail(
    services: AppServices,
    itemId: string,
    opener?: ExternalUrlOpener,
  ) {
    return render(
      <MemoryRouter initialEntries={[`/items/${itemId}`]}>
        <ServicesProvider services={services}>
          <DataRevisionProvider>
            <PreferencesProvider>
              <Routes>
                <Route
                  path="/items/:id"
                  element={
                    <ItemDetailPage
                      todayOverride={TODAY}
                      externalUrlOpener={opener}
                    />
                  }
                />
                <Route path="/items" element={<div>Items list view</div>} />
              </Routes>
            </PreferencesProvider>
          </DataRevisionProvider>
        </ServicesProvider>
      </MemoryRouter>,
    );
  }

  it("reflects step completion, undo, and outcome stop/resume in the timeline", async () => {
    const user = userEvent.setup();
    const services = await setupServices("en");

    const item = await services.items.create({
      title: "Acme Corp",
      role: "Frontend Engineer",
      channel: "LinkedIn",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-10",
    });

    renderDetail(services, item.id);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Acme Corp" })).toBeTruthy();
    });

    // Apply step is due today
    const applyRow = screen.getByTestId("timeline-step-apply");
    expect(within(applyRow).getByText("Due today")).toBeTruthy();

    // Complete Apply step
    await user.click(within(applyRow).getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(within(screen.getByTestId("timeline-step-apply")).getByText("Done")).toBeTruthy();
    });

    // Connect request step is now due today (offsetDays: 0 from step:apply)
    const connectRow = screen.getByTestId("timeline-step-connect_request");
    expect(within(connectRow).getByText("Due today")).toBeTruthy();

    // Set outcome to negative -> pending steps become Stopped
    const outcomeSelect = screen.getByLabelText("Outcome");
    await user.selectOptions(outcomeSelect, "negative");

    await waitFor(() => {
      expect(
        within(screen.getByTestId("timeline-step-connect_request")).getByText("Stopped"),
      ).toBeTruthy();
    });

    // Clear outcome back to In progress -> flow resumes
    await user.selectOptions(outcomeSelect, "");

    await waitFor(() => {
      expect(
        within(screen.getByTestId("timeline-step-connect_request")).getByText("Due today"),
      ).toBeTruthy();
    });

    // Undo Apply step -> returns to Due today
    await user.click(within(screen.getByTestId("timeline-step-apply")).getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(within(screen.getByTestId("timeline-step-apply")).getByText("Due today")).toBeTruthy();
    });
  });

  it("supports header editing with validation, contact CRUD, and refuses clickable javascript: links", async () => {
    const user = userEvent.setup();
    const services = await setupServices("en");
    const mockOpener = vi.fn<ExternalUrlOpener>().mockResolvedValue(undefined);

    const item = await services.items.create({
      title: "Beta Labs",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-10",
    });

    // Seed an unsafe javascript: profile_url directly in SQLite to verify UI defense-in-depth
    await db!.batch([
      {
        sql: `INSERT INTO contact (id, item_id, name, profile_url, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        params: [
          "unsafe-c1",
          item.id,
          "Mallory",
          "javascript:alert(1)",
          "pending",
          "2026-03-10T09:00:00.000Z",
        ],
      },
    ]);

    renderDetail(services, item.id, mockOpener);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Beta Labs" })).toBeTruthy();
    });

    // 1. Unsafe javascript: URL must NEVER be rendered as a clickable link or button
    const malloryRow = screen.getByTestId("contact-row-unsafe-c1");
    expect(within(malloryRow).getByText("Mallory")).toBeTruthy();
    expect(within(malloryRow).queryByRole("link")).toBeNull();
    expect(within(malloryRow).queryByRole("button", { name: /open profile/i })).toBeNull();
    expect(within(malloryRow).getByText(/only http\/https links can be opened/i)).toBeTruthy();

    // 2. Add a safe contact via UI
    await user.click(screen.getByRole("button", { name: "Add contact" }));
    await user.type(screen.getByLabelText("Contact name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Profile URL"), "https://example.com/ada");
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]!);

    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    });

    // Click safe profile link -> calls opener with https URL
    await user.click(screen.getByRole("button", { name: "Open profile" }));
    expect(mockOpener).toHaveBeenCalledTimes(1);
    expect(mockOpener).toHaveBeenCalledWith("https://example.com/ada");

    // Update Ada's contact status and edit her name
    const adaStatus = screen.getByLabelText("Connection status — Ada Lovelace");
    await user.selectOptions(adaStatus, "accepted");

    await waitFor(async () => {
      const fresh = await services.items.get(item.id);
      const ada = fresh?.contacts.find((c) => c.name === "Ada Lovelace");
      expect(ada?.status).toBe("accepted");
    });

    // Remove Mallory
    await user.click(within(malloryRow).getByRole("button", { name: "Remove" }));
    await waitFor(() => {
      expect(screen.queryByText("Mallory")).toBeNull();
    });

    // 3. Edit header: clear title -> validation error, then save valid title
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    const titleInput = screen.getByLabelText("Title");
    await user.clear(titleInput);
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]!);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });

    await user.type(titleInput, "Beta Labs Updated");
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]!);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Beta Labs Updated" })).toBeTruthy();
    });
  });

  it("saves notes explicitly with unsaved-changes guard, toggles archive, and requires named confirmation to delete", async () => {
    const user = userEvent.setup();
    const services = await setupServices("en");

    const item = await services.items.create({
      title: "Gamma Studio",
      workflowId: jobApplicationNetworking.id,
      startDate: "2026-03-10",
    });

    renderDetail(services, item.id);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Gamma Studio" })).toBeTruthy();
    });

    // Type notes -> shows unsaved indicator; clicking Back triggers confirm
    const notesBox = screen.getByLabelText("Notes");
    await user.type(notesBox, "Met CTO at meetup.");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.click(screen.getByRole("button", { name: "Back to items" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Gamma Studio" })).toBeTruthy();

    // Save notes explicitly
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeTruthy();
    });
    const afterNotes = await services.items.get(item.id);
    expect(afterNotes?.notes).toBe("Met CTO at meetup.");

    // Archive and unarchive
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unarchive" })).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: "Unarchive" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Archive" })).toBeTruthy();
    });

    // Delete with confirmation dialog naming the item
    await user.click(screen.getByRole("button", { name: "Delete item" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Gamma Studio/)).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByText("Items list view")).toBeTruthy();
    });
    expect(await services.items.get(item.id)).toBeNull();
  });
});
