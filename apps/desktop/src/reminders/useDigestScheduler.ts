import { useEffect, useRef } from "react";
import { useServices } from "../boot/index.js";
import { useDataRevision, usePreferences } from "../shell/index.js";
import { runDigestCheck } from "./runDigestCheck.js";

const CHECK_INTERVAL_MS = 60_000;

/**
 * Runs the daily digest check on app launch (catch-up), on window focus / visibility
 * resume (catch-up after sleep), and every 60 seconds, with single-flight protection
 * so overlapping triggers never send duplicate emails.
 */
export function useDigestScheduler(): void {
  const services = useServices();
  const { resolvedLocale } = usePreferences();
  const { bumpRevision } = useDataRevision();
  const inFlightRef = useRef(false);

  useEffect(() => {
    let active = true;

    const tick = () => {
      if (!active || inFlightRef.current) return;
      inFlightRef.current = true;
      void runDigestCheck(services, { locale: resolvedLocale })
        .then((outcome) => {
          if (active && (outcome.status === "sent" || outcome.status === "failed")) {
            bumpRevision();
          }
        })
        .catch(() => {
          // Scheduler errors are non-fatal to the UI shell
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    // Immediate catch-up check on mount
    tick();

    const intervalId = window.setInterval(tick, CHECK_INTERVAL_MS);
    const onFocus = () => tick();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [services, resolvedLocale, bumpRevision]);
}
