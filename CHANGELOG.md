# Changelog

All notable changes to **Jobfollo** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-25

### Added
- **Core scheduling & domain engine (`@jobfollo/core`):**
  - Workflow validation, deterministic schedule computation, next-step resolution, outcome-based flow stopping, business-day-only mode (skip weekends), snooze support, daily digest builder & TR/EN text/HTML renderer, `.ics` calendar exporter, local funnel analytics, and email/message template rendering.
- **Local SQLite persistence (`@jobfollo/data`):**
  - Checksummed migration runner with 4 migrations (`0001_init`, `0002_item_details`, `0003_application_type`, `0004_message_templates`), repositories for workflows, items, settings, reminder logs, and custom message templates.
- **Desktop application (`@jobfollo/desktop` — Tauri 2 + React 19):**
  - **Today** dashboard with overdue/today/upcoming grouping, 1-click completion, Undo, Snooze, and contact status prompt.
  - Dedicated **Job Postings**, **General Applications**, and **All Items** views with Table + Kanban board, KPI summary strip, rich filters, bulk actions, and CSV import/export.
  - **Item Detail** view with step timeline, contacts CRUD, notes with unsaved-changes guard, and `.ics` export.
  - **Monthly Calendar** and **Local Statistics** (conversion funnel + weekly application goal).
  - **Email & Message Templates** library with 6 built-in TR/EN templates, custom template CRUD, live item preview, 1-click copy, and `mailto:` handoff.
  - **Workflow Editor** for duplicating built-ins and creating custom multi-step cadences.
  - **Reminders & System Tray:** Local OS desktop notifications, SMTP daily email digest with OS keychain credential storage, minimize-to-tray, launch-at-login, and JSON backup/restore.
  - **Personalization:** Turkish & English UI, Light/Dark/System themes, 5 color palettes, 4 offline fonts, comfortable/compact density, and `Ctrl+K` Command Palette.
- **Packaging & Open Source:**
  - Cross-platform GitHub Actions release pipeline (Windows `.exe`/`.msi`, macOS Apple Silicon & Intel `.dmg`, Linux `.AppImage`/`.deb`).
  - Bilingual GitHub Pages landing website (`site/`) and community templates (`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`).
