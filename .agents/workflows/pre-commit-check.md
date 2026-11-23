---
description: Run all checks before committing
---

# Pre-commit check

1. Run `pnpm typecheck`. Fix every error.
2. Run `pnpm test`. All tests must pass.
3. If `apps/desktop/src-tauri` exists, run `cargo test` and `cargo clippy -- -D warnings` there.
4. Search the diff for secrets, `console.log` of credentials, `Date.now()` / `new Date()` inside `packages/core`, and hardcoded UI strings. Remove any found.
5. Summarize what changed and propose a Conventional Commit message.
