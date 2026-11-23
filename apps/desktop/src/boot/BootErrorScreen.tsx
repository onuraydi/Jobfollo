import { useState } from "react";
import { BOOT_MESSAGES, type BootLocale } from "./bootMessages.js";
import type { BootError } from "./types.js";

export interface BootErrorScreenProps {
  error: BootError;
  dataLocation: string | null;
  locale: BootLocale;
  onRetry: () => void;
}

export function BootErrorScreen({
  error,
  dataLocation,
  locale,
  onRetry,
}: BootErrorScreenProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "fallback">("idle");
  const bundle = BOOT_MESSAGES[locale];
  const copy = bundle.errors[error.kind];

  const detailsPayload = [
    `kind: ${error.kind}`,
    ...(dataLocation ? [`dataLocation: ${dataLocation}`] : []),
    `details: ${error.technicalDetails}`,
  ].join("\n");

  async function handleCopy() {
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard || typeof clipboard.writeText !== "function") {
      setCopyState("fallback");
      return;
    }
    try {
      await clipboard.writeText(detailsPayload);
      setCopyState("copied");
    } catch {
      setCopyState("fallback");
    }
  }

  return (
    <main
      role="alert"
      style={{
        maxWidth: 640,
        margin: "48px auto",
        padding: "0 24px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        lineHeight: 1.5,
      }}
    >
      <h1>{copy.title}</h1>
      <p>{copy.explanation}</p>
      <p>{copy.guidance}</p>

      {dataLocation !== null && (
        <p>
          <strong>{bundle.dataFolderLabel}:</strong> <code>{dataLocation}</code>
        </p>
      )}

      {copy.canRetry && (
        <p>
          <button type="button" onClick={onRetry}>
            {bundle.retryButton}
          </button>
        </p>
      )}

      <details style={{ marginTop: 24 }}>
        <summary>{bundle.technicalDetailsSummary}</summary>
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => void handleCopy()}>
            {copyState === "copied" ? bundle.copiedButton : bundle.copyButton}
          </button>
          {copyState === "fallback" && <p>{bundle.copyFallbackHint}</p>}
          <pre
            style={{
              marginTop: 8,
              padding: 12,
              overflowX: "auto",
              userSelect: "all",
              border: "1px solid currentColor",
              borderRadius: 4,
            }}
          >
            {detailsPayload}
          </pre>
        </div>
      </details>
    </main>
  );
}
