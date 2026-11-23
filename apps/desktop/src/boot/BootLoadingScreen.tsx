import { useEffect, useState } from "react";
import { BOOT_MESSAGES, type BootLocale } from "./bootMessages.js";

export interface BootLoadingScreenProps {
  locale: BootLocale;
  delayMs?: number;
}

export function BootLoadingScreen({ locale, delayMs = 150 }: BootLoadingScreenProps) {
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowSpinner(true);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [delayMs]);

  if (!showSpinner) {
    return null;
  }

  const messages = BOOT_MESSAGES[locale];
  return (
    <main
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <p>{messages.loading}</p>
    </main>
  );
}
