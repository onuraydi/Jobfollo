import { buildDigest, renderDigest } from "@jobfollo/core";
import { useEffect, useRef } from "react";
import { useServices } from "../boot/index.js";
import { useDataRevision, usePreferences } from "../shell/index.js";
import { sendDesktopNotification } from "./desktopNotify.js";
import { runDigestCheck } from "./runDigestCheck.js";

const CHECK_INTERVAL_MS = 60_000;

/**
 * Runs the daily digest check (and optional local OS notification) on app launch,
 * on window focus / visibility resume, and every 60 seconds, with single-flight
 * protection so overlapping triggers never send duplicate emails or notifications.
 */
export function useDigestScheduler(): void {
  const services = useServices();
  const { resolvedLocale, desktopNotifications, skipWeekends } = usePreferences();
  const { bumpRevision } = useDataRevision();
  const inFlightRef = useRef(false);
  const lastNotifiedDateRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    const tick = () => {
      if (!active || inFlightRef.current) return;
      inFlightRef.current = true;
      void runDigestCheck(services, { locale: resolvedLocale })
        .then(async (outcome) => {
          if (active && (outcome.status === "sent" || outcome.status === "failed")) {
            bumpRevision();
          }
          if (active && desktopNotifications) {
            const today = services.localToday();
            if (lastNotifiedDateRef.current !== today) {
              const [items, wfEntries] = await Promise.all([
                services.items.list(),
                services.workflows.listAll(),
              ]);
              const digest = buildDigest(
                items,
                wfEntries.map((e) => e.workflow),
                today,
                { upcomingDays: 0, skipWeekends },
              );
              if (!digest.isEmpty) {
                const rendered = renderDigest(digest, resolvedLocale);
                await sendDesktopNotification("Jobfollo", rendered.subject);
              }
              lastNotifiedDateRef.current = today;
            }
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
  }, [services, resolvedLocale, desktopNotifications, skipWeekends, bumpRevision]);
}
