# 0040 — Resilience Contractor

- **Status:** Accepted by Chris, November 17, 2026
- **Spec:** SPEC §3 (Regen General Operating, roles), §4, §6
- **Builds on:** decisions 0027 (roles), 0029 (counts), 0030 (rates), 0038 (Regen Generalist Contractor), 0039 (flat-rate tasks)

## Decision

1. **R-C01 · Resilience Contractor** is a new contractor role on Regen General Operating (`chw: false`). It uses the code the roles plan set aside for it.
   - No rate is prefilled. The contractor types their rate at setup.
   - No NTE (Regen General Operating has none).
2. **Budget lines and tasks**, from Chris's role map ("Resilience Contractor", November 17, 2026), in the source's line order:
   - **Fire risk reduction work:** Residential fuel reduction, Municipal fuel reduction and Dump runs, each counting Trailer loads removed.
   - **Maintenance labor:** Pinal garden maintenance, Regen lot clean and maintenance, LEHR reset, Leo's maintenance.
   - **Resilient Home Services contracting:** the same five tasks and counts as R-TL01.
   - **Other** (`other-contractors`): Other.
3. **LEHR reset is paid like R-GC01's** (decision 0039):
   - $140.00 per LEHR reset, counted as "LEHRs reset" in 0.25 steps.
   - Its hours are tracked, not billed.
   - On this role the task counts LEHRs reset only.
4. **Nothing is added to the source or the count list.** Every line, task and count already exists.

## Decided during the build (readings of the role map)

- "LEHR Resets Complete" hangs off Maintenance labor with no link type. It is read as the LEHR reset task.
- Dump runs has no count in the map. It counts Trailer loads removed, as on R-TL01.
- "Other → Other" has no link type. It is read as the line Other with its task Other.

## Why

Resilience Contractors do the Team Lead's field work without assessing. They are paid per LEHR reset, as Regen Generalists are.
