# Phase 2 — Data (`packages/data`)

Goal: persist items, contacts, step records, custom workflows, settings and the reminder log in SQLite, entirely testable in Node (no Tauri needed). The result loads into the exact `Item` / `Workflow` types from `@jobfollo/core`, so the UI can call `computeNextStep` straight on loaded data.

Prerequisite: Phase 1 closed and tagged `phase-1-core`.

## Decisions to record first (task T2.0)

Merge these into `docs/DECISIONS.md` as new ADRs and update `docs/ARCHITECTURE.md` (repo layout gets `packages/data`; data model section reflects the schema below). Do not renumber existing ADRs.

### ADR-006 — Rust is a thin transactional SQLite pipe; SQL is authored in TypeScript
**Context:** `tauri-plugin-sql` pools connections, so multi-statement transactions across separate calls are unreliable, and Rust must not hold business rules. Hand-writing typed CRUD commands in Rust would duplicate the TS types.
**Decision:** The Rust side (Phase 3) owns one SQLite connection (WAL, foreign keys on) and exposes only two commands: `db_select(sql, params)` and `db_batch(statements)` (atomic, one transaction). All SQL lives in `packages/data` repositories that depend on a `SqlExecutor` interface. Tests use an in-memory SQLite implementation of the same interface.
**Consequences:** Real transactions; minimal Rust; repositories fully tested in Node; Rust can still read `app_setting` / `reminder_log` for the scheduler if ADR-004's spike requires it. The webview must load only bundled content (strict CSP) because it can send SQL to Rust.

### ADR-007 — Items reference workflows by id and use the current definition
**Context:** Users can edit workflows after items exist.
**Decision:** `item.workflow_id` points to a built-in template (resolved from `core`, never stored in the DB) or a custom workflow row. Editing a workflow changes the schedule of its existing items. Editing a built-in creates a custom copy.
**Consequences:** Simple model. Revisit with workflow versioning if users report surprise.

### ADR-008 — No `outcome_definition` table in the MVP
**Context:** Outcome ids (`reply`, `interview`, `offer`, `negative`, plus an "in progress" default) are generic; labels are localized in the UI.
**Decision:** Outcomes are plain text ids on `item.outcome`; labels live in the UI i18n files. Custom outcomes are post-MVP.
**Consequences:** Remove `outcome_definition` from the data model in `ARCHITECTURE.md`.

## Interfaces

```ts
type SqlValue = string | number | null;
interface SqlStatement { sql: string; params?: SqlValue[] }

interface SqlExecutor {
  select<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Runs all statements in ONE transaction; all or nothing. */
  batch(statements: SqlStatement[]): Promise<{ rowsAffected: number }[]>;
}

interface Clock { nowIso(): string }   // UTC timestamp for created_at / updated_at
interface IdGenerator { newId(): string }
```

Clock and id generator are injected so tests are deterministic. The data package never calls `Date.now()` or `crypto.randomUUID()` directly outside the default implementations.

## Schema (migration `0001_init.sql`)

Dates are `TEXT` `YYYY-MM-DD` with a `CHECK` using `GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`. Timestamps are ISO-8601 UTC text.

| Table | Columns / rules |
|---|---|
| `schema_migrations` | `version` INTEGER PK, `name`, `checksum`, `applied_at` |
| `workflow` | `id` PK, `name`, `definition_json` NOT NULL, `created_at`, `updated_at` (custom workflows only) |
| `item` | `id` PK, `title` NOT NULL, `role`, `channel`, `workflow_id` NOT NULL, `start_date` NOT NULL, `outcome`, `notes`, `archived_at`, `created_at`, `updated_at` |
| `contact` | `id` PK, `item_id` FK → item `ON DELETE CASCADE`, `name` NOT NULL, `profile_url`, `status` CHECK in (`pending`,`accepted`,`not_accepted`), `created_at` |
| `step_record` | `item_id` FK → item `ON DELETE CASCADE`, `step_key`, `completed_on` (nullable), `skipped` INTEGER 0/1; PK (`item_id`, `step_key`) |
| `app_setting` | `key` PK, `value` (language, theme, reminder time, recipient, SMTP host/port/security/username, upcoming days; **never the password**) |
| `reminder_log` | `id` PK, `date`, `status` CHECK in (`sent`,`failed`), `attempt`, `error`, `created_at`; unique partial index: at most one `sent` row per `date` |

Indexes: `item(archived_at)`, `contact(item_id)`, `reminder_log(date)`.
Every connection sets `PRAGMA foreign_keys = ON`. The test executor does too.

## Tasks

### T2.0 Package scaffold and decisions
Create `packages/data` (`@jobfollo/data`, depends on `@jobfollo/core`), `SqlExecutor`, `Clock`, `IdGenerator`, and a test executor backed by in-memory SQLite. Prefer Node's built-in `node:sqlite` (available on Node 22, prints an experimental warning); ask before adding any npm dependency. Add `packages/data/AGENTS.md` (provided). Merge the ADRs above, add `packages/data` to the root `AGENTS.md` project map and to `docs/ROADMAP.md`. Run `/update-docs`.

### T2.1 Migration runner and `0001_init.sql`
- Migrations are `.sql` files `NNNN_name.sql` in `packages/data/migrations/`, applied in order, each in its own transaction, recorded with a SHA-256 checksum (WebCrypto).
- Re-running is a no-op. If an applied migration's file checksum changed: refuse to start with a clear error. If the DB has a version newer than the app knows: refuse (never downgrade).
- Tests: fresh DB, idempotent re-run, tampered checksum, newer-than-app DB, failing migration rolls back fully, constraints in the schema actually reject bad data (bad date format, bad contact status, duplicate `sent` per date, FK violation).

### T2.2 Workflow repository
`listCustom`, `get(id)` (resolves built-ins from core first), `save(workflow)` (runs `validateWorkflow`, rejects invalid), `delete(id)` (rejects if any item uses it). Built-in ids can never be written to the table. Round-trip test: saved custom workflow loads deep-equal.

### T2.3 Item repository
`create`, `get(id)` → core `Item` (contacts and step records assembled), `list({ includeArchived })`, `update` (partial), `archive` / `unarchive`, `delete`. `create` rejects an unknown `workflowId`. `create` and `delete` are atomic via `batch`. Tests: field round-trip, ordering, cascade delete removes contacts and step records, archived items hidden by default.

### T2.4 Steps, contacts and outcome
`completeStep(itemId, stepKey, completedOn)`, `skipStep`, `undoStep` (removes the record), `setOutcome(itemId, outcome | null)`, contact add / update / remove. Storage only: the aggregate contact-status rule from T1.3 stays in `core`. Tests: completing twice updates rather than duplicates, undo restores the previous schedule when loaded into `computeNextStep`, clearing the outcome resumes the flow, `updated_at` changes via the injected clock.

### T2.5 Settings and reminder log
Typed `getSetting` / `setSetting` with defaults (unknown keys rejected). `ReminderLog`: `recordSent(date)`, `recordFailure(date, error, attempt)`, `wasSentOn(date)`, `lastSentDate()`. Tests: a second `sent` for the same date is rejected, failures can repeat, **a guard test that no setting key can hold an SMTP password** (the settings key list has no password entry).

### T2.6 Restart-persistence integration test
File-based SQLite in a temp directory: migrate, create items across all three built-in workflows with contacts and step records, close, reopen, load, and assert `computeNextStep` and `buildDigest` from `core` give the expected results. This is the Phase 2 exit test.

## Phase 2 notes for later phases
- The Rust commands `db_select` and `db_batch`, and the `SqlExecutor` implementation that calls them, are written in Phase 3 inside `apps/desktop`.
- Phase 4 needs a pure `shouldSendDigest(nowLocal, settings, lastSentDate)` in `core` (so the scheduler's decision is tested, not just its timer). Add it as T1.9 before Phase 4.

## Prompt for any task
```
Task: T2.x from docs/tasks/phase-2-data.md.
Context: read docs/PRD.md, docs/ARCHITECTURE.md, docs/DECISIONS.md, AGENTS.md, packages/core/AGENTS.md and packages/data/AGENTS.md.
Run /new-core-feature adapted for packages/data (tests first). First show me your plan, the test scenarios, and any ambiguity you found in the spec; do not edit files until I approve.
Do not add npm dependencies without asking. Do not touch files outside packages/data and docs/.
```
