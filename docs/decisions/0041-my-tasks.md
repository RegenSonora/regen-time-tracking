# 0041 — My Tasks for the Resilience Team Lead

- **Status:** Accepted by Chris, November 17, 2026
- **Spec:** SPEC §2 (offline, data on the phone), §4 (roles), §9 (screens), §10 (field usability), §11 (no sync, no backup)
- **Builds on:** decisions 0018 (picture of a page), 0027 (roles)

## Decision

1. **My Tasks** is a new screen for roles listed in `src/roles/my-tasks.json`. Today only **R-TL01 · Resilience Team Lead** is listed. Other roles see no change.
2. **Two kinds of task:**
   - **From the office:** listed in `my-tasks.json` under the role. One list per role, not per person. The office adds, renames or retires them with an app update. A few times a month is fine.
   - **Added by you:** typed by the person on the phone. They can rename or delete their own tasks; they can't change office tasks.
3. **Office tasks have a priority: Low, Medium or High.** The office sets it in `my-tasks.json`; people can't change it. It shows as a label in words with a color (High red, Medium amber, Low green), so it reads without color too. Tasks people add have no priority. Tasks show in the file's order, which the office controls.
4. **Each task has a status** (Not started, In progress, Blocked, Completed) **and free-form notes.** Both save on the phone as they are typed. No date of the last status change is kept.
5. **Share progress** makes a PNG picture of every task with its status and notes and opens the phone's share sheet. Where the browser can't share files, the pictures download instead (as invoice files do).
   - Text wraps to the picture's width. Each picture has a height limit (1080 × 1920 pixels).
   - **Long notes are never cut off.** When the tasks don't fit on one picture they continue on the next, marked "Page 1 of 2", and every picture is shared together.
   - The picture shows the person's name, the role, the date, and each task with its priority, status and notes. No hours or invoices.
6. **Office task rules** match counts and roles: a task `id` never changes and is never reused. To remove a task, mark it `"retired": true`. It disappears from the screen, and what the person typed for it stays on the phone. Renaming keeps the `id`, so progress carries over.
7. **Stored on the phone only** (data format version 6 adds a `task_progress` store). No backup or sync (SPEC §11). Clearing the browser's data, or changing phones, loses the notes.

## Why

Team Leads track a few ongoing jobs that don't fit time entries, and report on them by text or email. A picture is the easiest thing to send from the field and needs no server.

## Not done

- No status history, reminders or due dates.
- No per-person task lists.
- No import of task files without an update.
