import { describe, expect, it } from 'vitest';
import type { CountDef } from '../../src/core/types';
import { durationText, entriesCsv, entryLogColumns } from '../../src/files/csv/entries-csv';
import {
  countDefs,
  counts,
  findTestRole,
  makeEntry,
  must,
  regen,
  splitSampleEntries,
  uuid,
} from '../core/fixtures/wireframe-sample';
import golden from './golden/wireframe-entries.csv?raw';
import { csvText, invoiceFrom, sampleInvoice } from './helpers';

const COLUMNS = entryLogColumns(countDefs);

/** RFC 4180 rows after the header: quoted cells (may hold commas) or bare. */
const rowsOf = (bytes: Uint8Array) =>
  csvText(bytes)
    .split('\r\n')
    .slice(1, -1)
    .map((line) => [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)].map((m) => m[1] ?? ''));

describe('entry log CSV (SPEC §7, decisions 0001, 0024 and 0029)', () => {
  it('matches the golden file for the wireframe sample', async () => {
    const invoice = await sampleInvoice();
    expect(csvText(entriesCsv(invoice, countDefs)).replaceAll('\r\n', '\n')).toBe(
      golden.replaceAll('<FINGERPRINT>', invoice.fingerprint),
    );
  });

  it('has the fixed columns, then one per count in list order, for every invoice', async () => {
    expect(COLUMNS.slice(0, 17)).toEqual([
      'invoice_number',
      'fingerprint',
      'funding_source',
      'entry_id',
      'part',
      'entry_date',
      'start',
      'stop',
      'raw_duration',
      'paused',
      'billed_hours',
      'unbilled_hours',
      'task',
      'core_competency',
      'budget_line',
      'rate',
      'fee',
    ]);
    expect(COLUMNS.slice(17, -4)).toEqual(countDefs.map((c) => c.id));
    expect(COLUMNS.slice(-4)).toEqual(['other_counts', 'notes', 'created_at', 'updated_at']);
    const one = await invoiceFrom({
      entries: [
        makeEntry('2026-10-01', '09:00:00', '09:10:00', 'outreach', 'outreach-and-marketing'),
      ],
    });
    for (const inv of [await sampleInvoice(), one]) {
      expect(csvText(entriesCsv(inv, countDefs)).split('\r\n')[0]).toBe(COLUMNS.join(','));
    }
  });

  it('keeps a retired count as a column (decision 0029)', async () => {
    const retired: CountDef[] = [...countDefs, { id: 'old_count', label: 'Old', retired: true }];
    const header = csvText(entriesCsv(await sampleInvoice(), retired)).split('\r\n')[0];
    expect(header).toContain(',generators_rented,old_count,other_counts,');
  });

  it("writes a Team Lead's counts by id, blank where unused", async () => {
    const lead = findTestRole('r-tl01');
    const invoice = await invoiceFrom({
      source: regen,
      role: lead,
      settings: { source_id: regen.id, rate_cents: 2200, nte_cents: null },
      entries: [
        makeEntry(
          '2026-10-01',
          '09:00:00',
          '10:00:00',
          'water-harvesting',
          'resilient-home-services-contracting',
          {
            source_id: regen.id,
            counts: { values: { water_capacity_added: 250, trees_planted: 0 }, other: [] },
          },
        ),
      ],
      prior_invoices: [],
    });
    const [row] = rowsOf(entriesCsv(invoice, countDefs));
    const cell = (c: string) => row?.[COLUMNS.indexOf(c)];
    expect(cell('water_capacity_added')).toBe('250');
    expect(cell('trees_planted')).toBe('');
    expect(cell('contacts')).toBe('');
    expect(cell('core_competency')).toBe('');
  });

  it('puts a flat-rate share in unbilled_hours and writes 2.5 LEHRs reset (decision 0039)', async () => {
    const generalist = findTestRole('r-gc01');
    const invoice = await invoiceFrom({
      source: regen,
      role: generalist,
      settings: { source_id: regen.id, rate_cents: 2000, nte_cents: null },
      entries: [
        makeEntry('2026-11-02', '09:00:00', '10:00:00', 'lehr-reset', 'eat-local-network', {
          source_id: regen.id,
          role_id: generalist.id,
          tasks: [
            { task_id: 'lehr-reset', quarters: 2 },
            { task_id: 'garden-maintenance', quarters: 2 },
          ],
          counts: { values: { lehrs_reset: 10, soil_harvested: 30 }, other: [] },
        }),
      ],
      prior_invoices: [],
    });
    const rows = rowsOf(entriesCsv(invoice, countDefs));
    const cell = (r: number, c: string) => rows[r]?.[COLUMNS.indexOf(c)];
    expect([cell(0, 'task'), cell(0, 'billed_hours'), cell(0, 'unbilled_hours')]).toEqual([
      'LEHR reset',
      '0.00',
      '0.50',
    ]);
    expect([cell(1, 'task'), cell(1, 'billed_hours'), cell(1, 'unbilled_hours')]).toEqual([
      'Garden maintenance',
      '0.50',
      '0.00',
    ]);
    expect(cell(0, 'lehrs_reset')).toBe('2.5');
    expect(cell(0, 'soil_harvested')).toBe('30');
    expect(cell(1, 'lehrs_reset')).toBe('');
  });

  it("writes each share's service fee in the fee column (decision 0043)", async () => {
    const catering = findTestRole('r-cc01');
    const invoice = await invoiceFrom({
      source: regen,
      role: catering,
      settings: { source_id: regen.id, rate_cents: 2000, nte_cents: null },
      entries: [
        makeEntry('2026-11-04', '15:00:00', '17:00:00', 'leos-maintenance', 'leos', {
          source_id: regen.id,
          role_id: catering.id,
          tasks: [
            { task_id: 'leos-maintenance', quarters: 4 },
            { task_id: 'wednesday-dinner-service', quarters: 4 },
          ],
          fees: { 'wednesday-dinner-service': 15000 },
          counts: { values: { cakes_made: 3 }, other: [] },
        }),
      ],
      prior_invoices: [],
    });
    const rows = rowsOf(entriesCsv(invoice, countDefs));
    const cell = (r: number, c: string) => rows[r]?.[COLUMNS.indexOf(c)];
    expect([cell(0, 'task'), cell(0, 'fee'), cell(0, 'billed_hours')]).toEqual([
      "Leo's maintenance",
      '',
      '1.00',
    ]);
    expect([cell(1, 'task'), cell(1, 'fee'), cell(1, 'unbilled_hours')]).toEqual([
      'Wednesday dinner service',
      '150.00',
      '1.00',
    ]);
    expect(cell(0, 'cakes_made')).toBe('3');
  });

  it('writes one row per task share; billed hours add up, counts and notes are on part 1', async () => {
    const invoice = await invoiceFrom({ entries: splitSampleEntries });
    const rows = rowsOf(entriesCsv(invoice, countDefs));
    const col = (name: string) => COLUMNS.indexOf(name);
    const split = rows.filter((r) => r[col('entry_id')] === uuid(8));
    expect(
      split.map((r) =>
        [
          'part',
          'start',
          'stop',
          'raw_duration',
          'billed_hours',
          'task',
          'contacts',
          'referrals_given',
          'notes',
        ].map((c) => r[col(c)]),
      ),
    ).toEqual([
      [
        '1 of 2',
        '2026-10-30T09:12:04-07:00',
        '2026-10-30T10:37:10-07:00',
        '1:25:06',
        '1.00',
        'Client check in',
        '1',
        '1',
        'Library table',
      ],
      [
        '2 of 2',
        '2026-10-30T09:12:04-07:00',
        '2026-10-30T10:37:10-07:00',
        '1:25:06',
        '0.50',
        'Outreach',
        '',
        '',
        '',
      ],
    ]);
    expect(rows).toHaveLength(9);
    const sum = (c: string) => rows.reduce((total, r) => total + Number(r[col(c)] || 0), 0);
    expect(sum('billed_hours')).toBe(9.25);
    expect(sum('contacts')).toBe(invoice.counts_period.values['contacts']);
  });

  it('writes raw duration as h:mm:ss', () => {
    expect(durationText(5106)).toBe('1:25:06');
    expect(durationText(0)).toBe('0:00:00');
    expect(durationText(36_059)).toBe('10:00:59');
  });

  it('writes worked time as raw duration, then the paused time (decision 0037)', async () => {
    const entry = makeEntry(
      '2026-10-01',
      '09:00:00',
      '10:30:00',
      'outreach',
      'outreach-and-marketing',
      {
        breaks: [
          { start: '2026-10-01T09:20:00-07:00', stop: '2026-10-01T09:30:00-07:00' },
          { start: '2026-10-01T10:00:00-07:00', stop: '2026-10-01T10:10:00-07:00' },
        ],
      },
    );
    // 1 h 30 less 20 min = 1 h 10, which rounds to 1.25 h.
    const invoice = await invoiceFrom({
      entries: [{ ...entry, tasks: [{ task_id: 'outreach', quarters: 5 }] }],
      prior_invoices: [],
    });
    const [row] = rowsOf(entriesCsv(invoice, countDefs));
    const col = (name: string) => COLUMNS.indexOf(name);
    expect(must(row)[col('start')]).toBe('2026-10-01T09:00:00-07:00');
    expect(must(row)[col('stop')]).toBe('2026-10-01T10:30:00-07:00');
    expect(must(row)[col('raw_duration')]).toBe('1:10:00');
    expect(must(row)[col('paused')]).toBe('0:20:00');
    expect(must(row)[col('billed_hours')]).toBe('1.25');
  });

  it('leaves core competency blank for Domestic support and joins other counts', async () => {
    const invoice = await invoiceFrom({
      source: regen,
      settings: { source_id: regen.id, rate_cents: 1800, nte_cents: null },
      entries: [
        makeEntry('2026-10-01', '22:30:00', '00:15:00', 'domestic-support', 'domestic-support', {
          source_id: regen.id,
          counts: counts({
            other: [
              { label: 'Food boxes', value: 2 },
              { label: 'Library cards', value: 1 },
            ],
          }),
          notes: '-not a formula, "really"',
        }),
      ],
      prior_invoices: [],
    });
    const line = csvText(entriesCsv(invoice, countDefs)).split('\r\n')[1] ?? '';
    expect(line.startsWith('CC-2026-004,')).toBe(true);
    expect(line).toContain(',REGEN-GO,');
    expect(line).toContain(
      ',2026-10-01,2026-10-01T22:30:00-07:00,2026-10-02T00:15:00-07:00,1:45:00,0:00:00,1.75,',
    );
    expect(line).toContain(
      `,Domestic support,,Domestic support,18.00,,${','.repeat(countDefs.length)}Food boxes=2;`,
    );
    expect(line).toContain(`,Food boxes=2; Library cards=1,"'-not a formula, ""really""",`);
  });
});
