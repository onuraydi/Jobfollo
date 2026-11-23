# Manual Smoke Tests — Phase 3 (`phase-3-ui`)

Run this checklist on your target OS (Windows, macOS, or Linux) using a freshly built desktop app (`pnpm --filter @jobfollo/desktop tauri dev` or `pnpm --filter @jobfollo/desktop tauri build`) before tagging `phase-3-ui`.

## 1. Fresh install & first launch
- [ ] Start with an empty app data directory (no existing `jobfollo.db`).
- [ ] App opens cleanly with no console errors and shows the **Today** screen empty state ("No items yet" / "Henüz kayıt yok").
- [ ] Open **Settings** and confirm the read-only **Database location** points to the expected OS app data directory (`io.github.onuraydi.jobfollo/jobfollo.db`).

## 2. Create item & validation
- [ ] Navigate to **Items** and press `N` to open the Create dialog.
- [ ] Submit with an empty title and an invalid profile URL (`javascript:alert(1)`): verify per-field validation errors appear and nothing is saved.
- [ ] Fill valid details (title, role, workflow, start date = today, optional contact with an `https://` URL) and submit.
- [ ] Confirm the item appears in the **Items** table with its localized workflow name and next step.

## 3. Complete steps, contact dialog & undo
- [ ] Go to **Today** and verify the new item's due step appears in the **Due today** group.
- [ ] Click **Done** on the first step: verify it moves/updates and an **Undo** toast appears (mentioning contact statuses are not reverted).
- [ ] Click **Undo** and confirm the step returns; then complete it again.
- [ ] Reach a step that records connection status (`check_accept`), click **Done**, choose **Accepted** vs **Not accepted**, and verify the next scheduled step follows the branch (`first_message` vs `followup_1`).

## 4. Item detail, safe links, notes & delete
- [ ] Open the item detail view (`/items/:id`).
- [ ] Edit the header (title/role) and verify changes persist.
- [ ] Click an `https://` contact profile link and confirm it opens in the system default browser.
- [ ] Type into **Notes**, verify the "Unsaved changes" indicator appears, and confirm clicking **Back** prompts before discarding. Click **Save** and confirm it persists.
- [ ] Change **Outcome** to **Negative** and confirm pending steps change to **Stopped**; change back to **In progress** and confirm steps resume.
- [ ] Create a throwaway item, click **Delete item**, verify the confirmation dialog names the item, confirm deletion, and verify it is removed.

## 5. Restart persistence
- [ ] Quit the app completely and relaunch it.
- [ ] Verify all created items, completed steps, contacts, notes, and outcome selections are intact.

## 6. Newer-database refusal
- [ ] Back up `jobfollo.db`, then bump `PRAGMA user_version` (or insert a future version row into `schema_migrations`) to simulate a database from a newer app version.
- [ ] Relaunch the app and confirm it refuses to open with the localized **newer-database** boot error screen (showing the database location) instead of corrupting or overwriting data.
- [ ] Restore the backed-up `jobfollo.db` and verify normal launch resumes.

## 7. Theme & language switching
- [ ] In **Settings**, switch between **Light**, **Dark**, and **System** themes: verify contrast, focus rings, and status chips remain clear in both themes.
- [ ] Switch between **English**, **Türkçe**, and **System**: verify all navigation, headings, workflow names, step titles, outcomes, and dates update immediately and persist across restart.

## 8. Offline behavior
- [ ] Disconnect from the internet (airplane mode / disable Wi-Fi).
- [ ] Launch the app, create/edit items, complete steps, and switch settings: confirm everything works identically with zero network requests or errors.
