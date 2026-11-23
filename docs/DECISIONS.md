# Decision log

Format: context, decision, consequences. Append new entries; do not rewrite old ones.

## ADR-001 — Tauri 2 for the desktop shell
**Context:** Needs a small, modern, cross-platform desktop app with OS keychain, tray and autostart access.
**Decision:** Tauri 2 with a React UI.
**Consequences:** Small installers; a small amount of Rust for capabilities; webview behaviour varies by OS (see ADR-004 risk).

## ADR-002 — Business logic only in a pure TypeScript `core` package
**Context:** Schedule math must be tested thoroughly and reused across UI and any future CLI.
**Decision:** `packages/core` has no I/O and receives `today` as a parameter.
**Consequences:** Rust and UI never duplicate rules; tests are fast and deterministic.

## ADR-003 — Email via user-supplied SMTP, daily digest
**Context:** No cloud backend (privacy principle) but reminders by email are required.
**Decision:** The user configures their own SMTP account; credentials live in the OS keychain; one digest per day; catch-up on launch.
**Consequences:** No reminders while the computer is off; Gmail/Outlook need app passwords; OAuth is post-MVP.

## ADR-004 — Scheduler placement (OPEN, spike in Phase 4)
**Context:** A Rust timer triggers the digest; the UI layer computes it with `core`. Hidden webviews may be throttled.
**Decision:** Start with Rust tick + UI compute. Verify on all OSes.
**Consequences:** If unreliable, move `core` into a Node sidecar or WASM called from Rust. Do not duplicate rules in Rust.

## ADR-005 — Project name: Jobfollo
**Context:** Needed a name conveying "job reminder". Earlier working name was Cadence.
**Decision:** Jobfollo.
**Consequences:** Package scope `@jobfollo/*`. Check GitHub/npm/domain availability before first public release.
