// Trip fees by distance (decision 0045) for the Community Care Contractor.
import { describe, expect, it } from 'vitest';
import {
  buildInvoiceDraft,
  createInvoice,
  gasRowName,
  invoiceRowCells,
  invoiceRows,
  tripRowName,
  type InvoiceInput,
} from '../../src/core/invoice';
import { verifyFingerprint } from '../../src/core/fingerprint';
import {
  entryTrip,
  tierLabel,
  tripFeeNotes,
  tripFees,
  tripTier,
  unbilledTaskIds,
} from '../../src/core/roles';
import { uninvoicedSummary } from '../../src/core/summary';
import type { Entry, TripFee } from '../../src/core/types';
import {
  counts,
  countDefs,
  findTestRole,
  makeEntry,
  must,
  regen,
  sampleInput,
} from './fixtures/wireframe-sample';

const ccc = findTestRole('r-ccc01');
const catering = findTestRole('r-cc01');
const LINE = 'community-care-work';
const DRIVE = 'transportation-service';
const trip = must(tripFees(ccc, regen.id).get(LINE)?.get(DRIVE));

function cccEntry(
  date: string,
  start: string,
  stop: string,
  tasks: Entry['tasks'],
  values: Record<string, number> = {},
  line = LINE,
): Entry {
  return makeEntry(date, start, stop, must(tasks[0]).task_id, line, {
    source_id: regen.id,
    role_id: ccc.id,
    tasks,
    counts: counts({}, values),
  });
}

const drive = (date: string, start: string, stop: string, quarters: number, miles?: number) =>
  cccEntry(
    date,
    start,
    stop,
    [{ task_id: DRIVE, quarters }],
    miles === undefined ? { rides_provided: 1 } : { rides_provided: 1, miles_driven: miles },
  );

const trip45 = drive('2026-11-03', '08:00:00', '09:30:00', 6, 45);
const trip100 = drive('2026-11-05', '07:00:00', '10:00:00', 12, 100);
const trip12 = drive('2026-11-06', '10:00:00', '10:45:00', 3, 12);
const trip200 = drive('2026-11-08', '06:00:00', '11:00:00', 20, 200);
// A 30-mile trip that shares an entry with 2 hrs of Domestic support (decision 0024).
const tripMixed = cccEntry(
  '2026-11-07',
  '09:00:00',
  '12:00:00',
  [
    { task_id: DRIVE, quarters: 4 },
    { task_id: 'domestic-support', quarters: 8 },
  ],
  { miles_driven: 30, homes_cleaned: 1 },
);
// 2 hrs of Domestic support.
const domestic = cccEntry(
  '2026-11-04',
  '13:00:00',
  '15:00:00',
  [{ task_id: 'domestic-support', quarters: 8 }],
  { homes_cleaned: 1 },
);
// 1 hr of Other on the Other line.
const other = cccEntry(
  '2026-11-09',
  '09:00:00',
  '10:00:00',
  [{ task_id: 'other', quarters: 4 }],
  {},
  'other-contractors',
);
// A trip with no miles (Save forbids it; the invoice bills no trip fee for it).
const noMiles = drive('2026-11-10', '09:00:00', '10:00:00', 4);

const cccInput = (entries: Entry[], overrides: Partial<InvoiceInput> = {}): InvoiceInput =>
  sampleInput({
    source: regen,
    settings: { source_id: regen.id, rate_cents: 2000, nte_cents: null },
    role: ccc,
    entries,
    prior_invoices: [],
    ...overrides,
  });

function draft(input: InvoiceInput) {
  const result = buildInvoiceDraft(input);
  if (!result.ok) throw new Error(`draft failed: ${result.reason}`);
  return result.invoice;
}

describe('trip fee helpers (decision 0045)', () => {
  it('finds the one trip fee, on Transportation service', () => {
    const fees = tripFees(ccc, regen.id);
    expect([...fees.keys()]).toEqual([LINE]);
    expect([...(fees.get(LINE)?.keys() ?? [])]).toEqual([DRIVE]);
    expect(tripFees(catering, regen.id).size).toBe(0);
    expect(tripFees(null, regen.id).size).toBe(0);
  });

  it('picks the tier at every boundary', () => {
    const fee = (miles: number) => {
      const tier = tripTier(trip, miles);
      return tier ? [tier.fee_cents, tier.gas_cents ?? 0] : null;
    };
    expect(fee(1)).toEqual([2000, 0]);
    expect(fee(30)).toEqual([2000, 0]);
    expect(fee(31)).toEqual([4000, 2000]);
    expect(fee(60)).toEqual([4000, 2000]);
    expect(fee(61)).toEqual([6000, 4000]);
    expect(fee(160)).toEqual([6000, 4000]);
    expect(fee(161)).toEqual([8000, 6000]);
    expect(fee(500)).toEqual([8000, 6000]);
  });

  it('finds no tier for no miles or miles that are not whole', () => {
    for (const miles of [0, -1, 2.5, Number.NaN]) expect(tripTier(trip, miles)).toBeNull();
  });

  it('names a tier by its miles', () => {
    expect(trip.tiers.map(tierLabel)).toEqual(['1–30 mi', '31–60 mi', '61–160 mi', '161+ mi']);
  });

  it('treats the trip task as unbilled hours', () => {
    expect([...unbilledTaskIds(ccc, regen.id, LINE)]).toEqual([DRIVE]);
    expect(unbilledTaskIds(ccc, regen.id, 'other-contractors').size).toBe(0);
  });

  it('reads the trip on an entry: none, missing miles, or its tier', () => {
    const at = (taskIds: string[], values: Record<string, number>) =>
      entryTrip(ccc, regen.id, LINE, taskIds, values);
    expect(at(['domestic-support'], {})).toEqual({ state: 'none' });
    expect(at([DRIVE], {})).toEqual({ state: 'missing', task_id: DRIVE });
    expect(at([DRIVE], { miles_driven: 0 })).toEqual({ state: 'missing', task_id: DRIVE });
    expect(at([DRIVE, 'domestic-support'], { miles_driven: 45 })).toEqual({
      state: 'trip',
      task_id: DRIVE,
      tier: { from_miles: 31, to_miles: 60, fee_cents: 4000, gas_cents: 2000 },
    });
    expect(entryTrip(ccc, regen.id, 'other-contractors', ['other'], {})).toEqual({
      state: 'none',
    });
    expect(entryTrip(catering, regen.id, 'leos', ['leos-maintenance'], {})).toEqual({
      state: 'none',
    });
  });

  it('tells Settings how the trips are paid', () => {
    expect(tripFeeNotes(ccc, regen)).toEqual([
      'Transportation service: $20.00 a trip for 1–30 mi, $40.00 + $20.00 gas for 31–60 mi, $60.00 + $40.00 gas for 61–160 mi, $80.00 + $60.00 gas for 161+ mi. One entry is one trip, by its miles driven. Its hours are tracked, not billed.',
    ]);
    expect(tripFeeNotes(catering, regen)).toEqual([]);
  });

  it('works for any tiers in the roles file', () => {
    const two: TripFee = {
      miles_count_id: 'miles_driven',
      tiers: [
        { from_miles: 1, to_miles: 9, fee_cents: 500 },
        { from_miles: 10, fee_cents: 900 },
      ],
    };
    expect(tripTier(two, 9)?.fee_cents).toBe(500);
    expect(tripTier(two, 10)?.fee_cents).toBe(900);
  });
});

describe('invoice with trip fees (decision 0045)', () => {
  const invoice = draft(cccInput([trip45, trip100, trip12, tripMixed, domestic, trip200, other]));

  it('bills Domestic support and Other by the hour, not the driving', () => {
    expect(invoice.lines.map((l) => [l.budget_line_id, l.quarters, l.amount_cents])).toEqual([
      ['other-contractors', 4, 2000],
      [LINE, 16, 8000],
    ]);
    expect(invoice.unbilled_quarters).toBe(6 + 12 + 3 + 4 + 20);
  });

  it('adds one trip row per tier with trips, in tier order', () => {
    expect(invoice.trip_lines).toEqual([
      {
        budget_line_id: LINE,
        budget_line_name: 'Community Care Work',
        task_id: DRIVE,
        task_name: 'Transportation service',
        from_miles: 1,
        to_miles: 30,
        trips: 2,
        fee_cents: 2000,
        amount_cents: 4000,
      },
      expect.objectContaining({ from_miles: 31, to_miles: 60, trips: 1, amount_cents: 4000 }),
      expect.objectContaining({ from_miles: 61, to_miles: 160, trips: 1, amount_cents: 6000 }),
      expect.objectContaining({ from_miles: 161, to_miles: null, trips: 1, amount_cents: 8000 }),
    ]);
  });

  it('adds the gas up into one row for the line, with no tier', () => {
    expect(invoice.gas_lines).toEqual([
      {
        budget_line_id: LINE,
        budget_line_name: 'Community Care Work',
        amount_cents: 2000 + 4000 + 6000,
      },
    ]);
  });

  it('totals hours, trips and gas', () => {
    expect(invoice.total_cents).toBe(2000 + 8000 + 4000 + 4000 + 6000 + 8000 + 12000);
  });

  it('marks the driving share of a mixed entry as not billed', () => {
    const mixed = must(invoice.entries.find((e) => e.entry_date === '2026-11-07'));
    expect(mixed.tasks.map((t) => [t.task_id, t.billed])).toEqual([
      [DRIVE, false],
      ['domestic-support', undefined],
    ]);
  });

  it('lists hourly, trip, then gas rows per line', () => {
    expect(
      invoiceRows(invoice).map((r) =>
        r.kind === 'trip'
          ? `trip from ${String(r.trip.from_miles)}`
          : r.kind === 'hours'
            ? `${r.line.budget_line_id} hours`
            : r.kind,
      ),
    ).toEqual([
      'other-contractors hours',
      `${LINE} hours`,
      'trip from 1',
      'trip from 31',
      'trip from 61',
      'trip from 161',
      'gas',
    ]);
  });

  it('names the rows for the page and the preview', () => {
    const rows = invoiceRows(invoice);
    const trips = rows.filter((r) => r.kind === 'trip');
    expect(trips.map((r) => tripRowName(r.trip))).toEqual([
      'Community Care Work: Transportation service, 2 trips 1–30 mi',
      'Community Care Work: Transportation service, 1 trip 31–60 mi',
      'Community Care Work: Transportation service, 1 trip 61–160 mi',
      'Community Care Work: Transportation service, 1 trip 161+ mi',
    ]);
    expect(gasRowName(must(invoice.gas_lines?.[0]))).toBe('Community Care Work: Gas reimbursement');
    expect(invoiceRowCells(must(trips[0]))).toEqual({
      name: 'Community Care Work: Transportation service, 2 trips 1–30 mi',
      quarters: null,
      rate: '$20.00',
      amount_cents: 4000,
    });
    expect(invoiceRowCells(must(rows.find((r) => r.kind === 'gas')))).toEqual({
      name: 'Community Care Work: Gas reimbursement',
      quarters: null,
      rate: '',
      amount_cents: 12000,
    });
  });

  it('a 45-mile trip, a 100-mile trip and 2 hrs of Domestic support at $20.00 is $200.00', () => {
    expect(draft(cccInput([trip45, trip100, domestic])).total_cents).toBe(20000);
  });

  it('a short trip has no gas row', () => {
    const short = draft(cccInput([trip12]));
    expect(short.gas_lines).toEqual([]);
    expect(short.total_cents).toBe(2000);
  });

  it('a trip with no miles bills no trip fee; its hours stay unbilled', () => {
    const none = draft(cccInput([noMiles]));
    expect(none.trip_lines).toEqual([]);
    expect(none.lines).toEqual([]);
    expect(none.unbilled_quarters).toBe(4);
    expect(none.total_cents).toBe(0);
  });

  it('fingerprints and verifies at canonical v7; a changed trip or gas row breaks it', async () => {
    const result = await createInvoice(cccInput([trip45, trip100, domestic]));
    if (!result.ok) throw new Error(result.reason);
    expect(result.invoice.canonical_version).toBe(7);
    expect(await verifyFingerprint(result.invoice)).toBe(true);
    for (const edit of [
      (i: typeof result.invoice) => (must(i.trip_lines?.[0]).amount_cents = 2000),
      (i: typeof result.invoice) => (must(i.gas_lines?.[0]).amount_cents = 1),
      (i: typeof result.invoice) => (i.gas_lines = []),
    ]) {
      const tampered = structuredClone(result.invoice);
      edit(tampered);
      expect(await verifyFingerprint(tampered)).toBe(false);
    }
  });
});

describe('Home summary with trip fees (decision 0045)', () => {
  it('equals the invoice the Generate button would make', () => {
    const entries = [trip45, trip100, trip12, tripMixed, domestic, trip200, other, noMiles];
    const invoice = draft(cccInput(entries));
    expect(uninvoicedSummary(entries, regen.id, 2000, [ccc], countDefs)).toEqual({
      count: 8,
      quarters: 6 + 12 + 3 + 12 + 8 + 20 + 4 + 4,
      amount_cents: invoice.total_cents,
    });
  });
});
