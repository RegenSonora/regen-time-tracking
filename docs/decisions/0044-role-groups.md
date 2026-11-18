# 0044 — Role groups on Pick your role

- **Status:** Accepted by Chris, November 18, 2026
- **Spec:** SPEC §4 (setup)
- **Builds on:** decision 0027 (roles)

## Decision

1. **Pick your role lists the roles under bold headings**, in this order:
   - **Community Care Team:** CHW Trainee (Contractor), CHW Trainee (Employee), Certified CHW (Employee).
   - **Community Resilience:** Resilience Team Lead, Resilience Contractor.
   - **Other Roles:** Regen Catering Contractor, Regen Generalist Contractor.
2. **The groups are data**, kept in `role_groups` in `src/roles/roles.json`. Each group has a name and its role ids in order. The office changes them with an app update, like roles.
3. **Build checks:**
   - Every active role is in exactly one group.
   - Every role id in a group exists.
   - Group names are unique.
4. Retired roles and groups with no active role don't show. A roles file without `role_groups` lists roles in file order with no headings, as before.

## Why

With seven roles, people find theirs faster under the program they work in.
