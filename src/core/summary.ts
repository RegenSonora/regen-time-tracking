// Home's "Not yet invoiced" line (SPEC §5): entry count, hours and amount for one source.
import { uninvoicedEntries } from './invoice';
import { flatAmountCents, lineAmountCents, sumCents } from './money';
import { flatRates } from './roles';
import { checkEntryTimes } from './time';
import type { CountDef, Entry, Role } from './types';

export interface UninvoicedSummary {
  count: number;
  quarters: number;
  /** Null until the source has a rate. */
  amount_cents: number | null;
}

/**
 * Rounded the way the invoice is: billed quarters summed per budget line, each line amount
 * rounded once, plus flat-rate fees, then added (SPEC §6, decision 0039). So this always equals
 * the invoice the Generate button would make. `quarters` counts every tracked hour, billed or not.
 */
export function uninvoicedSummary(
  entries: readonly Entry[],
  sourceId: string,
  rateCents: number | null,
  roles: readonly Role[] = [],
  countDefs: readonly Pick<CountDef, 'id' | 'step'>[] = [],
): UninvoicedSummary {
  const open = uninvoicedEntries(entries, sourceId);
  const perLine = new Map<string, number>();
  // Flat quarter-units per role, line, task and count, summed before the fee is worked out.
  const flatUnits = new Map<string, { units: number; cents: number }>();
  let quarters = 0;
  for (const e of open) {
    const times = checkEntryTimes(e.start, e.stop, e.breaks);
    if (!times.ok) continue;
    quarters += times.quarters;
    const rates = flatRates(
      roles.find((r) => r.id === e.role_id),
      sourceId,
    ).get(e.budget_line_id);
    let billed = 0;
    for (const share of e.tasks) {
      const rate = rates?.get(share.task_id);
      if (!rate) {
        billed += share.quarters;
        continue;
      }
      const key = [e.role_id, e.budget_line_id, share.task_id, rate.count_id].join('|');
      const seen = flatUnits.get(key) ?? { units: 0, cents: rate.cents_per_unit };
      const perUnit = countDefs.find((c) => c.id === rate.count_id)?.step === 'quarter' ? 1 : 4;
      seen.units += (e.counts.values[rate.count_id] ?? 0) * perUnit;
      flatUnits.set(key, seen);
    }
    perLine.set(e.budget_line_id, (perLine.get(e.budget_line_id) ?? 0) + billed);
  }
  return {
    count: open.length,
    quarters,
    amount_cents:
      rateCents === null
        ? null
        : sumCents([
            ...[...perLine.values()].map((q) => lineAmountCents(q, rateCents)),
            ...[...flatUnits.values()].map((f) => flatAmountCents(f.units, f.cents)),
          ]),
  };
}
