// Service fees per entry (decision 0043) for the Regen Catering Contractor (decision 0042).
import { describe, expect, it } from 'vitest';
import {
  buildInvoiceDraft,
  createInvoice,
  feeRowName,
  invoiceRows,
  type InvoiceInput,
} from '../../src/core/invoice';
import { verifyFingerprint } from '../../src/core/fingerprint';
import { entryFeeNotes, entryFees, feeFromText, unbilledTaskIds } from '../../src/core/roles';
import { uninvoicedSummary } from '../../src/core/summary';
import type { Entry } from '../../src/core/types';
import {
  counts,
  countDefs,
  findTestRole,
  makeEntry,
  must,
  regen,
  sampleInput,
} from './fixtures/wireframe-sample';

const catering = findTestRole('r-cc01');
const lead = findTestRole('r-tl01');

function ccEntry(
  date: string,
  start: string,
  stop: string,
  line: string,
  tasks: Entry['tasks'],
  fees: Record<string, number> = {},
  values: Record<string, number> = {},
): Entry {
  return makeEntry(date, start, stop, must(tasks[0]).task_id, line, {
    source_id: regen.id,
    role_id: catering.id,
    tasks,
    fees,
    counts: counts({}, values),
  });
}

const ccInput = (entries: Entry[], overrides: Partial<InvoiceInput> = {}): InvoiceInput =>
  sampleInput({
    source: regen,
    settings: { source_id: regen.id, rate_cents: 2000, nte_cents: null },
    role: catering,
    entries,
    prior_invoices: [],
    ...overrides,
  });

function draft(input: InvoiceInput) {
  const result = buildInvoiceDraft(input);
  if (!result.ok) throw new Error(`draft failed: ${result.reason}`);
  return result.invoice;
}

// Wednesday dinner: 3 hrs, full $200 fee, 3 cakes.
const dinner = ccEntry(
  '2026-11-04',
  '15:00:00',
  '18:00:00',
  'leos',
  [{ task_id: 'wednesday-dinner-service', quarters: 12 }],
  { 'wednesday-dinner-service': 20000 },
  { meals_cooked: 40, cakes_made: 3 },
);
// Wednesday dinner a week later, lowered to $150, plus 1 hr of Leo's maintenance.
const dinnerLowered = ccEntry(
  '2026-11-11',
  '14:00:00',
  '18:00:00',
  'leos',
  [
    { task_id: 'wednesday-dinner-service', quarters: 12 },
    { task_id: 'leos-maintenance', quarters: 4 },
  ],
  { 'wednesday-dinner-service': 15000 },
);
// Full Moon Garden Party: 4 hrs, $200, 2 generators.
const party = ccEntry(
  '2026-11-08',
  '16:00:00',
  '20:00:00',
  'eat-local-network',
  [{ task_id: 'full-moon-garden-party-event-support', quarters: 16 }],
  { 'full-moon-garden-party-event-support': 20000 },
  { generators_rented: 2 },
);
// Monday breakfast given for free: $0.
const breakfastFree = ccEntry(
  '2026-11-09',
  '07:00:00',
  '09:00:00',
  'leos',
  [{ task_id: 'monday-breakfast-service', quarters: 8 }],
  { 'monday-breakfast-service': 0 },
);

describe('fee helpers (decision 0043)', () => {
  it('finds the three $200.00 service fees of the catering contractor', () => {
    const fees = entryFees(catering, regen.id);
    expect([...fees.keys()]).toEqual(['leos', 'eat-local-network']);
    expect([...(fees.get('leos')?.keys() ?? [])]).toEqual([
      'monday-breakfast-service',
      'wednesday-dinner-service',
    ]);
    expect(fees.get('eat-local-network')?.get('full-moon-garden-party-event-support')).toEqual({
      max_cents: 20000,
    });
    expect(entryFees(lead, regen.id).size).toBe(0);
  });

  it('treats fee and flat-rate tasks as unbilled hours', () => {
    expect([...unbilledTaskIds(catering, regen.id, 'leos')].sort()).toEqual([
      'monday-breakfast-service',
      'wednesday-dinner-service',
    ]);
    expect(unbilledTaskIds(catering, regen.id, 'maintenance-labor').size).toBe(0);
  });

  it('reads a typed fee: untouched is the full fee, then $0.00 up to it', () => {
    const fee = { max_cents: 20000 };
    expect(feeFromText(undefined, fee)).toEqual({ ok: true, cents: 20000 });
    expect(feeFromText('150', fee)).toEqual({ ok: true, cents: 15000 });
    expect(feeFromText('$200.00', fee)).toEqual({ ok: true, cents: 20000 });
    expect(feeFromText('0', fee)).toEqual({ ok: true, cents: 0 });
    expect(feeFromText('200.01', fee)).toEqual({ ok: false, reason: 'over' });
    expect(feeFromText('', fee)).toEqual({ ok: false, reason: 'bad' });
    expect(feeFromText('-5', fee)).toEqual({ ok: false, reason: 'bad' });
  });

  it('tells Settings how each fee task is paid', () => {
    expect(entryFeeNotes(catering, regen)).toEqual([
      'Monday breakfast service: up to $200.00 each entry. Lower it on the entry if you charged less. Its hours are tracked, not billed.',
      'Wednesday dinner service: up to $200.00 each entry. Lower it on the entry if you charged less. Its hours are tracked, not billed.',
      'Full Moon Garden Party event support: up to $200.00 each entry. Lower it on the entry if you charged less. Its hours are tracked, not billed.',
    ]);
  });
});

describe('invoice with service fees (decision 0043)', () => {
  const invoice = draft(ccInput([dinner, dinnerLowered, party, breakfastFree]));

  it("bills only the hourly tasks by the hour: 1 hr of Leo's maintenance at $20.00", () => {
    expect(invoice.lines.map((l) => [l.budget_line_id, l.quarters, l.amount_cents])).toEqual([
      ['leos', 4, 2000],
    ]);
    expect(invoice.unbilled_quarters).toBe(12 + 12 + 16 + 8);
  });

  it('adds one fee row per task with fees, counting entries with a fee above $0.00', () => {
    expect(invoice.fee_lines).toEqual([
      {
        budget_line_id: 'leos',
        budget_line_name: "Leo's",
        task_id: 'wednesday-dinner-service',
        task_name: 'Wednesday dinner service',
        entries: 2,
        max_cents: 20000,
        amount_cents: 35000,
      },
      {
        budget_line_id: 'eat-local-network',
        budget_line_name: 'Eat Local Network',
        task_id: 'full-moon-garden-party-event-support',
        task_name: 'Full Moon Garden Party event support',
        entries: 1,
        max_cents: 20000,
        amount_cents: 20000,
      },
    ]);
  });

  it('adds $25.00 per cake and per generator on top of the fees', () => {
    expect(invoice.flat_lines?.map((f) => [f.count_id, f.units_quarters, f.amount_cents])).toEqual([
      ['cakes_made', 12, 7500],
      ['generators_rented', 8, 5000],
    ]);
  });

  it('totals the hours, the fees and the flat rows', () => {
    expect(invoice.total_cents).toBe(2000 + 35000 + 20000 + 7500 + 5000);
  });

  it("freezes each entry's fees and marks fee task shares as not billed", () => {
    const byDate = new Map(invoice.entries.map((e) => [e.entry_date, e]));
    expect(byDate.get('2026-11-11')?.fees).toEqual({ 'wednesday-dinner-service': 15000 });
    expect(byDate.get('2026-11-11')?.tasks.map((t) => t.billed)).toEqual([false, undefined]);
  });

  it('lists hourly, fee, then flat rows per line', () => {
    expect(
      invoiceRows(invoice).map((r) =>
        r.kind === 'hours'
          ? `${r.line.budget_line_id} hours`
          : r.kind === 'fee'
            ? `${r.fee.budget_line_id} fee ${r.fee.task_id}`
            : r.kind === 'flat'
              ? `${r.flat.budget_line_id} flat ${r.flat.count_id}`
              : r.kind,
      ),
    ).toEqual([
      'leos hours',
      'leos fee wednesday-dinner-service',
      'leos flat cakes_made',
      'eat-local-network fee full-moon-garden-party-event-support',
      'eat-local-network flat generators_rented',
    ]);
    expect(feeRowName(must(invoice.fee_lines?.[0]))).toBe("Leo's: Wednesday dinner service ×2");
  });

  it('Wednesday dinner with 3 cakes is $275.00; Full Moon with 2 generators is $250.00', () => {
    expect(draft(ccInput([dinner])).total_cents).toBe(27500);
    expect(draft(ccInput([party])).total_cents).toBe(25000);
  });

  it('a free breakfast bills nothing and has no row', () => {
    const free = draft(ccInput([breakfastFree]));
    expect(free.fee_lines).toEqual([]);
    expect(free.total_cents).toBe(0);
  });

  it('fingerprints and verifies at the current canonical version; a changed fee breaks it', async () => {
    const result = await createInvoice(ccInput([dinner, dinnerLowered, party]));
    if (!result.ok) throw new Error(result.reason);
    expect(result.invoice.canonical_version).toBe(7);
    expect(await verifyFingerprint(result.invoice)).toBe(true);
    const tampered = structuredClone(result.invoice);
    const lowered = must(tampered.entries.find((e) => e.entry_date === '2026-11-11'));
    lowered.fees = { 'wednesday-dinner-service': 20000 };
    expect(await verifyFingerprint(tampered)).toBe(false);
  });
});

describe('Home summary with service fees (decision 0043)', () => {
  it('equals the invoice the Generate button would make', () => {
    const entries = [dinner, dinnerLowered, party, breakfastFree];
    const invoice = draft(ccInput(entries));
    expect(uninvoicedSummary(entries, regen.id, 2000, [catering], countDefs)).toEqual({
      count: 4,
      quarters: 12 + 16 + 16 + 8,
      amount_cents: invoice.total_cents,
    });
  });
});
