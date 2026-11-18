// Summing counts across entries and invoices (SPEC §5, §6).
import type { CountDef, Counts, OtherCount } from './types';

/**
 * The five CHW counts (SPEC §5), in the order screens and invoice files list them. Screens and
 * files show these until they follow each task's counts (roles plan R4, R5).
 */
export const COUNT_FIELDS: readonly {
  key: string;
  label: string;
  noun: string;
}[] = [
  { key: 'contacts', label: 'Contacts', noun: 'contacts' },
  { key: 'referrals_given', label: 'Referrals given', noun: 'referrals given' },
  { key: 'referral_followups', label: 'Referral follow-ups', noun: 'referral follow-ups' },
  { key: 'rides_provided', label: 'Rides provided', noun: 'rides provided' },
  {
    key: 'applications_completed',
    label: 'Applications completed',
    noun: 'applications completed',
  },
];

export function emptyCounts(): Counts {
  return { values: {}, other: [] };
}

/** A count's value, 0 when the entry doesn't have it. */
export function countValue(counts: Counts, id: string): number {
  return counts.values[id] ?? 0;
}

/**
 * Add counts together, by count id. Custom counts with the same label (trimmed, any letter
 * case) are merged under the first spelling seen; custom counts that total 0 are left out.
 */
export function sumCounts(list: readonly Counts[]): Counts {
  const total = emptyCounts();
  const other = new Map<string, OtherCount>();
  for (const c of list) {
    for (const [id, value] of Object.entries(c.values)) {
      total.values[id] = (total.values[id] ?? 0) + value;
    }
    for (const { label, value } of c.other) {
      const trimmed = label.trim();
      const key = trimmed.toLowerCase();
      const seen = other.get(key);
      if (seen) seen.value += value;
      else other.set(key, { label: trimmed, value });
    }
  }
  total.other = [...other.values()].filter((o) => o.value !== 0);
  return total;
}

/**
 * A count value as people read it, with its unit. Quarter-step counts are stored in
 * quarter-units and shown as decimals: 10 → "2.5" (decision 0039).
 */
export function countText(value: number, def: Pick<CountDef, 'unit' | 'step'>): string {
  const n = def.step === 'quarter' ? quarterUnitsText(value) : String(value);
  return def.unit ? `${n} ${def.unit}` : n;
}

/** Whole quarter-units as a decimal with no trailing zeros: 13 → "3.25". */
export function quarterUnitsText(units: number): string {
  const sign = units < 0 ? '-' : '';
  const abs = Math.abs(units);
  const whole = Math.floor(abs / 4);
  const frac = ['', '.25', '.5', '.75'][abs % 4] ?? '';
  return `${sign}${String(whole)}${frac}`;
}
