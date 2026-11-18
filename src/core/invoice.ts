// Invoice builder (SPEC §6): one funding source, every uninvoiced entry for it.
import { quarterUnitsText, sumCounts } from './counts';
import { CANONICAL_VERSION, fingerprintOf, type FingerprintedInvoice } from './fingerprint';
import { formatInvoiceNumber, normalizeInitials, takeNumber } from './invoice-number';
import { flatAmountCents, formatQuarters, lineAmountCents, sumCents } from './money';
import { flatRates } from './roles';
import { sharesMatch } from './task-split';
import { checkEntryTimes, entryDateOf, parseIso } from './time';
import type {
  CountDef,
  Entry,
  FundingSourceConfig,
  Invoice,
  InvoiceCounter,
  InvoiceEntry,
  InvoiceFlatLine,
  InvoiceLine,
  NteStatus,
  Profile,
  Role,
  SourceSettings,
} from './types';

export interface InvoiceInput {
  /** New invoice UUID. */
  id: string;
  /** Creation time, ISO 8601 with offset. */
  now: string;
  /** YYYY-MM-DD, the day it is generated. */
  invoice_date: string;
  source: FundingSourceConfig;
  settings: SourceSettings;
  profile: Profile;
  /**
   * The role this invoice is made under: that of the hours it bills, which after an office
   * change may be an older role than the person's (roles plan R7). Null for no role. Employees
   * get a timesheet (decision 0031).
   */
  role: Role | null;
  /**
   * Bill only waiting entries logged under this role id (see invoiceRoleId); the rest wait for
   * the next invoice. Undefined bills every waiting entry of the source.
   */
  entry_role_id?: string | null;
  /** The shared count list, for the labels the invoice freezes (decision 0029). */
  count_defs: readonly CountDef[];
  counter: InvoiceCounter;
  /** All entries on the phone; only this source's uninvoiced ones are used. */
  entries: readonly Entry[];
  /** All invoices on the phone, for the NTE tracker and all-time counts. */
  prior_invoices: readonly Invoice[];
}

export type InvoiceProblem =
  | { reason: 'no_entries' }
  | { reason: 'no_rate' }
  | { reason: 'bad_initials' }
  | { reason: 'bad_settings' }
  | { reason: 'bad_date' }
  | { reason: 'bad_entry'; entry_id: string };

export type InvoiceDraftResult =
  | { ok: true; invoice: FingerprintedInvoice; counter: InvoiceCounter; entry_ids: string[] }
  | ({ ok: false } & InvoiceProblem);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(text: string): boolean {
  return DATE.test(text) && new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text;
}

/** The uninvoiced entries a Generate button for this source would bill (SPEC §6). */
export function uninvoicedEntries(entries: readonly Entry[], sourceId: string): Entry[] {
  return entries.filter((e) => e.source_id === sourceId && e.invoice_id === null);
}

/**
 * The role the next invoice or timesheet at a source is made under: that of the oldest waiting
 * entry. Hours keep the role they were logged with, so after a role change the old role's hours
 * go first (roles plan R7). Undefined when nothing waits.
 */
export function invoiceRoleId(
  entries: readonly Entry[],
  sourceId: string,
): string | null | undefined {
  const waiting = uninvoicedEntries(entries, sourceId).sort((a, b) =>
    a.start < b.start ? -1 : a.start > b.start ? 1 : 0,
  );
  return waiting[0]?.role_id;
}

/**
 * Everything the invoice preview shows, without the fingerprint. Pure and synchronous;
 * createInvoice adds the fingerprint.
 */
export function buildInvoiceDraft(input: InvoiceInput): InvoiceDraftResult {
  const { source, settings, profile } = input;
  if (settings.source_id !== source.id) return { ok: false, reason: 'bad_settings' };
  if (!Number.isSafeInteger(settings.rate_cents) || settings.rate_cents < 1) {
    return { ok: false, reason: 'no_rate' };
  }
  if (normalizeInitials(profile.initials) !== profile.initials) {
    return { ok: false, reason: 'bad_initials' };
  }
  if (!isDate(input.invoice_date)) return { ok: false, reason: 'bad_date' };

  const tasks = new Map(source.tasks.map((t) => [t.id, t]));
  const taskIds = new Set(tasks.keys());
  const lines = new Map(source.budget_lines.map((l) => [l.id, l]));
  const billed = uninvoicedEntries(input.entries, source.id).filter(
    (e) => input.entry_role_id === undefined || e.role_id === input.entry_role_id,
  );
  if (billed.length === 0) return { ok: false, reason: 'no_entries' };

  // Flat-rate tasks: hours tracked, not billed; the count is billed instead (decision 0039).
  const flat = flatRates(input.role, source.id);
  const isFlat = (lineId: string, taskId: string) => flat.get(lineId)?.has(taskId) === true;

  const frozen: InvoiceEntry[] = [];
  for (const e of billed) {
    const line = lines.get(e.budget_line_id);
    const times = checkEntryTimes(e.start, e.stop, e.breaks);
    if (
      !line ||
      !times.ok ||
      entryDateOf(e.start) !== e.entry_date ||
      !sharesMatch(e.tasks, times.quarters, taskIds)
    ) {
      return { ok: false, reason: 'bad_entry', entry_id: e.id };
    }
    frozen.push({
      id: e.id,
      start: e.start,
      stop: e.stop,
      breaks: e.breaks.map((b) => ({ ...b })),
      entry_date: e.entry_date,
      quarters: times.quarters,
      tasks: e.tasks.map((s) => {
        const task = tasks.get(s.task_id) ?? { id: s.task_id, name: '', core_competency: null };
        return {
          task_id: task.id,
          task_name: task.name,
          core_competency: task.core_competency,
          quarters: s.quarters,
          ...(isFlat(e.budget_line_id, s.task_id) && { billed: false as const }),
        };
      }),
      budget_line_id: line.id,
      budget_line_name: line.name,
      counts: structuredClone(e.counts),
      notes: e.notes,
      created_at: e.created_at,
      updated_at: e.updated_at,
    });
  }
  frozen.sort(
    (a, b) =>
      parseIso(a.start).epochMs - parseIso(b.start).epochMs ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  // One line per budget line with billed hours, in the source's order (decision 0002).
  const sharesOf = (lineId: string) =>
    frozen.filter((e) => e.budget_line_id === lineId).flatMap((e) => e.tasks);
  const invoiceLines: InvoiceLine[] = [];
  const flatLines: InvoiceFlatLine[] = [];
  let unbilledQuarters = 0;
  for (const line of source.budget_lines) {
    const shares = sharesOf(line.id);
    const quarters = shares.filter((t) => t.billed !== false).reduce((n, t) => n + t.quarters, 0);
    unbilledQuarters += shares
      .filter((t) => t.billed === false)
      .reduce((n, t) => n + t.quarters, 0);
    flatLines.push(...flatLinesOf(line, flat.get(line.id), frozen, tasks, input.count_defs));
    if (quarters === 0) continue;
    invoiceLines.push({
      budget_line_id: line.id,
      budget_line_name: line.name,
      quarters,
      rate_cents: settings.rate_cents,
      amount_cents: lineAmountCents(quarters, settings.rate_cents),
    });
  }
  const totalCents = sumCents([
    ...invoiceLines.map((l) => l.amount_cents),
    ...flatLines.map((l) => l.amount_cents),
  ]);
  const totalQuarters = invoiceLines.reduce((sum, l) => sum + l.quarters, 0);

  const earlier = input.prior_invoices.filter((i) => i.source.id === source.id);
  // Timesheets track no not-to-exceed amount (decision 0031).
  const nte: NteStatus =
    input.role?.employment === 'employee'
      ? { state: 'none' }
      : nteStatus(source, settings, earlier, totalCents);
  const countsPeriod = sumCounts(frozen.map((e) => e.counts));
  const countsAllTime = sumCounts([...earlier.map((i) => i.counts_period), countsPeriod]);
  const hasValue = (id: string) =>
    (countsPeriod.values[id] ?? 0) !== 0 || (countsAllTime.values[id] ?? 0) !== 0;
  const role = input.role;

  const dates = frozen.map((e) => e.entry_date).sort();
  const { sequence, counter } = takeNumber(input.counter);
  const year = Number(input.invoice_date.slice(0, 4));

  return {
    ok: true,
    counter,
    entry_ids: frozen.map((e) => e.id),
    invoice: {
      id: input.id,
      number: formatInvoiceNumber(profile.initials, year, sequence),
      sequence,
      kind: role?.employment === 'employee' ? 'timesheet' : 'invoice',
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
        id: source.id,
        code: source.code,
        name: source.name,
        version: source.version,
        certification_text: certificationText(source, role),
      },
      chw: {
        name: profile.name,
        initials: profile.initials,
        mailing_address: profile.mailing_address,
      },
      invoice_date: input.invoice_date,
      period_start: dates[0] ?? '',
      period_end: dates[dates.length - 1] ?? '',
      rate_cents: settings.rate_cents,
      entries: frozen,
      lines: invoiceLines,
      flat_lines: flatLines,
      total_quarters: totalQuarters,
      unbilled_quarters: unbilledQuarters,
      total_cents: totalCents,
      counts_period: countsPeriod,
      counts_all_time: countsAllTime,
      count_defs: input.count_defs.filter((c) => hasValue(c.id)).map((c) => structuredClone(c)),
      nte,
      canonical_version: CANONICAL_VERSION,
      created_at: input.now,
      updated_at: input.now,
    },
  };
}

/**
 * One row per flat-rate task of the line that has a count this period: the count summed over
 * the entries that checked the task, × the cents per unit (decision 0039).
 */
function flatLinesOf(
  line: { id: string; name: string },
  rates: ReadonlyMap<string, { count_id: string; cents_per_unit: number }> | undefined,
  frozen: readonly InvoiceEntry[],
  tasks: ReadonlyMap<string, { name: string }>,
  countDefs: readonly CountDef[],
): InvoiceFlatLine[] {
  const rows: InvoiceFlatLine[] = [];
  for (const [taskId, rate] of rates ?? []) {
    const def = countDefs.find((c) => c.id === rate.count_id);
    // Whole-step counts are kept in quarter-units here too, so every fee is worked out alike.
    const perUnit = def?.step === 'quarter' ? 1 : 4;
    const units = frozen
      .filter((e) => e.budget_line_id === line.id && e.tasks.some((t) => t.task_id === taskId))
      .reduce((n, e) => n + (e.counts.values[rate.count_id] ?? 0) * perUnit, 0);
    if (units === 0) continue;
    rows.push({
      budget_line_id: line.id,
      budget_line_name: line.name,
      task_id: taskId,
      task_name: tasks.get(taskId)?.name ?? '',
      count_id: rate.count_id,
      count_label: def?.label ?? rate.count_id,
      units_quarters: units,
      cents_per_unit: rate.cents_per_unit,
      amount_cents: flatAmountCents(units, rate.cents_per_unit),
    });
  }
  return rows;
}

/**
 * The certification the page prints: employees sign the employee text, others the contractor
 * text; a role may override either (decision 0031).
 */
export function certificationText(source: FundingSourceConfig, role: Role | null): string {
  if (role?.employment === 'employee') {
    return (
      role.employee_certification_text ??
      source.employee_certification_text ??
      source.certification_text
    );
  }
  return role?.certification_text ?? source.certification_text;
}

function nteStatus(
  source: FundingSourceConfig,
  settings: SourceSettings,
  earlier: readonly Invoice[],
  thisInvoiceCents: number,
): NteStatus {
  if (!source.has_nte) return { state: 'none' };
  if (settings.nte_cents === null) return { state: 'not_entered' };
  const billedBefore = sumCents(earlier.map((i) => i.total_cents));
  const remaining = settings.nte_cents - billedBefore - thisInvoiceCents;
  return {
    state: 'tracked',
    nte_cents: settings.nte_cents,
    billed_before_cents: billedBefore,
    this_invoice_cents: thisInvoiceCents,
    remaining_cents: remaining,
    over: remaining < 0,
  };
}

export type InvoiceResult =
  | { ok: true; invoice: Invoice; counter: InvoiceCounter; entry_ids: string[] }
  | ({ ok: false } & InvoiceProblem);

/** The finished invoice with its fingerprint. Storage saves it, locks entry_ids and stores counter in one transaction. */
export async function createInvoice(input: InvoiceInput): Promise<InvoiceResult> {
  const draft = buildInvoiceDraft(input);
  if (!draft.ok) return draft;
  const fingerprint = await fingerprintOf(draft.invoice);
  return { ...draft, invoice: { ...draft.invoice, fingerprint } };
}

/** One row of an invoice's lines table: hours by budget line, or a flat-rate fee (0039). */
export type InvoiceRow =
  { kind: 'hours'; line: InvoiceLine } | { kind: 'flat'; flat: InvoiceFlatLine };

/**
 * The lines table in order: each budget line's hourly row, then its flat-rate rows. Flat rows
 * of a line with no billed hours follow the hourly rows, in budget line order (decision 0039).
 */
export function invoiceRows(invoice: Pick<Invoice, 'lines' | 'flat_lines'>): InvoiceRow[] {
  const flat = invoice.flat_lines ?? [];
  const hourly = new Set(invoice.lines.map((l) => l.budget_line_id));
  return [
    ...invoice.lines.flatMap((line): InvoiceRow[] => [
      { kind: 'hours', line },
      ...flat
        .filter((f) => f.budget_line_id === line.budget_line_id)
        .map((f): InvoiceRow => ({ kind: 'flat', flat: f })),
    ]),
    ...flat
      .filter((f) => !hourly.has(f.budget_line_id))
      .map((f): InvoiceRow => ({ kind: 'flat', flat: f })),
  ];
}

/** "Eat Local Network: 2.5 LEHRs reset", the flat row's name on the page and preview. */
export function flatRowName(flat: InvoiceFlatLine): string {
  return `${flat.budget_line_name}: ${quarterUnitsText(flat.units_quarters)} ${flat.count_label}`;
}

/**
 * "2.50 hrs of LEHR reset tracked, not billed (paid per count above)", or "" when every hour is
 * billed (decision 0039).
 */
export function unbilledNote(invoice: Pick<Invoice, 'entries' | 'unbilled_quarters'>): string {
  const quarters = invoice.unbilled_quarters ?? 0;
  if (quarters === 0) return '';
  const names = [
    ...new Set(
      invoice.entries.flatMap((e) =>
        e.tasks.filter((t) => t.billed === false).map((t) => t.task_name),
      ),
    ),
  ];
  return `${formatQuarters(quarters)} hrs of ${names.join(', ')} tracked, not billed (paid per count above)`;
}
