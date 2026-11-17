// Raise reminder, CHW certification and My stats by role (decisions 0030, 0032). Goals count
// invoiced or submitted hours only, as the office's records do.
import { sumCounts } from './counts';
import type { RateStepReminder } from './rate-change';
import type { CertificationStat, PayStat } from './stats';
import { invoicedQuartersIn } from './stats';
import type { CountDef, Invoice, Role, RoleFunding } from './types';

/**
 * The sources whose hours count toward the role's raise: every funding entry with a `rate_step`.
 * A role has one raise; the build check keeps its steps equal (decision 0036).
 */
export function raiseSourceIds(role: Role): string[] {
  return role.funding.filter((f) => f.rate_step).map((f) => f.source_id);
}

/**
 * A reminder on this funding entry once the role's billed plus waiting hours, added over its
 * raise sources, reach the rate step, until this source's rate is at least the new rate.
 * `waitingQuarters` is the waiting hours on those same sources. The app never changes the rate
 * itself (decisions 0030, 0036).
 */
export function raiseStatus(
  role: Role,
  funding: RoleFunding,
  rateCents: number | null,
  invoices: readonly Invoice[],
  waitingQuarters: number,
): RateStepReminder | null {
  const step = funding.rate_step;
  if (!step || rateCents === null || rateCents >= step.rate_cents) return null;
  const billed = invoicedQuartersIn(raiseSourceIds(role), invoices);
  if (billed + waitingQuarters < step.after_quarters) return null;
  return {
    invoice_first: billed < step.after_quarters,
    after_quarters: step.after_quarters,
    rate_cents: step.rate_cents,
  };
}

/** Hours left to CHW certification eligibility; null for a role without the step (0032). */
export function certificationStatus(
  role: Role,
  invoicedQuarters: number,
): CertificationStat | null {
  const cert = role.certification_step;
  if (!cert) return null;
  return invoicedQuarters < cert.after_quarters
    ? {
        state: 'counting',
        left_quarters: cert.after_quarters - invoicedQuarters,
        after_quarters: cert.after_quarters,
        name: cert.name,
      }
    : { state: 'eligible', after_quarters: cert.after_quarters, name: cert.name };
}

export interface CountTotal {
  id: string;
  label: string;
  unit: string | null;
  total: number;
}

export interface RoleStats {
  /** Every source, invoiced (contractors) or submitted (employees). */
  invoiced_quarters: number;
  /** Logged but not yet invoiced or submitted; shown, never counted toward the goals. */
  waiting_quarters: number;
  /** Null when no funding entry has a raise, or once it is reached and the rate changed. */
  pay: PayStat | null;
  /** Null when the role has no certification step. */
  certification: CertificationStat | null;
  /**
   * All-time totals above 0 of the counts the role's tasks show, in the shared list's order.
   * "Add another count" totals are left out (Chris, Nov 3).
   */
  counts: CountTotal[];
}

/**
 * My stats, combined across the person's sources (decision 0032). `rates` holds each source's
 * rate from Settings by source id.
 */
export function myStats(
  countDefs: readonly CountDef[],
  role: Role,
  rates: Readonly<Record<string, number>>,
  invoices: readonly Invoice[],
  waitingQuarters: number,
): RoleStats {
  const invoiced = invoices.reduce((sum, i) => sum + i.total_quarters, 0);

  let pay: PayStat | null = null;
  const raiseIds = raiseSourceIds(role);
  const step = role.funding.find((f) => f.rate_step)?.rate_step;
  if (step) {
    // Raised once every raise source's rate is at least the new rate (decision 0036).
    const raised = raiseIds.every((id) => {
      const rate = rates[id];
      return rate !== undefined && rate >= step.rate_cents;
    });
    const billed = invoicedQuartersIn(raiseIds, invoices);
    if (billed < step.after_quarters) {
      pay = {
        state: 'counting',
        left_quarters: step.after_quarters - billed,
        after_quarters: step.after_quarters,
        rate_cents: step.rate_cents,
      };
    } else if (!raised) {
      pay = { state: 'reached', after_quarters: step.after_quarters, rate_cents: step.rate_cents };
    }
  }

  const all = sumCounts(invoices.map((i) => i.counts_period));
  const shown = new Set(
    role.funding.flatMap((f) => f.budget_lines.flatMap((l) => l.tasks.flatMap((t) => t.count_ids))),
  );
  const counts = countDefs
    .filter((c) => shown.has(c.id) && (all.values[c.id] ?? 0) > 0)
    .map((c) => ({ id: c.id, label: c.label, unit: c.unit ?? null, total: all.values[c.id] ?? 0 }));

  return {
    invoiced_quarters: invoiced,
    waiting_quarters: waitingQuarters,
    pay,
    certification: certificationStatus(role, invoiced),
    counts,
  };
}
