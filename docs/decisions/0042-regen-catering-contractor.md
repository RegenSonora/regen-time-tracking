# 0042 — Regen Catering Contractor

- **Status:** Accepted by Chris, November 17, 2026
- **Spec:** SPEC §3 (Regen General Operating, roles), §4, §6
- **Builds on:** decisions 0027 (roles), 0029 (counts), 0030 (rates), 0039 (flat-rate tasks), 0043 (service fees)

## Decision

1. **R-CC01 · Regen Catering Contractor** is a new contractor role on Regen General Operating (`chw: false`).
   - Rate prefilled at **$20.00**, for the tasks billed by the hour.
   - No NTE (Regen General Operating has none).
2. **Budget lines and tasks**, from Chris's role map ("Regen Catering Contractor", November 17, 2026), in the source's line order:
   - **Maintenance labor:** Leo's maintenance, Garden maintenance, Vehicle maintenance, Other maintenance.
   - **Other** (`other-contractors`): Other.
   - **Leo's:** Monday breakfast service, Wednesday dinner service, Leo's internal meetings, Leo's maintenance, Hosting special event, Leo's other.
   - **Eat Local Network:** Eat Local Forum event assistance, Full Moon Garden Party event support, Gleaning, Food processing, Garden maintenance, Eat Local Network: other.
3. **Counts:**
   - Monday breakfast service: Meals cooked, Meals served.
   - Wednesday dinner service: Meals cooked, Meals served, **Cakes made** (new).
   - Hosting special event: Special events hosted, Meals served.
   - Full Moon Garden Party event support: Meals cooked, Meals served, **Generators rented** (new).
   - Eat Local Forum event assistance: Event attendees.
   - Gleaning: Food gleaned.
   - Food processing: Food processed.
4. **How the catering tasks are paid:**
   - **Monday breakfast service, Wednesday dinner service and Full Moon Garden Party event support:** a service fee of up to $200.00 per entry (decision 0043). Their hours are tracked, not billed.
   - **Cakes made:** $25.00 per cake, whole cakes only, on top of the Wednesday dinner fee (a flat rate per count, decision 0039).
   - **Generators rented:** $25.00 per generator, whole numbers only, on top of the Full Moon Garden Party fee.
   - Every other task is billed by the hour.
5. **Four new Regen General Operating tasks:** Monday breakfast service, Wednesday dinner service, Vehicle maintenance, Other maintenance.

## Decided during the build (readings of the role map)

- "Leo's Special Events" uses the existing task **Hosting special event**.
- Two links had no type (Monday breakfast service → meals served, and Full Moon Garden Party → meals served). Both are read as counts.

## Why

The catering contractor is paid per service for meals and events, with cakes and generators paid as extras, and by the hour for upkeep work.
