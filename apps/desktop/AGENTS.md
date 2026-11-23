# AGENTS.md — apps/desktop

Tauri 2 + React + TypeScript (strict) + Tailwind + shadcn/ui.

- UI is presentation only. Call `@jobfollo/core` for every date, schedule and digest decision.
- Never parse an ISO date with `new Date("YYYY-MM-DD")`, and never derive `today` from `toISOString()`. Use `localToday()` and `new Date(y, m - 1, d)`.
- All writes go through `@jobfollo/data` repositories; no SQL in `apps/desktop/src`. Only `db_select`, `db_batch` and `data_location` exist on the Rust side; adding a command needs an ADR.
- Rust (`src-tauri`) exposes capabilities only: SQLite access, SMTP send, keychain, tray, autostart, timers. Rust holds no business rules. The `db` module has no Tauri types.
- Every user-visible string uses i18n keys (TR + EN); outcome and workflow labels come from i18n or template `titles`, never from raw ids.
- Support light and dark themes; keyboard-accessible; visible focus states.
- Links from user data open only through `tauri-plugin-opener` and only if `http:` or `https:`.
- Do not import `@jobfollo/data/testing` from app code.
- No network access from the webview; the CSP in `tauri.conf.json` must stay strict.
- SMTP credentials: OS keychain only (`keyring` crate). Never persisted elsewhere or logged.
- No new dependency outside the pre-approved list in `docs/tasks/phase-3-ui.md` without asking.
