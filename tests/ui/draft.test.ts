// Saving an entry against the person's role (roles plan R4; decisions 0028, 0029, 0033).
import { describe, expect, it } from 'vitest';
import { emptyCounts } from '../../src/core/counts';
import type { EntryDraft } from '../../src/storage';
import { buildEntry, editDraft } from '../../src/ui/draft';
import { at, countDefs, findTestRole, regen, tisupp } from '../core/fixtures/wireframe-sample';

const trainee = findTestRole('chw-tc01');
const lead = findTestRole('r-tl01');
const NOW = at('2026-11-03', '12:00:00');

function draft(patch: Partial<EntryDraft> = {}): EntryDraft {
  return {
    kind: 'entry',
    entry_id: null,
    step: 'counts',
    hand: null,
    start: at('2026-11-02', '09:00:00'),
    stop: at('2026-11-02', '10:00:00'),
    breaks: [],
    source_id: regen.id,
    tasks: [{ task_id: 'dump-runs', quarters: 4 }],
    budget_line_id: 'fire-risk-reduction-work',
    counts: emptyCounts(),
    fees: {},
    notes: '',
    ...patch,
  };
}

const build = (d: EntryDraft, role = lead, source = regen) =>
  buildEntry(d, source, [], null, NOW, () => 'new-id', role, countDefs);

describe('buildEntry with a role', () => {
  it('saves a pick the role bills, with the role id', () => {
    const result = build(draft());
    expect(result.ok && result.entry.role_id).toBe('r-tl01');
  });

  it('rejects a task that is not on the picked line', () => {
    const result = build(draft({ tasks: [{ task_id: 'lehr-maintenance', quarters: 4 }] }));
    expect(result).toEqual({ ok: false, problem: 'task' });
  });

  it('rejects a budget line the role does not bill', () => {
    const other = tisupp.budget_lines.find((l) => l.id !== 'chw-experience-hours');
    const result = build(
      draft({
        source_id: tisupp.id,
        budget_line_id: other?.id ?? null,
        tasks: [{ task_id: 'outreach', quarters: 4 }],
      }),
      trainee,
      tisupp,
    );
    expect(result).toEqual({ ok: false, problem: 'budget_line' });
  });

  it('rejects a date outside the source period (decision 0033)', () => {
    const result = build(
      draft({
        source_id: tisupp.id,
        budget_line_id: 'chw-experience-hours',
        tasks: [{ task_id: 'outreach', quarters: 4 }],
        start: at('2027-10-01', '09:00:00'),
        stop: at('2027-10-01', '10:00:00'),
      }),
      trainee,
      tisupp,
    );
    expect(result).toEqual({ ok: false, problem: 'source_period' });
  });

  it("rejects an extra count that repeats one of the entry's counts (decision 0029)", () => {
    const counts = { values: {}, other: [{ label: ' trailer  LOADS removed', value: 2 }] };
    expect(build(draft({ counts }))).toEqual({ ok: false, problem: 'count_duplicate' });
    const fine = { values: {}, other: [{ label: 'Trees planted', value: 2 }] };
    expect(build(draft({ counts: fine })).ok).toBe(true);
  });

  it('keeps the source choices on a phone with no role', () => {
    const result = buildEntry(
      draft({ budget_line_id: regen.budget_lines[0]?.id ?? null }),
      regen,
      [],
      null,
      NOW,
      () => 'new-id',
      null,
      countDefs,
    );
    expect(result.ok && result.entry.role_id).toBeNull();
  });
});

describe('after the office edits a role (roles plan R7)', () => {
  // Dump runs taken off the fire line; the entry was logged with it.
  const edited = {
    ...lead,
    funding: lead.funding.map((f) => ({
      ...f,
      budget_lines: f.budget_lines.map((l) => ({
        ...l,
        tasks: l.tasks.filter((t) => t.id !== 'dump-runs'),
      })),
    })),
  };

  it('editing an entry with a removed task asks for a new pick', () => {
    expect(build(draft(), edited)).toEqual({ ok: false, problem: 'task' });
    const picked = draft({ tasks: [{ task_id: 'municipal-fuel-reduction', quarters: 4 }] });
    expect(build(picked, edited).ok).toBe(true);
  });

  it("keeps a count's value when the count was taken off the task", () => {
    const counts = { values: { trees_planted: 2 }, other: [] };
    const result = build(draft({ counts }), lead);
    expect(result.ok && result.entry.counts.values).toEqual({ trees_planted: 2 });
  });
});

describe('service fees on save (decision 0043)', () => {
  const catering = findTestRole('r-cc01');
  const dinner = (patch: Partial<EntryDraft> = {}) =>
    draft({
      budget_line_id: 'leos',
      tasks: [
        { task_id: 'wednesday-dinner-service', quarters: 2 },
        { task_id: 'leos-maintenance', quarters: 2 },
      ],
      ...patch,
    });
  const saved = (d: EntryDraft) => {
    const result = build(d, catering);
    if (!result.ok) throw new Error(result.problem);
    return result.entry;
  };

  it('keeps the full $200.00 when the fee is left as it is', () => {
    expect(saved(dinner()).fees).toEqual({ 'wednesday-dinner-service': 20000 });
  });

  it('keeps a lower fee as typed, down to $0.00', () => {
    expect(saved(dinner({ fees: { 'wednesday-dinner-service': '150' } })).fees).toEqual({
      'wednesday-dinner-service': 15000,
    });
    expect(saved(dinner({ fees: { 'wednesday-dinner-service': '0.00' } })).fees).toEqual({
      'wednesday-dinner-service': 0,
    });
  });

  it('refuses more than the fee, or text that is not an amount', () => {
    for (const text of ['200.01', '250', '', 'abc']) {
      expect(build(dinner({ fees: { 'wednesday-dinner-service': text } }), catering)).toEqual({
        ok: false,
        problem: 'fee',
      });
    }
  });

  it('drops the fee of a task that is no longer checked, and has none for hourly tasks', () => {
    const entry = saved(
      dinner({
        tasks: [{ task_id: 'leos-maintenance', quarters: 4 }],
        fees: { 'wednesday-dinner-service': '150' },
      }),
    );
    expect(entry.fees).toEqual({});
    const hourly = build(draft());
    expect(hourly.ok && hourly.entry.fees).toEqual({});
  });

  it('editing shows the saved fee as typed', () => {
    const entry = saved(dinner({ fees: { 'wednesday-dinner-service': '150' } }));
    expect(editDraft(entry).fees).toEqual({ 'wednesday-dinner-service': '150.00' });
  });
});

describe('trip miles on save (decision 0045)', () => {
  const ccc = findTestRole('r-ccc01');
  const trip = (values: Record<string, number>, patch: Partial<EntryDraft> = {}) =>
    draft({
      budget_line_id: 'community-care-work',
      tasks: [{ task_id: 'transportation-service', quarters: 4 }],
      counts: { values, other: [] },
      ...patch,
    });

  it('needs the miles for a trip', () => {
    expect(build(trip({}), ccc)).toEqual({ ok: false, problem: 'miles' });
    expect(build(trip({ miles_driven: 0, rides_provided: 1 }), ccc)).toEqual({
      ok: false,
      problem: 'miles',
    });
  });

  it('saves a trip with miles, and Domestic support with none', () => {
    const result = build(trip({ miles_driven: 45 }), ccc);
    expect(result.ok && result.entry.counts.values).toEqual({ miles_driven: 45 });
    const domestic = build(
      trip({}, { tasks: [{ task_id: 'domestic-support', quarters: 4 }] }),
      ccc,
    );
    expect(domestic.ok).toBe(true);
  });

  it('needs the miles when the trip shares the entry with Domestic support', () => {
    const shared = {
      tasks: [
        { task_id: 'transportation-service', quarters: 2 },
        { task_id: 'domestic-support', quarters: 2 },
      ],
    };
    expect(build(trip({}, shared), ccc)).toEqual({ ok: false, problem: 'miles' });
    expect(build(trip({ miles_driven: 12 }, shared), ccc).ok).toBe(true);
  });
});
