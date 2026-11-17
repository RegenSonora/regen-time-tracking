# 0036 — CHW Trainee (Employee) on Regen General Operating

- **Status:** Accepted by Chris, November 16, 2026
- **Spec:** SPEC §3 (Regen General Operating, roles), §4, §6 (raise reminder, My stats)
- **Builds on:** decisions 0027 (roles), 0029 (counts), 0030 (rates and the pay raise), 0031 (employee timesheets), 0032 (CHW behavior and My stats), 0035 (Certified CHW)

## Decision

1. **CHW-TE01 · CHW Trainee (Employee) bills Regen General Operating too**, listed after TISUPP.
   - Rate prefilled at $20.00, with the same raise as TISUPP: $23.00 after 240 hours.
   - No NTE (employee, decision 0031).
   - Timesheets use Regen General Operating's employee certification text (decision 0035).
2. **Regen General Operating gets a CHW experience hours line**, with the same id and name as TISUPP's (`chw-experience-hours`). On CHW-TE01 it holds the same 21 tasks as the role's TISUPP line, in the same order and with the same counts. The tasks already exist in the source, with their core competencies.
3. **The pay raise counts both sources together.**
   - A role has one raise. It counts the hours invoiced or submitted, plus the hours still waiting, on every source of the role whose funding entry has the raise.
   - **Reminder:** shows on each of those sources until that source's own rate is $23.00.
   - **My stats:** "Hrs needed for pay increase" counts the combined hours. The raise shows as reached until every source's rate is changed.
   - **Build check:** every `rate_step` on a role must match.
4. **CHW Cert (480 hours) and the Work Hours Report count both sources.** No change was needed: they already add up every source of the role (decision 0032).
5. **CHW-TC01 · CHW Trainee (Contractor) doesn't change.** It stays on TISUPP only, so its raise still counts TISUPP hours alone.

## Why

Trainees on staff do the same CHW work whether Regen General Operating or TISUPP pays for it. Their raise and certification depend on the CHW hours they've worked, not on which source paid, so the hours are added together.
