# AGENTS.md — apps/desktop

Tauri 2 + React + TypeScript (strict) + Tailwind + shadcn/ui. Not scaffolded yet (Phase 3).

- UI is presentation only. Call `@jobfollo/core` for every date, schedule and digest decision.
- Rust (`src-tauri`) exposes capabilities only: SQLite access, SMTP send, keychain, tray, autostart, timers. No business rules in Rust.
- All strings through i18next (`tr`, `en`). No hardcoded UI text.
- Support light and dark themes; keyboard-accessible; visible focus states.
- SMTP credentials: OS keychain only (`keyring` crate). Never persisted elsewhere or logged.
- Create the app with the official Tauri scaffolding (`pnpm create tauri-app`) inside this folder; ask before choosing template options that differ from `docs/ARCHITECTURE.md`.
