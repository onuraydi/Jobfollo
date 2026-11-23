// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataRevisionProvider, useDataRevision } from "../src/shell/index.js";
import { localToday, useLocalToday } from "../src/time/index.js";

function TodayDisplay({ nowFn }: { nowFn?: () => Date }) {
  const today = useLocalToday(nowFn);
  return <span data-testid="today">{today}</span>;
}

function RevisionDisplay() {
  const { revision, bumpRevision } = useDataRevision();
  return (
    <div>
      <span data-testid="rev">{revision}</span>
      <button type="button" onClick={bumpRevision}>
        Bump
      </button>
    </div>
  );
}

describe("useLocalToday & clock refresh", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("rolls over automatically at local midnight (23:59 -> 00:00)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10, 23, 59, 30, 0));

    render(<TodayDisplay />);
    expect(screen.getByTestId("today").textContent).toBe("2026-03-10");

    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(screen.getByTestId("today").textContent).toBe("2026-03-11");
  });

  it("refreshes on 60-second interval after simulated sleep/resume across midnight", () => {
    vi.useFakeTimers();
    let current = new Date(2026, 2, 10, 22, 0, 0, 0);
    render(<TodayDisplay nowFn={() => current} />);
    expect(screen.getByTestId("today").textContent).toBe("2026-03-10");

    // Simulate laptop waking up the next morning
    current = new Date(2026, 2, 11, 8, 15, 0, 0);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByTestId("today").textContent).toBe("2026-03-11");
  });

  it("refreshes on window focus and document visibilitychange", () => {
    let current = new Date(2026, 2, 10, 23, 50, 0, 0);
    render(<TodayDisplay nowFn={() => current} />);
    expect(screen.getByTestId("today").textContent).toBe("2026-03-10");

    current = new Date(2026, 2, 11, 0, 5, 0, 0);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.getByTestId("today").textContent).toBe("2026-03-11");

    current = new Date(2026, 2, 12, 0, 5, 0, 0);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByTestId("today").textContent).toBe("2026-03-12");
  });

  it("returns local date at 00:30 local even when UTC is still the previous day, and across DST days", () => {
    // 00:30 local on 2026-03-15 (in UTC+3 this is 2026-03-14T21:30Z)
    expect(localToday(new Date(2026, 2, 15, 0, 30, 0))).toBe("2026-03-15");
    // US spring-forward DST day (2026-03-08) & EU spring-forward DST day (2026-03-29)
    expect(localToday(new Date(2026, 2, 8, 23, 59, 0))).toBe("2026-03-08");
    expect(localToday(new Date(2026, 2, 9, 0, 1, 0))).toBe("2026-03-09");
    expect(localToday(new Date(2026, 2, 29, 0, 30, 0))).toBe("2026-03-29");
    // Fall-back DST day (2026-11-01)
    expect(localToday(new Date(2026, 10, 1, 1, 30, 0))).toBe("2026-11-01");
  });
});

describe("DataRevisionProvider", () => {
  afterEach(() => {
    cleanup();
  });

  it("starts at 0 and increments on bumpRevision", () => {
    render(
      <DataRevisionProvider>
        <RevisionDisplay />
      </DataRevisionProvider>,
    );

    expect(screen.getByTestId("rev").textContent).toBe("0");

    act(() => {
      screen.getByRole("button", { name: "Bump" }).click();
    });
    expect(screen.getByTestId("rev").textContent).toBe("1");

    act(() => {
      screen.getByRole("button", { name: "Bump" }).click();
    });
    expect(screen.getByTestId("rev").textContent).toBe("2");
  });
});
