# src/roles

`roles.json` holds the shared count list and the roles people pick at setup (decisions 0027, 0029), validated against `schemas/roles.schema.json` and checked against the funding source files at build time.

- **Counts:** one list for every role. Ids use underscores because they become entry log column names. Add new counts at the end. Never delete or relabel one; mark it `"retired": true` and it keeps its column. `tests/scripts/roles.test.ts` pins every released id and label.
- **Roles:** each lists its funding sources, the budget lines it bills under each, the tasks under each line, and the counts each task shows (`count_ids`, in the shared list's order). Rates, NTE and the raise sit on the funding entry; certification on the role. A role never names a person.
- **Quarter-step counts and flat rates (decision 0039):** a count with `"step": "quarter"` steps by 0.25 and is stored in quarter-units. A role's task with `flat_rate` is paid by that count × `cents_per_unit`; its hours are tracked, not billed. Contractors only.
- Ids never change once released. Bump `version` when roles or counts change.

Office instructions: [Editing roles](../../README.md#editing-roles) in the README.
