# 0039 — Flat-rate tasks and quarter-step counts

- **Status:** Accepted by Chris, November 17, 2026
- **Spec:** SPEC §5 (counts), §6 (invoice), §7 (files, fingerprint, QR), §11 (out of scope)
- **Builds on:** decisions 0002 (line order), 0024 (task shares), 0029 (counts), 0038 (Regen Generalist Contractor)
- **Changes the spec:** SPEC §11 "time only" now has one exception, flat-rate tasks.

## Decision

1. **A role's task can be paid a flat rate per count** instead of by the hour. The rate is data on the role's task:
   `"flat_rate": { "count_id": "lehrs_reset", "cents_per_unit": 14000 }`.
   - R-GC01's LEHR reset is the only flat-rate task: $140.00 per LEHR reset.
   - R-TL01 is unchanged.
   - Only contractor roles may have flat-rate tasks. Timesheets stay hours only.
2. **The flat-rate task's hours are tracked, not billed.**
   - An entry can mix LEHR reset with other tasks. Only the LEHR reset share of the hours goes unbilled; the other shares bill hourly as usual (decision 0024).
   - The hours still show on the entry, in the entry log and in My stats.
3. **The fee is its own invoice row**, right after its budget line's hourly row: "Eat Local Network · LEHR resets 2.5 × $140.00 = $350.00".
   - A line with only flat fees shows no hourly row.
   - The invoice total adds the hourly rows and the flat rows.
4. **Quarter-step counts.** A count can be marked `"step": "quarter"`.
   - It steps by 0.25 and shows as a decimal, e.g. 2.5.
   - It is stored as a whole number of quarter-units, the way hours are stored as quarter-hours, so no stored number is a decimal.
   - Fee = quarter-units × cents per unit ÷ 4. The build requires cents per unit to divide by 4, so a fee never needs rounding.
   - A count's step never changes after release.
   - "LEHRs reset" is the only quarter-step count.

## Decided during the build

- **Fingerprint:** canonical form v5 adds each task share's billed flag, the flat rows, the unbilled hours and the quarter-step count ids. v1–v4 are unchanged, and older invoices keep verifying.
- **QR:** payload v2 adds the flat rows. It is used only when an invoice has flat rows; every other invoice keeps payload v1.
- **Stored invoices are not rewritten:**
  - An invoice without flat rows reads as having none.
  - A task share without a billed flag counts as billed.
  - No data upgrade is needed.
- **Entry log CSV:** quarter-step counts are written as decimals, and a new `unbilled_hours` column follows `billed_hours`.
- **Home summary:** the waiting amount on Home counts flat fees and leaves out unbilled hours, the same way the invoice does.

## Why

LEHR resets are paid by the reset, not by the hour. Tracking the hours anyway shows how long resets take, and a half reset (for example, two people sharing one) bills half the fee.
