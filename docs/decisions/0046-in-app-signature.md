# 0046 — Typed signature applied in the app

- **Status:** Accepted by Chris, November 19, 2026
- **Spec:** SPEC §4 (setup, settings), §6, §7 (PDF page 1), §8 (signatures), §11 (out of scope). Changes §8 and §11: the person's own signature is now applied in the app.
- **Builds on:** decisions 0018 (invoice picture), 0031 (employee timesheets), 0034 (contractor and employee wording)

## Decision

1. **Every role signs in the app.** Contractors sign the **Contractor** box on page 1 of an invoice; employees sign the **Employee** box on page 1 of a timesheet. It follows the role's `employment`, so new roles are covered with no change.
2. **The signature is typed, not drawn:** `/s/ ` followed by the name in Your details, for example `/s/ Jane Doe`, printed in italic. A small line under it reads "Signed electronically in Regen Time Tracking". The date it was applied prints on the box's **Date** line.
3. **Adopt once.** Setup ends its details step with a "Your signature" card that previews the stamp and a check box: "I adopt this as my electronic signature on invoices and timesheets." Until it is checked, Next stays on the step and says "Check the box to adopt your signature." next to the box. Phones set up earlier adopt it in Settings, under "Your signature", with the same check box and **Adopt signature**. Settings can also **Remove signature**.
4. **A name change undoes the adoption.** Saving a different name in Settings removes the signature, and Settings says so. The person adopts the new one. A signature never prints a name the person didn't adopt.
5. **Apply per invoice.** On New invoice (New timesheet), the main button is **Apply signature**. Tapping it shows the stamp and "Signed <today>", and the button becomes **Create invoice files** (Create timesheet files), with **Undo signature** under it. With no signature adopted, the button is gray, reads "Add signature in Settings", and opens Settings at **Your signature**. It is a working button, not marked disabled, so screen readers announce what it does. The signed date always matches the invoice date: if midnight passes between Apply and Create, nothing is created, the signature is taken back, and the preview says "It's a new day. Apply your signature again."
6. **Frozen with the invoice.** The invoice record keeps the stamp text, when it was adopted and when it was applied (`signed_at`). Re-sharing gives the same signed files. Invoices made before this change have no signature and print as before.
7. **The fingerprint does not change.** The signature is printed on page 1 and the picture, but it is not part of any canonical form, so no new canonical version is needed, and it is not in the QR code or the CSV files.
8. **Everyone else signs as before.** The reviewer (contractors) and the supervisor (employees) still sign the PDF or the picture outside the app. The office still signs on paper.

## Why

Signing in Markup or Fill & Sign was the hardest step for people in the field. A typed, adopted signature applied with a tap is a common electronic-signature pattern, costs about 60 bytes per PDF, needs no drawing pad, and works for people who can't draw on a screen. A drawn signature was considered and set aside: about twice the work for the same legal effect.

## Open item

Chris to confirm with TISUPP and ADHS that a typed electronic signature is accepted on invoices, timesheets and attestation hours.
