# Phase 3 — Desktop app (`apps/desktop`)

Goal: a working Tauri 2 + React app on top of `@jobfollo/core` and `@jobfollo/data`. At the end the author can run his real job search from it: create applications, see "Today", complete steps, record connection results, set outcomes, restart the app and find everything still there. Email reminders are Phase 4.

Prerequisites: Phase 2 closed and tagged `phase-2-data`. Toolchain installed (Rust stable, Node 22, pnpm, and the OS prerequisites from the official Tauri "Prerequisites" page; on Windows that means MSVC Build Tools and WebView2).

## Decisions to record first (task T3.0)

Add as new ADRs in `docs/DECISIONS.md` (continue the numbering; do not renumber).

### ADR — Bundle identifier is permanent
The Tauri bundle identifier decides the OS app-data folder, so changing it later orphans every user's database. Use the value the owner provides (suggested form `io.github.<github-user>.jobfollo`, or a reverse-DNS of a domain the owner controls). It is recorded here and never changed after the first release.

### ADR — UI stack
React + TypeScript (strict) + Vite (from the Tauri template), Tailwind CSS, shadcn/ui (generated with its CLI; components live in the repo), lucide-react icons, react-router, i18next + react-i18next. **No global state library and no form library**: React context + small hooks, controlled forms.
Pre-approved dependencies (everything else needs approval):
- frontend: `react`, `react-dom`, `react-router`, `i18next`, `react-i18next`, `tailwindcss`, `@tailwindcss/vite`, the packages shadcn/ui's CLI installs (Radix primitives, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`), `@tauri-apps/api`, `@tauri-apps/plugin-opener`
- dev: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `@types/node`
- Rust: `tauri`, `tauri-plugin-opener`, `rusqlite` (features `bundled` and whatever the authorizer needs), `serde`, `serde_json`
- kanban drag and drop (`@dnd-kit/*`) is approved only for T3.8.

### ADR — "Today" is the local calendar day, computed in the UI shell
`core` and `data` never read the clock. The app computes `today` with local date getters (never `toISOString()`, never `new Date("YYYY-MM-DD")`, which parses as UTC and shifts a day in negative offsets). ISO dates are turned into `Date` objects only for display, with `new Date(y, m - 1, d)`.

### ADR — Localized titles live in the workflow templates
Built-in step titles and workflow names are English strings in the template JSON, so a Turkish UI or a Turkish email digest would show English. Decision: templates carry optional `titles` / `names` maps (`{ en, tr }`); UI and `renderDigest` read the same source and fall back to the plain string. This needs a small core task (T1.9) before T3.5.

## Tasks

### T1.9 (core, do this before T3.5) Localized titles
`WorkflowStep.titles?`, `Workflow.names?` as `Partial<Record<"en" | "tr", string>>`. `validateWorkflow` checks them (non-empty strings, known locales). `DigestRow` carries the localized step titles and `renderDigest` picks the digest locale with fallback to `stepTitle`. Fill in `en` and `tr` for all built-in templates. Tests: every built-in step has both locales; a Turkish digest contains the Turkish step title; a custom workflow without `titles` falls back correctly. Rename the planned `shouldSendDigest` task to T1.10 in the roadmap.

### T3.0 Scaffold and decisions
- Inside `apps/desktop` run the official scaffolder in place: `pnpm create tauri-app . --template react-ts --manager pnpm`. Package name `@jobfollo/desktop`, dependencies on `@jobfollo/core` and `@jobfollo/data` as `workspace:*`. Remove demo code and the template's `greet` command.
- Keep `tauri-plugin-opener` (needed to open profile links in the default browser) but scope it to `http` and `https` URLs only. Capabilities file: only what is used.
- Strict CSP in `tauri.conf.json`: no remote origins, no `unsafe-eval`; run the app and fix what breaks (Tauri's IPC needs its own entries) instead of loosening to `*`. Devtools off in release builds.
- Window: title "Jobfollo", sensible minimum size, placeholder icon.
- Wire `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm typecheck` in the package; root `pnpm test` / `typecheck` still work. Merge the ADRs, update `apps/desktop/AGENTS.md` (remove "not scaffolded yet", add the rules from the section at the end of this file), update ROADMAP.
- Exit: `pnpm --filter @jobfollo/desktop tauri dev` opens an empty window; `pnpm build` and `cargo check` pass.

### T3.1 Rust SQLite pipe (`src-tauri`)
Implements ADR-006. Put all DB logic in a plain Rust module (no Tauri types) so `cargo test` needs no webview.
- One `rusqlite::Connection` behind a `Mutex`, opened in `setup` at `app_data_dir()/jobfollo.db` (create the folder). At open: `foreign_keys = ON`, `journal_mode = WAL`, `busy_timeout`, `synchronous = NORMAL`. Open failure is reported to the UI, never a panic.
- Commands, nothing else registered: `db_select(sql, params) -> rows` (array of column→value objects), `db_batch(statements) -> [{ rowsAffected }]` (one transaction, rolled back entirely if any statement fails), and the read-only `data_location() -> string` for the settings screen.
- Params are `null | integer | real | string` (reject anything else). Result values: INTEGER → number, REAL → number, TEXT → string, NULL → null, BLOB → error.
- Defence in depth, since the webview can send SQL: `db_select` rejects statements that are not read-only (`Statement::readonly`); multi-statement strings are rejected (rusqlite already does); install an authorizer that denies `ATTACH`, `DETACH` and all `PRAGMA` coming through IPC (the open-time pragmas run before the authorizer is installed); extension loading stays disabled. If the authorizer cannot be enabled with the chosen features, stop and ask.
- Errors are serializable `{ kind: "constraint" | "busy" | "sql" | "io" | "open" | "invalid_argument" | "forbidden" | "limit", message }`; messages never contain parameter values.
- `cargo test`: parameter binding for each type, batch rollback on the third statement failing, foreign key enforcement, read-only enforcement in `db_select`, multi-statement rejection, `ATTACH` and `PRAGMA` denied, WAL mode on a file database, integrity check ok, Turkish and emoji text round-trip, SQL injection string stored as plain text.

### T3.2a TypeScript bridge, contract fixtures, and testing export
- `createTauriSqlExecutor(invoke)` implements `SqlExecutor` and `getDataLocation(invoke)` returns the data directory; `invoke` is injected so tests never import `@tauri-apps/api` (isolated to `src/db/default.ts`).
- Pre-IPC parameter validation rejects `undefined`, `NaN`, `±Infinity`, booleans, `bigint`, objects, arrays, and unsafe integers with `SqlExecutionError` (`kind: "invalid_argument"`). Rust error kinds map verbatim; non-contractual rejections and malformed responses map to `kind: "ipc"`.
- Shared literal JSON fixtures in `apps/desktop/contract/ipc-fixtures.json` asserted by both Rust (`include_str!`) and TypeScript tests.
- Pulls `@jobfollo/data/testing` subpath export forward from T3.9 (re-exporting in-memory SQLite executor, fake clock, sequential IDs) and adds typed `MigrationError` subclasses in `@jobfollo/data`.

### T3.2b App services, bootstrap, and boot screens
- Pure `bootstrap(deps)` with 4-step sequence (active WebCrypto check → best-effort `data_location` → `runMigrations` → build services), single-flight `getBoot()`/`retryBoot()`, exhaustive `classifyBootError` by `instanceof` / `SqlExecutionError.kind`, and `localToday()` moved here under `src/time/`.
- Startup states: loading (spinner delayed 150 ms) → ready (minimal placeholder), or a self-contained TR/EN boot error screen (driven by `navigator.language`, independent of DB/i18next) with per-kind actions, data path, and collapsible technical details + Copy button. **The app never deletes or resets data on its own.**
- Tests: `localToday`, `bootstrap` with fake `invoke` + `@jobfollo/data/testing` in-memory SQLite, `classifyBootError`, `createCryptoIdGenerator`, single-flight controller, and boot error screen rendering.

### T3.3 App shell, i18n, theme
- Sidebar: Today, Items, Settings. react-router. Light, dark and system theme (setting `theme`), language `system | tr | en` (setting `language`; `system` resolves from `navigator.language`, default English if neither).
- Design tokens through Tailwind and shadcn variables; both themes designed, not inverted. Visible focus rings, keyboard navigation, `aria` labels, no information carried by colour alone (overdue also has text and icon).
- i18n: `tr` and `en` resource files. Tests: both files have exactly the same key set; no empty values; a test fails if a `t()` key used in `src/` is missing.
- Date display through `Intl.DateTimeFormat` using the UI locale on dates built with `new Date(y, m - 1, d)`.

### T3.4 Clock and refresh
- `localToday()` lives in `src/time/` (added in T3.2b); T3.4 adds a hook that re-evaluates at local midnight, on window focus / visibility change, and on a 60-second interval (sleep and resume).
- A simple data revision counter in context: mutations bump it and screens reload. No caching library.
- Tests with fake timers and `TZ` set to `Europe/Istanbul` and `America/Los_Angeles`: 23:59 → 00:00 rollover; 00:30 local when UTC is still the previous day returns the local date; DST change day.

### T3.5 Today screen
- Data: `list()` items, workflows via `listAll()`, then `buildDigest(items, workflows, today, { upcomingDays: 7 })`. Groups: overdue, today, upcoming. Row: item title, step title (localized), due date, "N days overdue / due today / in N days".
- Actions: **Done** (completes with today; a small control picks another date; no future-date guard, per T2.4), **Skip**, **Open item**. Toast with **Undo** after Done or Skip (`undoStep`; the toast text says contact statuses are not reverted).
- Steps that record a connection result (`records: "contactStatus"`): Done opens a dialog to choose Accepted / Not accepted per contact, then `completeStep` with `contactStatuses` in one call. With no contacts, the dialog offers adding one first.
- A row whose step has `suggestsOutcome` shows a clear "Mark as <outcome>" button (`setOutcome`).
- `skippedItems` from the digest show as a banner ("N items could not be scheduled") linking to the list.
- Empty state when nothing is due ("You're all caught up"), distinct from "no items yet" with a create button.
- Tests (Testing Library + real in-memory SQLite through `@jobfollo/data/testing`, see T3.9): grouping, Done persists and moves the row, Undo restores, the accept/not-accept dialog drives `first_message` vs `followup_1`, the suggest-outcome button stops the flow, empty states.

### T3.6 Items list and create/edit form
- Table: title, role, workflow, next step and due date (via `computeNextStep`), outcome, status chip. Search by title, filter by workflow and outcome, toggle archived, sort by due date (default) / created / title (Turkish-aware order).
- Create dialog: title, role, channel, workflow select (localized names), start date (default today), optional first contact. Server-side `ValidationError` issues map to field messages. Keyboard shortcut `N` opens it.
- Tests: create with validation errors and success, filters, archived toggle, Turkish sorting (`Çağrı` between `Burs` and `Freelance`).

### T3.7 Item detail
- Header with title, role, channel, workflow, start date (editable via `update`).
- Step timeline from `computeSchedule`: status chip per step (done, skipped, pending, overdue, due today, blocked, stopped), due and completion dates, actions per step (Done with date picker, Skip, Undo).
- Contacts: add, edit, remove; status select; profile link opens in the default browser through the opener plugin (http/https only, validated again in the UI).
- Notes (explicit Save button, unsaved-changes guard), outcome select (localized labels for the machine ids; ADR-008), archive / unarchive, delete with a confirmation that names the item.
- Tests: timeline reflects completion and outcome stop/resume, contact CRUD, a `javascript:` link is never rendered as clickable, delete confirmation.

### T3.8 Kanban view (optional, can follow T3.9)
Board by outcome (in progress, reply, interview, offer, negative); drag a card to change the outcome with `setOutcome`; keyboard-accessible alternative (a menu on each card). `@dnd-kit` approved for this task only.

### T3.9 Settings, test support, CI, smoke tests
- Settings: language, theme, read-only data location (from `data_location`). Email and backup sections appear as disabled "coming soon" placeholders only if they cost nothing; otherwise leave them out.
- `@jobfollo/data/testing`: a subpath export (file outside `src/`, e.g. `packages/data/testing/index.ts`, exported through `package.json` `exports`) re-exporting the in-memory executor, fake clock and id generator for other packages' tests. A test in `apps/desktop` fails if app code (anything outside test files) imports it. Update T2.6's boundary test accordingly.
- CI: add a job for `apps/desktop`: install the Linux prerequisites from the official Tauri docs, `pnpm build`, `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`. Packaging stays in Phase 5.
- `docs/SMOKE-TESTS.md`: a manual checklist (fresh install, create item, complete steps, restart, newer-database refusal, theme and language switch, offline behavior) run on the author's OS before tagging.

## Phase 3 exit criteria
1. `pnpm typecheck`, `pnpm test`, `cargo test`, `cargo clippy -- -D warnings` pass locally; CI green including the desktop job.
2. `pnpm tauri build` produces an installer on the author's OS and it runs the smoke checklist.
3. The author enters real applications and uses the app for a day. Bugs found go to issues.
4. TR and EN complete; light and dark reviewed.
5. ROADMAP updated, `/update-docs` run, tag `phase-3-ui`.

## Rules to add to `apps/desktop/AGENTS.md` (T3.0 merges these)
- Never parse an ISO date with `new Date("YYYY-MM-DD")`, and never derive `today` from `toISOString()`. Use `localToday()` and `new Date(y, m - 1, d)`.
- All writes go through `@jobfollo/data` repositories; no SQL in `apps/desktop/src`. Only `db_select`, `db_batch` and `data_location` exist on the Rust side; adding a command needs an ADR.
- Rust holds no business rules. The `db` module has no Tauri types.
- Every user-visible string uses i18n keys (TR + EN); outcome and workflow labels come from i18n or template `titles`, never from raw ids.
- Links from user data open only through the opener plugin and only if `http:` or `https:`.
- Do not import `@jobfollo/data/testing` from app code.
- No network access from the webview; the CSP must stay strict.
- No new dependency outside the pre-approved list without asking.

## Prompt template for Phase 3 tasks
```
Task: <T-number> from docs/tasks/phase-3-ui.md.
Context: read docs/PRD.md, docs/ARCHITECTURE.md, docs/DECISIONS.md, AGENTS.md and the AGENTS.md of every package you touch.
Tests first where the task lists tests. First show me your plan and test scenarios; do not edit files until I approve.
Only the dependencies pre-approved in the spec; ask before anything else.
Do not touch files outside the paths this task needs.
```
