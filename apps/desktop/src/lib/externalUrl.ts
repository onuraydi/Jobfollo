import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Returns true if and only if `raw` is a well-formed `http:` or `https:` URL.
 * Rejects `javascript:`, `data:`, `file:`, `mailto:`, relative strings, and malformed URLs.
 */
export function isSafeHttpUrl(raw: string | undefined | null): raw is string {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export type ExternalUrlOpener = (url: string) => Promise<void>;

/**
 * Opens a user-supplied URL in the system default browser via `tauri-plugin-opener`,
 * refusing any URL that is not strictly `http:` or `https:`.
 */
export async function openExternalUrl(
  raw: string,
  opener: ExternalUrlOpener = openUrl,
): Promise<boolean> {
  if (!isSafeHttpUrl(raw)) {
    return false;
  }
  await opener(raw.trim());
  return true;
}
