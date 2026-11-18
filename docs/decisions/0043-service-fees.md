# 0043 — Service fees per entry

- **Status:** Accepted by Chris, November 17, 2026
- **Spec:** SPEC §5 (entry flow), §6 (invoice), §7 (files, fingerprint, QR), §11
- **Builds on:** decisions 0024 (task shares), 0039 (flat-rate tasks), 0042 (Regen Catering Contractor)
- **Changes the spec:** SPEC §11's "time only" exception now covers service fees as well as flat rates.

## Decision

1. **A role's task can carry a service fee:** `"entry_fee": { "max_cents": 20000 }`.
   - Each entry with the task checked bills one fee, up to the maximum.
   - The task's hours share is tracked, not billed, as with a flat rate.
   - A task can have both a service fee and a flat rate per count (Wednesday dinner service plus $25.00 per cake).
   - Contractor roles only.
2. **The Counts step shows the fee**, prefilled with the maximum: "Fee for Wednesday dinner service", "Up to $200.00. Lower it if you charged less."
   - The contractor can type any amount from $0.00 up to the maximum.
   - A higher amount, or text that isn't an amount, stops Save with a plain message.
3. **The fee is kept on the entry when it is saved.** A later change to the maximum doesn't change entries already logged.
4. **On the invoice**, each task with fees gets one row per budget line, after the line's hourly row: "Leo's: Wednesday dinner service ×2", "up to $200.00", the total of the fees.
   - A fee of $0.00 bills nothing and isn't counted in the row.
   - The invoice total adds the hourly rows, the flat rows and the fee rows.
   - Home's waiting amount counts the same way.

## Decided during the build

- **Stored data:** data format version 7 adds `fees` (by task id, in cents) to every entry and an entry draft's `fees` (as typed). Older entries get none.
- **Fingerprint:** canonical form v6 adds each entry's fees and the fee rows. v1–v5 are unchanged.
- **QR:** payload v3 adds the fee rows. It is used only when an invoice has fee rows; others keep v2 or v1.
- **Entry log CSV:** a new `fee` column after `rate` shows the row's fee, on part 1 of the entry, blank otherwise. This is the one dollar amount per entry, because the fee is set per entry.
- **Settings** says how each fee task is paid: "Wednesday dinner service: up to $200.00 each entry. Lower it on the entry if you charged less. Its hours are tracked, not billed."

## Why

A catering service is priced per job, not per hour. Sometimes less is charged, so the contractor can lower the fee, but never above the agreed price.
