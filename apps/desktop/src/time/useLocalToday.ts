import type { ISODate } from "@jobfollo/core";
import { useEffect, useRef, useState } from "react";
import { localToday } from "./localToday.js";

const POLL_INTERVAL_MS = 60_000;
const MIDNIGHT_BUFFER_MS = 50;

export function msUntilNextLocalMidnight(now: Date): number {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(1000, nextMidnight.getTime() - now.getTime()) + MIDNIGHT_BUFFER_MS;
}

const defaultNow = () => new Date();

/**
 * Returns the local calendar day (`YYYY-MM-DD`) and re-evaluates at local midnight,
 * on window focus / document visibility change, and on a 60-second interval.
 */
export function useLocalToday(nowFn: () => Date = defaultNow): ISODate {
  const nowFnRef = useRef(nowFn);
  nowFnRef.current = nowFn;

  const [today, setToday] = useState<ISODate>(() => localToday(nowFnRef.current()));

  useEffect(() => {
    const refresh = () => {
      const next = localToday(nowFnRef.current());
      setToday((prev) => (prev === next ? prev : next));
    };

    let midnightTimer: number | undefined;
    const scheduleMidnight = () => {
      const delay = msUntilNextLocalMidnight(nowFnRef.current());
      midnightTimer = window.setTimeout(() => {
        refresh();
        scheduleMidnight();
      }, delay);
    };

    scheduleMidnight();
    const intervalId = window.setInterval(refresh, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (midnightTimer !== undefined) {
        window.clearTimeout(midnightTimer);
      }
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return today;
}
