// Invoice fingerprint (SPEC §7, CLAUDE.md rule 8): SHA-256 over a versioned canonical form.
// Never change a canonical form. A new form gets a new version and older invoices keep verifying.
import { canonicalJson } from './canonical';
import type { Counts, Invoice, InvoiceEntry, InvoiceTaskShare } from './types';

/**
 * The version new invoices get. v2: several tasks per entry (decision 0024). v3: kind, role,
 * certification text and counts by id (roles plan R5, decisions 0029, 0031). v4: breaks
 * (decision 0037). v5: flat-rate rows, unbilled hours and each share's billed flag (0039).
 * v6: each entry's service fees and the fee rows (decision 0043). v7: trip and gas rows (0045).
 */
export const CANONICAL_VERSION = 7;

/** The fields an invoice is fingerprinted over: header, entries, lines, totals and rate. */
export type FingerprintedInvoice = Omit<Invoice, 'fingerprint'>;

/** Forms v1 and v2 hold the five CHW counts data v3 had, read from the map (data v4). */
function countsForm(counts: Counts) {
  const value = (id: string) => counts.values[id] ?? 0;
  return {
    contacts: value('contacts'),
    referrals_given: value('referrals_given'),
    referral_followups: value('referral_followups'),
    rides_provided: value('rides_provided'),
    applications_completed: value('applications_completed'),
    other: counts.other.map((o) => ({ label: o.label, value: o.value })),
  };
}

/** A v1 invoice entry had exactly one task; data v3 stores it as a single share. */
function onlyTask(e: InvoiceEntry): InvoiceTaskShare {
  const [only, ...more] = e.tasks;
  if (!only || more.length > 0) throw new RangeError('A v1 invoice entry has exactly one task');
  return only;
}

/**
 * Canonical form v1. Leaves out what depends on other invoices (NTE tracker, all-time
 * counts), what is derived from the entries (period counts) and record timestamps.
 */
export function canonicalFormV1(invoice: FingerprintedInvoice): string {
  return canonicalJson({
    v: 1,
    id: invoice.id,
    number: invoice.number,
    sequence: invoice.sequence,
    invoice_date: invoice.invoice_date,
    period_start: invoice.period_start,
    period_end: invoice.period_end,
    source: {
      id: invoice.source.id,
      code: invoice.source.code,
      name: invoice.source.name,
      version: invoice.source.version,
    },
    chw: {
      name: invoice.chw.name,
      initials: invoice.chw.initials,
      mailing_address: invoice.chw.mailing_address,
    },
    rate_cents: invoice.rate_cents,
    entries: invoice.entries.map((e) => {
      const task = onlyTask(e);
      return {
        id: e.id,
        start: e.start,
        stop: e.stop,
        entry_date: e.entry_date,
        quarters: e.quarters,
        task_id: task.task_id,
        task_name: task.task_name,
        core_competency: task.core_competency,
        budget_line_id: e.budget_line_id,
        budget_line_name: e.budget_line_name,
        counts: countsForm(e.counts),
        notes: e.notes,
      };
    }),
    lines: invoice.lines.map((l) => ({
      budget_line_id: l.budget_line_id,
      budget_line_name: l.budget_line_name,
      quarters: l.quarters,
      rate_cents: l.rate_cents,
      amount_cents: l.amount_cents,
    })),
    total_quarters: invoice.total_quarters,
    total_cents: invoice.total_cents,
  });
}

/** Canonical form v2: as v1, but each entry lists its task shares (decision 0024). */
export function canonicalFormV2(invoice: FingerprintedInvoice): string {
  return canonicalJson({
    v: 2,
    id: invoice.id,
    number: invoice.number,
    sequence: invoice.sequence,
    invoice_date: invoice.invoice_date,
    period_start: invoice.period_start,
    period_end: invoice.period_end,
    source: {
      id: invoice.source.id,
      code: invoice.source.code,
      name: invoice.source.name,
      version: invoice.source.version,
    },
    chw: {
      name: invoice.chw.name,
      initials: invoice.chw.initials,
      mailing_address: invoice.chw.mailing_address,
    },
    rate_cents: invoice.rate_cents,
    entries: invoice.entries.map((e) => ({
      id: e.id,
      start: e.start,
      stop: e.stop,
      entry_date: e.entry_date,
      quarters: e.quarters,
      tasks: e.tasks.map((t) => ({
        task_id: t.task_id,
        task_name: t.task_name,
        core_competency: t.core_competency,
        quarters: t.quarters,
      })),
      budget_line_id: e.budget_line_id,
      budget_line_name: e.budget_line_name,
      counts: countsForm(e.counts),
      notes: e.notes,
    })),
    lines: invoice.lines.map((l) => ({
      budget_line_id: l.budget_line_id,
      budget_line_name: l.budget_line_name,
      quarters: l.quarters,
      rate_cents: l.rate_cents,
      amount_cents: l.amount_cents,
    })),
    total_quarters: invoice.total_quarters,
    total_cents: invoice.total_cents,
  });
}

/** Form v3 counts: every nonzero value by count id, then the other counts as entered. */
function countsFormV3(counts: Counts) {
  return {
    values: Object.fromEntries(Object.entries(counts.values).filter(([, v]) => v !== 0)),
    other: counts.other.map((o) => ({ label: o.label, value: o.value })),
  };
}

/**
 * Forms v3, v4 and v5 share this layout. v4 adds breaks; v5 adds each share's billed flag, the
 * flat-rate rows and the unbilled hours. Earlier forms' output must never change.
 */
function formWithRole(invoice: FingerprintedInvoice, v: 3 | 4 | 5 | 6 | 7): string {
  const role = invoice.role;
  return canonicalJson({
    v,
    id: invoice.id,
    kind: invoice.kind,
    number: invoice.number,
    sequence: invoice.sequence,
    invoice_date: invoice.invoice_date,
    period_start: invoice.period_start,
    period_end: invoice.period_end,
    role: role
      ? {
          id: role.id,
          code: role.code,
          name: role.name,
          employment: role.employment,
          chw: role.chw,
        }
      : null,
    source: {
      id: invoice.source.id,
      code: invoice.source.code,
      name: invoice.source.name,
      version: invoice.source.version,
      certification_text: invoice.source.certification_text,
    },
    chw: {
      name: invoice.chw.name,
      initials: invoice.chw.initials,
      mailing_address: invoice.chw.mailing_address,
    },
    rate_cents: invoice.rate_cents,
    entries: invoice.entries.map((e) => ({
      id: e.id,
      start: e.start,
      stop: e.stop,
      ...(v >= 4 && { breaks: e.breaks.map((b) => ({ start: b.start, stop: b.stop })) }),
      entry_date: e.entry_date,
      quarters: e.quarters,
      tasks: e.tasks.map((t) => ({
        task_id: t.task_id,
        task_name: t.task_name,
        core_competency: t.core_competency,
        quarters: t.quarters,
        ...(v >= 5 && { billed: t.billed !== false }),
      })),
      budget_line_id: e.budget_line_id,
      budget_line_name: e.budget_line_name,
      counts: countsFormV3(e.counts),
      ...(v >= 6 && { fees: { ...(e.fees ?? {}) } }),
      notes: e.notes,
    })),
    lines: invoice.lines.map((l) => ({
      budget_line_id: l.budget_line_id,
      budget_line_name: l.budget_line_name,
      quarters: l.quarters,
      rate_cents: l.rate_cents,
      amount_cents: l.amount_cents,
    })),
    ...(v >= 5 && {
      flat_lines: (invoice.flat_lines ?? []).map((l) => ({
        budget_line_id: l.budget_line_id,
        budget_line_name: l.budget_line_name,
        task_id: l.task_id,
        task_name: l.task_name,
        count_id: l.count_id,
        count_label: l.count_label,
        units_quarters: l.units_quarters,
        cents_per_unit: l.cents_per_unit,
        amount_cents: l.amount_cents,
      })),
      unbilled_quarters: invoice.unbilled_quarters ?? 0,
    }),
    ...(v >= 6 && {
      fee_lines: (invoice.fee_lines ?? []).map((l) => ({
        budget_line_id: l.budget_line_id,
        budget_line_name: l.budget_line_name,
        task_id: l.task_id,
        task_name: l.task_name,
        entries: l.entries,
        max_cents: l.max_cents,
        amount_cents: l.amount_cents,
      })),
    }),
    ...(v >= 7 && {
      trip_lines: (invoice.trip_lines ?? []).map((l) => ({
        budget_line_id: l.budget_line_id,
        budget_line_name: l.budget_line_name,
        task_id: l.task_id,
        task_name: l.task_name,
        from_miles: l.from_miles,
        to_miles: l.to_miles,
        trips: l.trips,
        fee_cents: l.fee_cents,
        amount_cents: l.amount_cents,
      })),
      gas_lines: (invoice.gas_lines ?? []).map((l) => ({
        budget_line_id: l.budget_line_id,
        budget_line_name: l.budget_line_name,
        amount_cents: l.amount_cents,
      })),
    }),
    total_quarters: invoice.total_quarters,
    total_cents: invoice.total_cents,
  });
}

/**
 * Canonical form v3: as v2, plus the invoice's kind (invoice or timesheet), the role it was made
 * under, the certification text it prints, and each entry's counts by count id (roles plan R5).
 */
export function canonicalFormV3(invoice: FingerprintedInvoice): string {
  return formWithRole(invoice, 3);
}

/** Canonical form v4: as v3, plus each entry's breaks (decision 0037). */
export function canonicalFormV4(invoice: FingerprintedInvoice): string {
  return formWithRole(invoice, 4);
}

/**
 * Canonical form v5: as v4, plus each task share's billed flag, the flat-rate rows and the
 * unbilled hours (decision 0039).
 */
export function canonicalFormV5(invoice: FingerprintedInvoice): string {
  return formWithRole(invoice, 5);
}

/** Canonical form v6: as v5, plus each entry's service fees and the fee rows (decision 0043). */
export function canonicalFormV6(invoice: FingerprintedInvoice): string {
  return formWithRole(invoice, 6);
}

/** Canonical form v7: as v6, plus the trip rows and the gas rows (decision 0045). */
export function canonicalFormV7(invoice: FingerprintedInvoice): string {
  return formWithRole(invoice, 7);
}

const FORMS: Record<number, (invoice: FingerprintedInvoice) => string> = {
  1: canonicalFormV1,
  2: canonicalFormV2,
  3: canonicalFormV3,
  4: canonicalFormV4,
  5: canonicalFormV5,
  6: canonicalFormV6,
  7: canonicalFormV7,
};

/** The canonical string for the invoice's own canonical version. */
export function canonicalForm(invoice: FingerprintedInvoice): string {
  const form = FORMS[invoice.canonical_version];
  if (!form) throw new RangeError(`Unknown canonical version ${String(invoice.canonical_version)}`);
  return form(invoice);
}

/** SHA-256 of a string as 64 lower-case hex characters (WebCrypto). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function fingerprintOf(invoice: FingerprintedInvoice): Promise<string> {
  return sha256Hex(canonicalForm(invoice));
}

/** 3f9a21c7… → "3F9A-21C7", as printed on the PDF. */
export function shortFingerprint(fingerprint: string): string {
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) throw new RangeError('Not a SHA-256 hex fingerprint');
  return `${fingerprint.slice(0, 4)}-${fingerprint.slice(4, 8)}`.toUpperCase();
}

/** True when the stored fingerprint matches the invoice's data. */
export async function verifyFingerprint(invoice: Invoice): Promise<boolean> {
  return (await fingerprintOf(invoice)) === invoice.fingerprint;
}
