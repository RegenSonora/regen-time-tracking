# 0035 — Certified CHW (Employee)

- **Status:** Accepted by Chris, November 16, 2026
- **Spec:** SPEC §3 (funding sources, roles), §4, §5, §7
- **Builds on:** decisions 0027 (roles), 0029 (counts), 0030 (rates), 0031 (employee timesheets), 0032 (CHW behavior)

## Decision

1. **New role CHW-CE01 · Certified CHW (Employee)**, listed after CHW-TE01.
   - `employment: "employee"`: submits timesheets.
   - Rate prefilled at $25.00 on both sources. No raise.
   - No `certification_step`. Certified CHWs are already certified, so they don't earn CHW experience hours and get no "CHW experience hours" line.
   - `chw: false`. Certified CHWs don't track core competencies, so the timesheet PDF and CSV leave off the core competency column, and there's no Work Hours Report. The entry log keeps the column, blank.
2. **Funding: the two existing sources, Regen General Operating and TISUPP.** No new source is made. TISUPP is the same source the CHW Trainee roles bill.
3. **Regen General Operating** gets five new budget lines and their tasks (all with no core competency):
   - **Community Health Work:**
     - Existing tasks: Domestic support, Advocacy, Client follow up, Application assistance, Resource research, Interview and intake, Documentation, Client check in, Resource acquisition, Screening and referrals, Technical assistance, Developing tools/processes, Other.
     - New tasks: Transportation service, CHW internal meetings, Marketing and outreach, Social support, Leo's CHW support, CHW partnership building.
   - **Leo's:** Hosting open hours, Cooking Monday breakfast, Cooking Wednesday dinner, Serving Monday dinner, Serving Wednesday dinner, Hosting Monday breakfast, Hosting Wednesday dinner, Hosting special event, Leo's internal meetings, Leo's maintenance, Leo's marketing, Leo's other.
   - **Eat Local Network:** Eat Local meetings, Eat Local Forum event assistance, Full Moon Garden Party event support, Green Thumb Warriors event support, Green Thumb Warriors planning, Eat Local Network: other.
   - **Admin:** Admin: marketing, Admin: staffing.
   - **Other:** Other. This is a separate line from "Other contractors", which would be the wrong name on an employee timesheet.
4. **Regen General Operating gets an employee certification text**, since CHW-CE01 is its first employee role (decision 0031): "I certify that the hours shown on this timesheet were worked on the dates listed, the hours are accurate, no participant names are included, and these hours have not been reported under any other funding source."
5. **TISUPP** gets one new budget line, **TISUPP Grant**, which holds every TISUPP task for this role:
   - Planning meeting, Quarterly partnership meeting, CHW referral services, Training hours, Developing materials, Listening sessions, Marketing and outreach, Family workshop facilitation, Full Moon Garden Party support, Youth Academy support, Green Thumb Warriors support.
   - Task and count names drop the "TISUPP" prefix, since the source already shows on the entry and the timesheet.
6. **Counts.**
   - Rides provided, Referrals given and Screenings conducted are reused.
   - 38 counts are added at the end of the shared list (decision 0029). The [roles file](../../src/roles/roles.json) has each task's counts.
   - "TISUPP referrals given" stays separate from "Referrals given", as Chris drew them.
7. **Phones with no role** (decision 0027) see the new lines and tasks in their source too. Chris accepted this; they go away when the phone is set up again with a role.

## Decided during the build

- Two counts in Chris's drawing looked like copy slips, so these were used instead:
  - Social support counts "People given social support", not "people helped with TA".
  - Green Thumb Warriors event support counts "Event attendees", not "employees".
- "Value of resources unlocked" is in whole dollars, shown as "500 dollars".
- "Miles driven" is shown as "12 mi".
- "Leo's" is a place, not a person, so it can ship in the public page (decision 0027 §7).

## Why

Certified CHWs on staff do community health work, run Leo's meals and events, support the Eat Local Network, and work on TISUPP programs. Their work isn't progress toward certification. Grouping the work under these lines, with counts for what gets done, gives the office the hours by program and the results it reports.
