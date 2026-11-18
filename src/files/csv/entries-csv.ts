// Entry log CSV (SPEC §7, decisions 0001, 0024 and 0029): one header row and one row per task share
// of each entry, the same columns for every invoice and timesheet so files combine. One column per
// count in the roles file, in list order. Dollar amounts per entry only where an entry sets its
// own pay: the service fee (0043) and the trip fee and gas (0045).
import { quarterUnitsText } from '../../core/counts';
import { formatCentsPlain, formatQuarters } from '../../core/money';
import { pausedSeconds, rawSeconds } from '../../core/time';
import type { CountDef, Invoice } from '../../core/types';
import { csvFile } from './csv';

/** The columns before the counts. */
const LEADING_COLUMNS = [
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
  'trip_fee',
  'gas_reimbursement',
] as const;

/** The columns after the counts. */
const TRAILING_COLUMNS = ['other_counts', 'notes', 'created_at', 'updated_at'] as const;

/**
 * The header: fixed columns, then every count id in the roles file's order, retired ones
 * included, so new counts only ever add columns at the end of the count block (decision 0029).
 */
export function entryLogColumns(countDefs: readonly CountDef[]): string[] {
  return [...LEADING_COLUMNS, ...countDefs.map((c) => c.id), ...TRAILING_COLUMNS];
}

/** 5106 → "1:25:06": h:mm:ss before rounding. */
export function durationText(seconds: number): string {
  const s = Math.max(0, Math.trunc(seconds));
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${String(Math.floor(s / 3600))}:${mm}:${ss}`;
}

/**
 * `billed_hours` is the row's task share, so the column adds up to the invoice hours; a
 * flat-rate task's share goes in `unbilled_hours` instead (decision 0039). Times
 * repeat on every part; counts and notes are on part 1 only, so they add up too. A count cell
 * is blank unless the entry has a value above 0.
 */
export function entriesCsv(
  invoice: Invoice,
  countDefs: readonly CountDef[],
): Uint8Array<ArrayBuffer> {
  const rate = formatCentsPlain(invoice.rate_cents);
  const rows = invoice.entries.flatMap((e) =>
    e.tasks.map((t, i) => {
      const first = i === 0;
      const count = (c: CountDef) => {
        const n = e.counts.values[c.id] ?? 0;
        if (!first || n <= 0) return '';
        return c.step === 'quarter' ? quarterUnitsText(n) : String(n);
      };
      const unbilled = t.billed === false;
      return [
        invoice.number,
        invoice.fingerprint,
        invoice.source.code,
        e.id,
        `${String(i + 1)} of ${String(e.tasks.length)}`,
        e.entry_date,
        e.start,
        e.stop,
        // Worked time before rounding, then the pauses (decision 0037).
        durationText(rawSeconds(e.start, e.stop) - pausedSeconds(e.breaks)),
        durationText(pausedSeconds(e.breaks)),
        formatQuarters(unbilled ? 0 : t.quarters),
        formatQuarters(unbilled ? t.quarters : 0),
        t.task_name,
        t.core_competency ?? '',
        e.budget_line_name,
        rate,
        // This share's service fee, set per entry (decision 0043).
        e.fees?.[t.task_id] === undefined ? '' : formatCentsPlain(e.fees[t.task_id] ?? 0),
        // The trip this entry is, on its trip task's row (decision 0045).
        ...(e.trip?.task_id === t.task_id
          ? [formatCentsPlain(e.trip.fee_cents), formatCentsPlain(e.trip.gas_cents)]
          : ['', '']),
        ...countDefs.map((c) => count(c)),
        first ? e.counts.other.map((o) => `${o.label}=${String(o.value)}`).join('; ') : '',
        first ? e.notes : '',
        e.created_at,
        e.updated_at,
      ];
    }),
  );
  return csvFile([entryLogColumns(countDefs), ...rows]);
}
