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

## ADR-009 — Bundle identifier is permanent
**Context:** The Tauri bundle identifier decides the OS app-data folder, so changing it later orphans every user's database.
**Decision:** Use `io.github.onuraydi.jobfollo` as the Tauri bundle identifier. It is recorded here and never changed after the first release.
**Consequences:** Database and app-data paths remain stable across upgrades on Windows, macOS, and Linux.

## ADR-010 — UI stack
**Context:** Needs a fast, accessible, low-dependency desktop UI that stays strictly presentation-only over `@jobfollo/core` and `@jobfollo/data`.
**Decision:** React + TypeScript (strict) + Vite (from the Tauri template), Tailwind CSS, shadcn/ui (components live in the repo), `lucide-react` icons, `react-router`, `i18next` + `react-i18next`. No global state library and no form library: React context + small hooks, controlled forms. Pre-approved dependencies are listed in `docs/tasks/phase-3-ui.md`; anything else requires approval.
**Consequences:** Small dependency tree, predictable rendering, straightforward testing with Vitest and Testing Library.

## ADR-011 — "Today" is the local calendar day, computed in the UI shell
**Context:** `core` and `data` never read the clock, and ISO date strings (`YYYY-MM-DD`) must never shift by a day due to UTC offsets.
**Decision:** The UI shell computes `today` with local date getters (`localToday()`), never `toISOString()` and never `new Date("YYYY-MM-DD")` (which parses as UTC). ISO dates are converted to `Date` objects only for display via `new Date(y, m - 1, d)`.
**Consequences:** Due dates and "Today" grouping match the user's local calendar in every timezone.

## ADR-012 — Localized titles live in the workflow templates
**Context:** Built-in step titles and workflow names are English strings in the template JSON, so a Turkish UI or Turkish email digest would show English.
**Decision:** Workflow templates carry optional `titles` / `names` maps (`{ en, tr }`); UI and `renderDigest` read the same source and fall back to the plain string. Implemented as `T1.9` in `@jobfollo/core` before `T3.5`.
**Consequences:** Built-in workflows stay localized consistently across both the desktop UI and email digests while custom workflows continue working without translation maps.

## ADR-013 — Rust keychain and SMTP commands
**Context:** Phase 4 email reminders require storing the SMTP password exclusively in the OS keychain and sending digests over user-configured SMTP without ever exposing the stored secret back to the webview, SQLite, or logs.
**Decision:** Add four capability-only Rust commands in `apps/desktop/src-tauri`: `smtp_set_password(password)`, `smtp_has_password() -> boolean`, `smtp_delete_password()`, and `send_email(request)`. Rust reads the password directly from the OS keychain (`keyring` crate, service `io.github.onuraydi.jobfollo`, account `smtp_password`), sends the email via `lettre` (`STARTTLS` or `TLS`), and scrubs the password from any error text before returning a typed `MailError`.
**Consequences:** Secrets never leave Rust/keychain once saved, error strings safe for `reminder_log` never contain credentials, and all digest scheduling/rendering logic remains in `@jobfollo/core`.
