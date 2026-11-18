# 0045 — Community Care Contractor and trip fees

- **Status:** Accepted by Chris, November 18, 2026
- **Spec:** SPEC §3 (Regen General Operating, roles), §4, §5 (counts), §6 (invoice), §7 (files, fingerprint, QR), §11
- **Builds on:** decisions 0024 (task shares), 0027 (roles), 0029 (counts), 0038 (Community Care Work), 0039 (flat-rate tasks), 0043 (service fees), 0044 (role groups)
- **Changes the spec:** SPEC §11's "time only" exception now covers trip fees too.

## Decision

1. **R-CCC01 · Community Care Contractor** is a new contractor role on Regen General Operating (`chw: false`).
   - No rate is prefilled; the contractor types their rate at setup.
   - No NTE (Regen General Operating has none).
   - Listed under **Community Care Team** on Pick your role.
2. **Budget lines and tasks**, from Chris's role map ("Community Care Contractor", November 17, 2026), in the source's line order:
   - **Other** (`other-contractors`): Other.
   - **Community Care Work** (the existing line, decision 0038):
     - Domestic support: Homes cleaned, In-home meals made, People helped with domestic support.
     - Transportation service: Rides provided, Medical appointments driven to, Miles driven, Resource appointments driven to, Rides dispatched.
     - Other.
3. **Domestic support and Other bill by the hour** at the contractor's rate.
4. **Transportation service is paid per trip.**
   - **One entry is one trip.** The fee comes from that entry's **Miles driven**:

     | Trip miles | Trip fee | Gas reimbursement |
     |---|---|---|
     | 1–30 | $20.00 | — |
     | 31–60 | $40.00 | $20.00 |
     | 61–160 | $60.00 | $40.00 |
     | 161 or more | $80.00 | $60.00 |

   - The task's hours are tracked, not billed, as with a flat rate (decision 0039).
5. **The tiers are data**, `trip_fee` on the role's task in `src/roles/roles.json`:
   `{ "miles_count_id": "miles_driven", "tiers": [{ "from_miles": 1, "to_miles": 30, "fee_cents": 2000 }, …] }`.
   - The build requires tiers that start at 1, run on with no gaps or overlaps, and end with one open tier (no `to_miles`).
   - The miles count must be one of the task's counts and a whole-step count.
   - Contractor roles only. A task can't have both `trip_fee` and `flat_rate` or `entry_fee`.
6. **On the invoice**, after the line's hourly row:
   - One trip row per tier with trips: "Community Care Work: Transportation service, 2 trips 31–60 mi", rate "$40.00", amount $80.00.
   - Then **one gas row per line** with the gas added up, and no tier on it: "Community Care Work: Gas reimbursement", amount $60.00.
   - The invoice total adds hourly, flat, fee, trip and gas rows. Home's waiting amount counts the same way.

## Decided during the build

- **Miles are required.** With Transportation service checked, Save needs Miles driven of at least 1: "Enter the miles for this trip." Miles are whole numbers, as every whole-step count is.
- **A trip that shares an entry** with Domestic support or Other (decision 0024) is still one trip. Only the Transportation service share of the hours goes unbilled.
- **Worked out when the invoice is made**, from the entry's Miles driven and the role's tiers, like flat rates. Nothing new is stored on entries, so there is no data upgrade.
- **Fingerprint:** canonical form v7 adds the trip rows and the gas rows. v1–v6 are unchanged and older invoices keep verifying.
- **QR:** payload v4 adds the trip and gas rows. It is used only when an invoice has them; other invoices keep v3, v2 or v1.
- **Entry log CSV:** two columns after `fee`: `trip_fee` and `gas_reimbursement`, on part 1 of a trip entry, blank otherwise (as `fee` is, decision 0043).
- **Settings** says how the trips are paid: "Transportation service: $20.00 a trip for 1–30 mi, $40.00 + $20.00 gas for 31–60 mi, …. Its hours are tracked, not billed."
- "Other → Other" in the map is read as the line Other with its task Other, as in 0040. "Other" under Community Care Contracting is the Community Care Work task Other.

## Why

Community care drivers are paid by the trip, more for longer trips, with gas money on longer drives. Keeping the gas on its own row separates reimbursement from pay for the bookkeeper.
