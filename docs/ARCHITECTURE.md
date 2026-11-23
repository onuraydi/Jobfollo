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

## Workflow data format (draft)

A step is due `offsetDays` after its anchor. `runIf` is limited to a small fixed vocabulary (contact status), not arbitrary expressions.

```json
{
  "id": "job-application-networking",
  "steps": [
    { "key": "apply",           "title": "Apply (mail or site)",          "anchor": "start",             "offsetDays": 0 },
    { "key": "connect_request", "title": "Send LinkedIn connection request","anchor": "step:apply",       "offsetDays": 0 },
    { "key": "check_accept",    "title": "Check if connection accepted",  "anchor": "step:connect_request","offsetDays": 1, "records": "contactStatus" },
    { "key": "first_message",   "title": "Send first message",            "anchor": "step:check_accept", "offsetDays": 0, "runIf": { "contactStatus": "accepted" } },
    { "key": "followup_1",      "title": "Reminder 1",                    "anchor": "start",             "offsetDays": 7 },
    { "key": "followup_2",      "title": "Reminder 2",                    "anchor": "start",             "offsetDays": 14 },
    { "key": "close",           "title": "Mark as negative",              "anchor": "step:followup_2",   "offsetDays": 3, "suggestsOutcome": "negative" }
  ],
  "stopOutcomes": ["reply", "interview", "offer", "negative"]
}
```

## Data model

`schema_migrations`, `workflow` (custom workflows only; built-ins resolve from `core`), `item`, `contact`, `step_record`, `app_setting` (no secrets), `reminder_log` (date, status, attempt, error, unique partial index for at most one `sent` per `date`).
Dates are stored as `YYYY-MM-DD` local calendar dates (no timezone math for due dates); timestamps are ISO-8601 UTC text. Outcomes are plain text ids on `item.outcome` (no `outcome_definition` table in MVP; see ADR-008).

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
