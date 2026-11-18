# schemas

JSON Schemas.

- `funding-source.schema.json`: one funding source file in `src/funding-sources/` (SPEC §3). `pnpm build` and `pnpm check:sources` validate every source file against it, plus unique ids and names, real dates and a period that doesn't end before it starts (`scripts/lib/funding-sources.mjs`).
- `roles.schema.json`: `src/roles/roles.json`, the shared count list and the roles (decisions 0027, 0029). The same commands validate it, then check it against the source files: every source, budget line, task and count a role names must exist, ids, codes and count labels are unique, and more (`scripts/lib/roles.mjs`, roles plan R1).
- `my-tasks.schema.json`: `src/roles/my-tasks.json`, the office's My Tasks per role, each with a required `priority` of `low`, `medium` or `high` (decision 0041). The same commands validate it, then check every role id exists in `roles.json` and no task id repeats within a role (`scripts/lib/my-tasks.mjs`).
