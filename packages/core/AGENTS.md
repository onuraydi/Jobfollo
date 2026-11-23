# AGENTS.md — packages/core

Pure domain logic. Stricter than the root rules:

- No imports from Node, DOM, Tauri or any I/O library. Only TypeScript and tests.
- No `Date.now()`, `new Date()` without arguments, `Math.random()` or global mutable state. All time input is an `ISODate` (`YYYY-MM-DD`) argument.
- Dates are local calendar dates stored as `YYYY-MM-DD`. Do all day arithmetic on integers (e.g. days since epoch computed with `Date.UTC`), never with local-time `Date` objects, so DST never shifts a due date.
- Functions are pure and return new values; never mutate inputs.
- Public API is exported only from `src/index.ts`.
- Every exported function has tests in `test/`. Table-driven tests preferred.
- No runtime dependencies without approval. Validation of workflow JSON is hand-written.
- Built-in workflow templates are JSON under `src/templates/` and are validated by tests.

Scenario list for tests: `docs/tasks/phase-1-core.md`.
