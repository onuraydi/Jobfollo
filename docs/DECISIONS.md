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

## ADR-006 — Rust is a thin transactional SQLite pipe; SQL is authored in TypeScript
**Context:** `tauri-plugin-sql` pools connections, so multi-statement transactions across separate calls are unreliable, and Rust must not hold business rules. Hand-writing typed CRUD commands in Rust would duplicate the TS types.
**Decision:** The Rust side (Phase 3) owns one SQLite connection (WAL, foreign keys on) and exposes only two commands: `db_select(sql, params)` and `db_batch(statements)` (atomic, one transaction). All SQL lives in `packages/data` repositories that depend on a `SqlExecutor` interface. Tests use an in-memory SQLite implementation of the same interface.
**Consequences:** Real transactions; minimal Rust; repositories fully tested in Node; Rust can still read `app_setting` / `reminder_log` for the scheduler if ADR-004's spike requires it. The webview must load only bundled content (strict CSP) because it can send SQL to Rust.

## ADR-007 — Items reference workflows by id and use the current definition
**Context:** Users can edit workflows after items exist.
**Decision:** `item.workflow_id` points to a built-in template (resolved from `core`, never stored in the DB) or a custom workflow row. Editing a workflow changes the schedule of its existing items. Editing a built-in creates a custom copy.
**Consequences:** Simple model. Revisit with workflow versioning if users report surprise.

## ADR-008 — No `outcome_definition` table in the MVP
**Context:** Outcome ids (`reply`, `interview`, `offer`, `negative`, plus an "in progress" default) are generic; labels are localized in the UI.
**Decision:** Outcomes are plain text ids on `item.outcome`; labels live in the UI i18n files. Custom outcomes are post-MVP.
**Consequences:** Remove `outcome_definition` from the data model in `ARCHITECTURE.md`.
