# Architecture

## Stack

| Layer | Choice |
|---|---|
| Shell | Tauri 2 (Rust) |
| UI | React + TypeScript (strict) + Tailwind + shadcn/ui |
| Logic | `packages/core` — pure TypeScript, no I/O |
| Storage | SQLite (single file, migrations) |
| Email | `lettre` (Rust) over user-supplied SMTP |
| Secrets | OS keychain via the `keyring` crate |
| i18n | i18next, TR + EN from day one |
| Tests | Vitest (core), Playwright (UI), `cargo test` (Rust) |

## Repo layout

```
jobfollo/
├─ AGENTS.md                 # root agent rules (loaded by Antigravity on every prompt)
├─ README.md  LICENSE
├─ .agents/workflows/        # Antigravity slash-command workflows
├─ .github/                  # CI, issue and PR templates
├─ docs/                     # PRD, architecture, roadmap, decisions, task specs
│  └─ tasks/                 # one spec per phase, one section per agent task
├─ packages/core/            # pure TS domain logic (own AGENTS.md)
│  ├─ src/templates/         # built-in workflow templates (JSON data)
│  └─ test/
├─ packages/data/            # SQLite repositories, migrations, SqlExecutor (own AGENTS.md)
│  ├─ migrations/            # immutable NNNN_name.sql migrations
│  ├─ src/
│  └─ test/
└─ apps/desktop/             # Tauri 2 + React app (own AGENTS.md)
   ├─ src/                   # React UI
   └─ src-tauri/             # Rust: db, mail, keychain, scheduler, tray, autostart
```

## Layering rules

- `core` depends on nothing. It receives `today` as an argument. It never reads the clock, disk or network.
- `data` depends only on `core` and an injected `SqlExecutor`. All SQL and migrations live in `packages/data`.
- UI calls `core` for all workflow/date decisions and `data` for persistence. UI contains presentation only.
- Rust contains **capabilities** (thin transactional SQLite pipe `db_select` / `db_batch`, SMTP send, keychain, tray, timers), never business rules.
- Business rules exist in exactly one place: `core`.

## Core API (draft)

```ts
computeSchedule(item, workflow, today): StepInstance[]
computeNextStep(item, workflow, today): { stepKey, title, dueDate, daysLeft } | null
buildDigest(items, workflows, today, opts): { overdue: Row[]; today: Row[]; upcoming: Row[] }
renderDigest(digest, locale): { subject: string; text: string; html: string }
```

## Workflow data format

A step is due `offsetDays` after its anchor. `runIf` is limited to a small fixed vocabulary (contact status), not arbitrary expressions. Optional `names` and `titles` maps provide localized labels (`{ en, tr }`) with fallback to the required plain `name` / `title` (see ADR-012).

```json
{
  "id": "job-application-networking",
  "name": "Job application + networking",
  "names": { "en": "Job application + networking", "tr": "İş başvurusu + networking" },
  "steps": [
    {
      "key": "apply",
      "title": "Apply (mail or site)",
      "titles": { "en": "Apply (mail or site)", "tr": "Başvur (e-posta veya site)" },
      "anchor": "start",
      "offsetDays": 0
    },
    { "key": "connect_request", "title": "Send LinkedIn connection request", "anchor": "step:apply", "offsetDays": 0 },
    { "key": "check_accept", "title": "Check if connection accepted", "anchor": "step:connect_request", "offsetDays": 1, "records": "contactStatus" },
    { "key": "first_message", "title": "Send first message", "anchor": "step:check_accept", "offsetDays": 0, "runIf": { "contactStatus": "accepted" } },
    { "key": "followup_1", "title": "Reminder 1", "anchor": "start", "offsetDays": 7 },
    { "key": "followup_2", "title": "Reminder 2", "anchor": "start", "offsetDays": 14 },
    { "key": "close", "title": "Mark as negative", "anchor": "step:followup_2", "offsetDays": 3, "suggestsOutcome": "negative" }
  ],
  "stopOutcomes": ["reply", "interview", "offer", "negative"]
}
```

## Data model

`schema_migrations`, `workflow` (custom workflows only; built-ins resolve from `core`), `item`, `contact`, `step_record`, `app_setting` (no secrets), `reminder_log` (date, status, attempt, error, unique partial index for at most one `sent` per `date`).
Dates are stored as `YYYY-MM-DD` local calendar dates (no timezone math for due dates); timestamps are ISO-8601 UTC text. Outcomes are plain text ids on `item.outcome` (no `outcome_definition` table in MVP; see ADR-008).

## Rust IPC contract

The Rust shell (`apps/desktop/src-tauri`) registers only three commands for database access (see ADR-006):

- `db_select(sql: string, params?: value[]) -> Array<Record<string, value>>` — read-only queries (`Statement::readonly() == true`). Missing `params` defaults to `[]`. Rejects duplicate column names in a result set.
- `db_batch(statements: Array<{ sql: string; params?: value[] }>) -> Array<{ rowsAffected: number }>` — write-only batch executed in one `BEGIN IMMEDIATE` transaction; any failing statement rolls back all statements and reports the 0-based statement index. Rejects row-returning statements.
- `data_location() -> string` — absolute path of the folder containing `jobfollo.db`.

For email reminders (see ADR-013), Rust also exposes four capability-only mail commands:
- `smtp_set_password(password: string)` — stores the SMTP password in the OS keychain (`io.github.onuraydi.jobfollo` / `smtp_password`).
- `smtp_has_password() -> boolean` — reports whether an SMTP password is present in the OS keychain without returning the secret.
- `smtp_delete_password()` — removes the stored SMTP password from the OS keychain.
- `send_email(request)` — reads the password from the OS keychain in Rust, sends the email over `STARTTLS` or `TLS` via `lettre`, and scrubs any credential text from errors before returning `{ kind, message }`.

Rules and limits:
- Parameters accept JSON `null`, `i64` integer, finite `f64` real, and `string` (booleans, arrays, objects, and out-of-range integers fail with `invalid_argument`).
- Result values convert `INTEGER` (within ±2^53), finite `REAL`, valid UTF-8 `TEXT`, and `NULL`; `BLOB` and out-of-range integers fail.
- Limits: max `2,000` statements per batch, max `1,000,000` bytes per SQL string, max `50,000` rows per `db_select` (exceeding returns `limit`).
- Open-time pragmas (`foreign_keys = ON`, `journal_mode = WAL`, `busy_timeout = 5000`, `synchronous = NORMAL`) run before a SQLite authorizer is installed that denies `ATTACH`, `DETACH`, all `PRAGMA`, `CREATE/DROP VIRTUAL TABLE`, and `load_extension`.
- Errors serialize as `{ kind: "constraint" | "busy" | "sql" | "io" | "open" | "invalid_argument" | "forbidden" | "limit", message: string }`. Error messages never include bound parameter values. If opening the database fails at startup, the app still starts and `db_select`/`db_batch` return `kind: "open"`.
- The TypeScript bridge (`apps/desktop/src/db/`) validates parameters before IPC, adds the client-only error kind `"ipc"` for malformed or non-contractual IPC responses/rejections, and shares literal camelCase JSON contract fixtures with Rust via `apps/desktop/contract/ipc-fixtures.json`.

## Boot sequence

Desktop startup runs through a single-flight `bootstrap()` controller (`apps/desktop/src/boot/`) so React StrictMode double-mounts and concurrent callers never run migrations twice:

1. **Environment check** — actively exercises `crypto.getRandomValues` and `crypto.subtle.digest("SHA-256", ...)`. If unavailable, boot stops with `unsupported_environment` before touching IPC or SQLite.
2. **Data location** — reads `data_location()` best-effort (a failure is non-fatal and yields `null`).
3. **Migrations** — runs `runMigrations` from `@jobfollo/data` against the Tauri SQLite executor.
4. **Services** — builds `@jobfollo/data` repositories, system UTC `Clock`, WebCrypto `IdGenerator` (falling back to RFC 4122 UUID v4 via `getRandomValues`), `localToday()`, and `dataLocation`.

Boot errors are classified strictly by `instanceof` (typed `MigrationError` subclasses) and `SqlExecutionError.kind` (never by message text) into: `unsupported_environment`, `open_failed`, `database_busy`, `database_io`, `database_newer`, `migration_checksum`, `migration_invalid`, `migration_failed`, and `unknown`. Boot UI uses a self-contained TR/EN dictionary driven by `navigator.language`, never offers delete/reset/recreate, and never modifies the database on error.

## Email reminder subsystem

1. **Scheduler (clock).** A Rust interval (every 60 s) checks: is it past the configured send time, and is there no successful `reminder_log` row for today? If so it emits a `reminder:due` event.
2. **Digest.** The UI layer (kept alive while the window is hidden in the tray) calls `buildDigest` + `renderDigest` from `core`, then invokes the Rust command `send_digest(subject, text, html)`.
3. **Send.** Rust reads SMTP credentials from the keychain, sends via `lettre`, returns success or a typed error.
4. **Log.** Result is written to `reminder_log`. On failure: backoff, max 3 attempts per day, error shown in Settings. The error text passed to `recordFailure` must never contain credentials, and the Rust side scrubs it before returning errors to the UI.
5. **Catch-up.** The same check runs at startup and on resume from sleep.

**Known risk (spike required in Phase 4):** hidden webviews may be throttled or suspended on some OSes. If the spike shows unreliable behaviour, the fallback is to run `buildDigest` in a headless Node sidecar or compile `core` to WASM called from Rust. Because `core` is pure, either move is cheap. Do not duplicate business rules in Rust.

## Security and privacy

- No telemetry, no analytics, no auto-update pings in v0.1 (updater, if added later, is opt-in).
- Strict CSP in `tauri.conf.json`: bundled content only, no remote origins, no `unsafe-eval`, devtools off in release builds. External profile links open via `tauri-plugin-opener` scoped strictly to `http://` and `https://`.
- SMTP password lives only in the OS keychain. Never logged, never exported, never in backups.
- Backups are the SQLite file (and exports) only.
- Email digests contain item names and are sent to the user's own mailbox through the user's own SMTP server. Settings screen says so.
