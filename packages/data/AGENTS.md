# AGENTS.md — packages/data

Persistence layer. Repositories over SQLite, written against an injected `SqlExecutor`.

- No imports from Tauri, the DOM or any UI code. The only database access is through `SqlExecutor`.
- **Parameterized SQL only.** Never build SQL by concatenating user input. Table and column names are literals in the code.
- **Multi-statement writes go through `executor.batch`** so they are atomic. Never issue `BEGIN` / `COMMIT` yourself.
- No business rules. Scheduling, next-step, digest and contact-status aggregation stay in `@jobfollo/core`. Repositories store and load; they return core's `Item` and `Workflow` types.
- Time and ids are injected (`Clock`, `IdGenerator`). Never call `Date.now()`, `new Date()` or `crypto.randomUUID()` outside the default implementations.
- Released migrations are immutable: add a new `NNNN_name.sql`. The runner verifies checksums.
- Never store secrets. The SMTP password lives only in the OS keychain; no table or setting key may hold it.
- Schema constraints (CHECKs, foreign keys, unique indexes) are part of the contract and must have tests proving they reject bad data.
- Dependencies need approval. Tests use `node:sqlite` (Node 22+) unless told otherwise.

Spec and task list: `docs/tasks/phase-2-data.md`.
