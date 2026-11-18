// Flat-rate tasks and quarter-step counts (decision 0039).
import { describe, expect, it } from 'vitest';
import { countText } from '../../src/core/counts';
import {
  buildInvoiceDraft,
  createInvoice,
  flatRowName,
  invoiceRows,
  unbilledNote,
} from '../../src/core/invoice';
import { verifyFingerprint } from '../../src/core/fingerprint';
import { flatRateNotes, flatRates } from '../../src/core/roles';
import { uninvoicedSummary } from '../../src/core/summary';
import type { InvoiceInput } from '../../src/core/invoice';
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

const generalist = findTestRole('r-gc01');
const lead = findTestRole('r-tl01');
const lehrsReset = must(countDefs.find((c) => c.id === 'lehrs_reset'));

/** An R-GC01 entry on Regen GO. */
function gcEntry(
  date: string,
  start: string,
  stop: string,
  line: string,
  tasks: Entry['tasks'],
  values: Record<string, number> = {},
): Entry {
  return makeEntry(date, start, stop, must(tasks[0]).task_id, line, {
    source_id: regen.id,
    role_id: generalist.id,
    tasks,
    counts: counts({}, values),
  });
}

function gcInput(entries: Entry[], overrides: Partial<InvoiceInput> = {}): InvoiceInput {
  return sampleInput({
    source: regen,
    settings: { source_id: regen.id, rate_cents: 2000, nte_cents: null },
    role: generalist,
    entries,
    prior_invoices: [],
    ...overrides,
  });
}

function draft(input: InvoiceInput) {
  const result = buildInvoiceDraft(input);
  if (!result.ok) throw new Error(`draft failed: ${result.reason}`);
  return result.invoice;
}

// Mixed: 1.00 h, LEHR reset 0.50 h + Garden maintenance 0.50 h, 2.5 resets (10 quarter-units).
const mixed = gcEntry(
  '2026-11-02',
  '09:00:00',
  '10:00:00',
  'eat-local-network',
  [
    { task_id: 'lehr-reset', quarters: 2 },
    { task_id: 'garden-maintenance', quarters: 2 },
  ],
  { lehrs_reset: 10, soil_harvested: 30 },
);
// Reset only: 2.00 h, 1 reset.
const resetOnly = gcEntry(
  '2026-11-03',
  '09:00:00',
  '11:00:00',
  'eat-local-network',
  [{ task_id: 'lehr-reset', quarters: 8 }],
  { lehrs_reset: 4 },
);
// Hourly: 1.50 h of Leo's.
const leos = gcEntry('2026-11-04', '17:00:00', '18:30:00', 'leos', [
  { task_id: 'hosting-open-hours', quarters: 6 },
]);

describe('countText (decision 0039)', () => {
  it('shows whole counts as they are, with their unit', () => {
    expect(countText(3, { unit: 'gal' })).toBe('3 gal');
    expect(countText(12, {})).toBe('12');
  });

  it('shows quarter-step counts as decimals', () => {
    expect([0, 1, 2, 3, 4, 10, 13].map((v) => countText(v, lehrsReset))).toEqual([
      '0',
      '0.25',
      '0.5',
      '0.75',
      '1',
      '2.5',
      '3.25',
    ]);
  });
});

describe('flatRates (decision 0039)', () => {
  it('finds R-GC01 LEHR reset at $140.00 per LEHR reset', () => {
    expect([...flatRates(generalist, regen.id)]).toEqual([
      [
        'eat-local-network',
        new Map([['lehr-reset', { count_id: 'lehrs_reset', cents_per_unit: 14000 }]]),
      ],
    ]);
  });

  it('is empty for other roles, sources and no role', () => {
    expect(flatRates(lead, regen.id).size).toBe(0);
    expect(flatRates(generalist, 'tisupp').size).toBe(0);
    expect(flatRates(null, regen.id).size).toBe(0);
  });
});

describe('invoice with a flat-rate task (decision 0039)', () => {
  const invoice = draft(gcInput([mixed, resetOnly, leos]));

  it('bills only the hours of tasks without a flat rate', () => {
    expect(invoice.lines).toEqual([
      {
        budget_line_id: 'leos',
        budget_line_name: "Leo's",
        quarters: 6,
        rate_cents: 2000,
        amount_cents: 3000,
      },
      {
        budget_line_id: 'eat-local-network',
        budget_line_name: 'Eat Local Network',
        quarters: 2,
        rate_cents: 2000,
        amount_cents: 1000,
      },
    ]);
    expect(invoice.total_quarters).toBe(8);
    expect(invoice.unbilled_quarters).toBe(10);
  });

  it('adds a flat row per flat-rate task: 3.5 resets × $140.00 = $490.00', () => {
    expect(invoice.flat_lines).toEqual([
      {
        budget_line_id: 'eat-local-network',
        budget_line_name: 'Eat Local Network',
        task_id: 'lehr-reset',
        task_name: 'LEHR reset',
        count_id: 'lehrs_reset',
        count_label: 'LEHRs reset',
        units_quarters: 14,
        cents_per_unit: 14000,
        amount_cents: 49000,
      },
    ]);
    expect(invoice.total_cents).toBe(3000 + 1000 + 49000);
  });

  it('marks the flat-rate task shares as not billed and keeps the tracked hours', () => {
    const shares = invoice.entries.map((e) => [e.quarters, e.tasks.map((t) => t.billed)]);
    expect(shares).toEqual([
      [4, [false, undefined]],
      [8, [false]],
      [6, [undefined]],
    ]);
  });

  it('bills 2.5 resets as $350.00', () => {
    const only = draft(gcInput([mixed]));
    expect(only.flat_lines?.[0]?.amount_cents).toBe(35000);
    expect(only.total_cents).toBe(1000 + 35000);
  });

  it('shows no hourly row for a line with only flat-rate hours', () => {
    const only = draft(gcInput([resetOnly]));
    expect(only.lines).toEqual([]);
    expect(only.total_quarters).toBe(0);
    expect(only.unbilled_quarters).toBe(8);
    expect(only.total_cents).toBe(14000);
  });

  it('bills no flat fee when the task is not checked, even with a count value', () => {
    const notChecked = gcEntry(
      '2026-11-05',
      '09:00:00',
      '10:00:00',
      'eat-local-network',
      [{ task_id: 'garden-maintenance', quarters: 4 }],
      { lehrs_reset: 4 },
    );
    const only = draft(gcInput([notChecked]));
    expect(only.flat_lines).toEqual([]);
    expect(only.total_cents).toBe(2000);
  });

  it('leaves R-TL01 paid by the hour', () => {
    const tlEntry = makeEntry(
      '2026-11-02',
      '09:00:00',
      '10:00:00',
      'lehr-maintenance',
      'maintenance-labor',
      {
        source_id: regen.id,
        role_id: lead.id,
        counts: counts({}, { lehr_resets_completed: 2 }),
      },
    );
    const tl = draft(gcInput([tlEntry], { role: lead }));
    expect(tl.flat_lines).toEqual([]);
    expect(tl.unbilled_quarters).toBe(0);
    expect(tl.total_cents).toBe(2000);
  });

  it('fingerprints and verifies at the current canonical version', async () => {
    const result = await createInvoice(gcInput([mixed, resetOnly, leos]));
    if (!result.ok) throw new Error(result.reason);
    expect(result.invoice.canonical_version).toBe(6);
    expect(await verifyFingerprint(result.invoice)).toBe(true);
    const tampered = {
      ...result.invoice,
      flat_lines: [{ ...must(result.invoice.flat_lines?.[0]), units_quarters: 15 }],
    };
    expect(await verifyFingerprint(tampered)).toBe(false);
  });
});

describe('uninvoicedSummary with flat-rate tasks (decision 0039)', () => {
  it('equals the invoice the Generate button would make, and counts every tracked hour', () => {
    const entries = [mixed, resetOnly, leos];
    const invoice = draft(gcInput(entries));
    expect(uninvoicedSummary(entries, regen.id, 2000, [generalist], countDefs)).toEqual({
      count: 3,
      quarters: 18,
      amount_cents: invoice.total_cents,
    });
  });

  it('is null until the source has a rate, as before', () => {
    expect(
      uninvoicedSummary([mixed], regen.id, null, [generalist], countDefs).amount_cents,
    ).toBeNull();
  });
});

describe('lines table, notes and Settings text (decision 0039)', () => {
  const invoice = draft(gcInput([mixed, resetOnly, leos]));

  it("puts each flat row right after its line's hourly row", () => {
    expect(
      invoiceRows(invoice).map((r) =>
        r.kind === 'hours'
          ? r.line.budget_line_id
          : r.kind === 'flat'
            ? `${r.flat.budget_line_id} flat`
            : 'fee',
      ),
    ).toEqual(['leos', 'eat-local-network', 'eat-local-network flat']);
  });

  it('puts flat rows of a line with no billed hours after the hourly rows', () => {
    const only = draft(gcInput([resetOnly, leos]));
    expect(
      invoiceRows(only).map((r) =>
        r.kind === 'hours'
          ? r.line.budget_line_id
          : r.kind === 'flat'
            ? `${r.flat.budget_line_id} flat`
            : 'fee',
      ),
    ).toEqual(['leos', 'eat-local-network flat']);
  });

  it('names the flat row with its count', () => {
    expect(flatRowName(must(invoice.flat_lines?.[0]))).toBe('Eat Local Network: 3.5 LEHRs reset');
  });

  it('notes the unbilled hours, and nothing when every hour is billed', () => {
    expect(unbilledNote(invoice)).toBe(
      '2.50 hrs of LEHR reset tracked, not billed (paid as listed above)',
    );
    expect(unbilledNote(draft(gcInput([leos])))).toBe('');
  });

  it('tells Settings how the flat-rate task is paid', () => {
    expect(flatRateNotes(generalist, regen, countDefs)).toEqual([
      'LEHR reset: $140.00 each, by the “LEHRs reset” count. Its hours are tracked, not billed.',
    ]);
    expect(flatRateNotes(lead, regen, countDefs)).toEqual([]);
  });
});

describe('Resilience Contractor LEHR resets (decision 0040)', () => {
  const contractor = findTestRole('r-c01');

  it('bills LEHR resets on Maintenance labor at $140.00 each, hours tracked, not billed', () => {
    const entry = makeEntry(
      '2026-11-02',
      '08:00:00',
      '10:00:00',
      'lehr-reset',
      'maintenance-labor',
      {
        source_id: regen.id,
        role_id: contractor.id,
        tasks: [
          { task_id: 'lehr-reset', quarters: 4 },
          { task_id: 'pinal-garden-maintenance', quarters: 4 },
        ],
        counts: counts({}, { lehrs_reset: 6 }),
      },
    );
    const invoice = draft(gcInput([entry], { role: contractor }));
    expect(invoice.lines.map((l) => [l.budget_line_id, l.quarters, l.amount_cents])).toEqual([
      ['maintenance-labor', 4, 2000],
    ]);
    expect(
      invoice.flat_lines?.map((f) => [f.budget_line_id, f.units_quarters, f.amount_cents]),
    ).toEqual([['maintenance-labor', 6, 21000]]);
    expect(invoice.unbilled_quarters).toBe(4);
    expect(invoice.total_cents).toBe(23000);
    expect(flatRateNotes(contractor, regen, countDefs)).toEqual([
      'LEHR reset: $140.00 each, by the “LEHRs reset” count. Its hours are tracked, not billed.',
    ]);
  });
});
