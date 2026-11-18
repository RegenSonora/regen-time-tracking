// Role choices on setup and the new-entry screen, rate prefill and counts per task
// (decisions 0027, 0028, 0029, 0030, 0033).
import { formatDollars, parseDollars } from './money';
import { RECENT_TASKS_SHOWN } from './picks';
import type {
  BudgetLine,
  CountDef,
  Counts,
  EntryFee,
  FlatRate,
  FundingSourceConfig,
  OtherCount,
  Role,
  RoleFunding,
  RolesFile,
  SourceSettings,
  Task,
  TripFee,
  TripTier,
} from './types';

/** The roles setup offers: active ones, in file order. */
export function roleChoices(roles: readonly Role[]): Role[] {
  return roles.filter((r) => !r.retired);
}

/**
 * The roles setup offers, under the office's headings in their order (decision 0044). Retired
 * roles and empty groups are left out. With no groups, one unnamed group in file order; an active
 * role missing from every group (the build forbids it) comes last, under no heading.
 */
export function roleGroups(
  file: Pick<RolesFile, 'roles' | 'role_groups'>,
): { name: string | null; roles: Role[] }[] {
  const active = roleChoices(file.roles);
  const byId = new Map(active.map((r) => [r.id, r]));
  const placed = new Set<string>();
  const groups: { name: string | null; roles: Role[] }[] = [];
  for (const group of file.role_groups ?? []) {
    const roles = group.role_ids.flatMap((id) => {
      const role = byId.get(id);
      if (!role || placed.has(id)) return [];
      placed.add(id);
      return [role];
    });
    if (roles.length > 0) groups.push({ name: group.name, roles });
  }
  const rest = active.filter((r) => !placed.has(r.id));
  if (rest.length > 0) groups.push({ name: null, roles: rest });
  return groups;
}

/**
 * The role a stored role id means now, following `replaced_by` (decision 0027). A retired role
 * with no replacement is returned as it is; undefined for an unknown id or a broken chain.
 */
export function resolveRole(roles: readonly Role[], id: string): Role | undefined {
  const seen = new Set<string>();
  let role = roles.find((r) => r.id === id);
  while (role?.replaced_by !== undefined) {
    if (seen.has(role.id)) return undefined;
    seen.add(role.id);
    const next: string = role.replaced_by;
    role = roles.find((r) => r.id === next);
  }
  return role;
}

export interface FundingChoice {
  funding: RoleFunding;
  source: FundingSourceConfig;
}

/**
 * The role's sources that take time dated `date` (YYYY-MM-DD), in the role's order: inside the
 * source's period and not after the funding entry's own end (decision 0033).
 */
export function fundingChoices(
  role: Role,
  sources: readonly FundingSourceConfig[],
  date: string,
): FundingChoice[] {
  const choices: FundingChoice[] = [];
  for (const funding of role.funding) {
    const source = sources.find((s) => s.id === funding.source_id);
    if (!source) continue;
    if (source.period_start !== null && date < source.period_start) continue;
    if (source.period_end !== null && date > source.period_end) continue;
    if (funding.ends !== undefined && date > funding.ends) continue;
    choices.push({ funding, source });
  }
  return choices;
}

function roleLine(role: Role, sourceId: string, lineId: string) {
  return role.funding
    .find((f) => f.source_id === sourceId)
    ?.budget_lines.find((l) => l.id === lineId);
}

/** The source's budget lines this role bills, in the role's order (decision 0028). */
export function budgetLineChoices(role: Role, source: FundingSourceConfig): BudgetLine[] {
  const lines = role.funding.find((f) => f.source_id === source.id)?.budget_lines ?? [];
  return lines.flatMap((l) => source.budget_lines.filter((b) => b.id === l.id));
}

/** The line a new entry starts on: the role's only line, else the last one used if still billed. */
export function roleDefaultLine(
  role: Role,
  source: FundingSourceConfig,
  lastId: string | null,
): string | null {
  const lines = budgetLineChoices(role, source);
  const [only, ...more] = lines;
  if (only && more.length === 0) return only.id;
  return lastId !== null && lines.some((l) => l.id === lastId) ? lastId : null;
}

/** The task ids the role lists under a line, in role order. */
export function roleTaskIds(role: Role, sourceId: string, lineId: string): string[] {
  return roleLine(role, sourceId, lineId)?.tasks.map((t) => t.id) ?? [];
}

/** "Recent" (most recent first, only this line's tasks) above the line's tasks in role order. */
export function taskChoices(
  role: Role,
  source: FundingSourceConfig,
  lineId: string,
  recentIds: readonly string[],
): { recent: Task[]; all: Task[] } {
  const ids = roleLine(role, source.id, lineId)?.tasks.map((t) => t.id) ?? [];
  const all = ids.flatMap((id) => source.tasks.filter((t) => t.id === id));
  const recent: Task[] = [];
  for (const id of new Set(recentIds)) {
    const task = all.find((t) => t.id === id);
    if (task) recent.push(task);
    if (recent.length === RECENT_TASKS_SHOWN) break;
  }
  return { recent, all };
}

/** The counts the checked tasks show, joined, in the shared list's order (decision 0029). */
export function countChoices(
  countDefs: readonly CountDef[],
  role: Role,
  source: FundingSourceConfig,
  lineId: string,
  taskIds: readonly string[],
): CountDef[] {
  const tasks = roleLine(role, source.id, lineId)?.tasks ?? [];
  const ids = new Set(tasks.filter((t) => taskIds.includes(t.id)).flatMap((t) => t.count_ids));
  return countDefs.filter((c) => ids.has(c.id));
}

/**
 * The counts an entry shows: the checked tasks' counts plus any count that already holds a value,
 * so nothing entered is hidden, in the shared list's order (decision 0029).
 */
export function entryCountChoices(
  countDefs: readonly CountDef[],
  role: Role,
  source: FundingSourceConfig,
  lineId: string | null,
  taskIds: readonly string[],
  counts: Counts,
): CountDef[] {
  const shown = new Set(
    lineId === null ? [] : countChoices(countDefs, role, source, lineId, taskIds).map((c) => c.id),
  );
  return countDefs.filter((c) => shown.has(c.id) || (counts.values[c.id] ?? 0) !== 0);
}

export type RolePickProblem = 'source_period' | 'budget_line' | 'task';

/**
 * Does an entry fit the role: its source takes time on that date, the role bills its line, and
 * every task is on that line (decisions 0028, 0033). Null when it does.
 */
export function checkRolePicks(
  role: Role,
  source: FundingSourceConfig,
  date: string,
  lineId: string | null,
  taskIds: readonly string[],
): RolePickProblem | null {
  if (fundingChoices(role, [source], date).length === 0) return 'source_period';
  if (lineId === null || !budgetLineChoices(role, source).some((l) => l.id === lineId)) {
    return 'budget_line';
  }
  const onLine = new Set(roleTaskIds(role, source.id, lineId));
  if (taskIds.length === 0 || taskIds.some((id) => !onLine.has(id))) return 'task';
  return null;
}

/** Rate filled in at setup: funding entry, then role, then source (decision 0030). */
export function prefillRate(
  role: Role,
  funding: RoleFunding,
  source: FundingSourceConfig,
): number | null {
  return funding.rate_cents ?? role.suggested_rate_cents ?? source.default_rate_cents ?? null;
}

const labelKey = (label: string) => label.replace(/\s+/g, '').toLowerCase();

/**
 * The entry's count a typed "Add another count" label repeats, ignoring letter case and spaces,
 * or null (decision 0029).
 */
export function duplicateCountLabel(label: string, counts: readonly CountDef[]): CountDef | null {
  const key = labelKey(label);
  if (key === '') return null;
  return counts.find((c) => labelKey(c.label) === key) ?? null;
}

export interface InvoiceCount {
  /** Null for an "Add another count" label. */
  id: string | null;
  label: string;
  unit: string | null;
  /** quarter: values are quarter-units, shown as decimals (decision 0039). */
  step: 'quarter' | null;
  period: number;
  all_time: number;
}

/** Merge other counts by trimmed label in any letter case, as sumCounts does. */
function otherByLabel(other: readonly OtherCount[]): Map<string, OtherCount> {
  const merged = new Map<string, OtherCount>();
  for (const { label, value } of other) {
    const trimmed = label.trim();
    const key = trimmed.toLowerCase();
    const seen = merged.get(key);
    if (seen) seen.value += value;
    else merged.set(key, { label: trimmed, value });
  }
  return merged;
}

/**
 * The counts an invoice or timesheet page lists: only those with a value in the period, each
 * with its all-time total, in the shared list's order, then other counts (decision 0029).
 */
export function invoiceCounts(
  countDefs: readonly CountDef[],
  period: Counts,
  allTime: Counts,
): InvoiceCount[] {
  const listed: InvoiceCount[] = countDefs
    .filter((c) => (period.values[c.id] ?? 0) !== 0)
    .map((c) => ({
      id: c.id,
      label: c.label,
      unit: c.unit ?? null,
      step: c.step ?? null,
      period: period.values[c.id] ?? 0,
      all_time: allTime.values[c.id] ?? 0,
    }));
  const allOther = otherByLabel(allTime.other);
  for (const [key, { label, value }] of otherByLabel(period.other)) {
    if (value === 0) continue;
    listed.push({
      id: null,
      label,
      unit: null,
      step: null,
      period: value,
      all_time: allOther.get(key)?.value ?? 0,
    });
  }
  return listed;
}

/** A source whose suggested rate differs from the rate in Settings after a role change (0030). */
export interface RateNote {
  source_id: string;
  rate_cents: number;
}

/** What a stored role id means after an app update (decision 0027, roles plan R7). */
export type RoleUpdate =
  | { state: 'none' }
  | { state: 'active'; role: Role }
  | {
      state: 'replaced';
      /** The role the phone was set up with, or the last one it switched to. */
      from: Role;
      role: Role;
      /** Rates for sources the new role bills that have no settings yet. */
      add_settings: SourceSettings[];
      rate_notes: RateNote[];
    }
  /** Retired with no replacement (role kept for its wording), or an id the file no longer has. */
  | { state: 'inactive'; role: Role | null };

/**
 * The stored role id against the shipped roles file. A retired role with `replaced_by` moves the
 * person to its replacement; rates are never changed, only noted (decisions 0027, 0030).
 */
export function roleUpdate(
  roles: readonly Role[],
  storedId: string | null,
  settings: readonly SourceSettings[],
  sources: readonly FundingSourceConfig[],
): RoleUpdate {
  if (storedId === null) return { state: 'none' };
  const from = roles.find((r) => r.id === storedId);
  const role = resolveRole(roles, storedId);
  if (!from || !role) return { state: 'inactive', role: from ?? null };
  if (role.retired) return { state: 'inactive', role };
  if (role.id === from.id) return { state: 'active', role };

  const add_settings: SourceSettings[] = [];
  const rate_notes: RateNote[] = [];
  for (const funding of role.funding) {
    const source = sources.find((s) => s.id === funding.source_id);
    if (!source) continue;
    const suggested = prefillRate(role, funding, source);
    const current = settings.find((s) => s.source_id === source.id);
    if (!current) {
      if (suggested !== null) {
        add_settings.push({
          source_id: source.id,
          rate_cents: suggested,
          nte_cents: funding.nte_cents ?? null,
        });
      }
    } else if (suggested !== null && suggested !== current.rate_cents) {
      rate_notes.push({ source_id: source.id, rate_cents: suggested });
    }
  }
  return { state: 'replaced', from, role, add_settings, rate_notes };
}

/**
 * The role's flat-rate tasks on a source, by budget line id, then task id (decision 0039).
 * A flat-rate task's hours are tracked, not billed; its count is billed instead.
 */
export function flatRates(
  role: Pick<Role, 'funding'> | null | undefined,
  sourceId: string,
): Map<string, Map<string, FlatRate>> {
  const out = new Map<string, Map<string, FlatRate>>();
  const funding = role?.funding.find((f) => f.source_id === sourceId);
  for (const line of funding?.budget_lines ?? []) {
    for (const task of line.tasks) {
      if (!task.flat_rate) continue;
      const tasks = out.get(line.id) ?? new Map<string, FlatRate>();
      tasks.set(task.id, { ...task.flat_rate });
      out.set(line.id, tasks);
    }
  }
  return out;
}

/**
 * How the role's flat-rate tasks on a source are paid, for Settings: "LEHR reset: $140.00 each,
 * by the “LEHRs reset” count. Its hours are tracked, not billed." (decision 0039).
 */
export function flatRateNotes(
  role: Pick<Role, 'funding'> | null | undefined,
  source: Pick<FundingSourceConfig, 'id' | 'tasks'>,
  countDefs: readonly Pick<CountDef, 'id' | 'label'>[],
): string[] {
  const notes = new Set<string>();
  for (const tasks of flatRates(role, source.id).values()) {
    for (const [taskId, rate] of tasks) {
      const task = source.tasks.find((t) => t.id === taskId)?.name ?? taskId;
      const count = countDefs.find((c) => c.id === rate.count_id)?.label ?? rate.count_id;
      notes.add(
        `${task}: ${formatDollars(rate.cents_per_unit)} each, by the “${count}” count. Its hours are tracked, not billed.`,
      );
    }
  }
  return [...notes];
}

/** The role's service-fee tasks on a source, by budget line id, then task id (decision 0043). */
export function entryFees(
  role: Pick<Role, 'funding'> | null | undefined,
  sourceId: string,
): Map<string, Map<string, EntryFee>> {
  const out = new Map<string, Map<string, EntryFee>>();
  const funding = role?.funding.find((f) => f.source_id === sourceId);
  for (const line of funding?.budget_lines ?? []) {
    for (const task of line.tasks) {
      if (!task.entry_fee) continue;
      const tasks = out.get(line.id) ?? new Map<string, EntryFee>();
      tasks.set(task.id, { ...task.entry_fee });
      out.set(line.id, tasks);
    }
  }
  return out;
}

/** The role's trip-fee tasks on a source, by budget line id, then task id (decision 0045). */
export function tripFees(
  role: Pick<Role, 'funding'> | null | undefined,
  sourceId: string,
): Map<string, Map<string, TripFee>> {
  const out = new Map<string, Map<string, TripFee>>();
  const funding = role?.funding.find((f) => f.source_id === sourceId);
  for (const line of funding?.budget_lines ?? []) {
    for (const task of line.tasks) {
      if (!task.trip_fee) continue;
      const tasks = out.get(line.id) ?? new Map<string, TripFee>();
      tasks.set(task.id, structuredClone(task.trip_fee));
      out.set(line.id, tasks);
    }
  }
  return out;
}

/**
 * The counts that set a trip's fee for the checked tasks, so the entry screen can offer a box
 * to type the miles in instead of tapping + once per mile (decision 0045).
 */
export function tripMilesCountIds(
  role: Pick<Role, 'funding'> | null | undefined,
  sourceId: string,
  lineId: string,
  taskIds: readonly string[],
): Set<string> {
  const fees = tripFees(role, sourceId).get(lineId);
  const out = new Set<string>();
  for (const id of taskIds) {
    const trip = fees?.get(id);
    if (trip) out.add(trip.miles_count_id);
  }
  return out;
}

/** The tier a trip of whole miles falls in; null for no miles or miles that aren't whole. */
export function tripTier(trip: TripFee, miles: number): TripTier | null {
  if (!Number.isSafeInteger(miles) || miles < 1) return null;
  return (
    trip.tiers.find(
      (t) => miles >= t.from_miles && (t.to_miles === undefined || miles <= t.to_miles),
    ) ?? null
  );
}

/** "31–60 mi", or "161+ mi" for the open tier. */
export function tierLabel(tier: Pick<TripTier, 'from_miles' | 'to_miles'>): string {
  return tier.to_miles === undefined
    ? `${String(tier.from_miles)}+ mi`
    : `${String(tier.from_miles)}–${String(tier.to_miles)} mi`;
}

export type EntryTrip =
  | { state: 'none' }
  | { state: 'missing'; task_id: string }
  | { state: 'trip'; task_id: string; tier: TripTier };

/**
 * The trip on an entry (decision 0045): none when no trip-fee task is checked; missing when its
 * miles aren't a whole number of at least 1 (Save needs them); otherwise its tier. One entry is
 * one trip, so the first checked trip-fee task is the one paid.
 */
export function entryTrip(
  role: Pick<Role, 'funding'> | null | undefined,
  sourceId: string,
  lineId: string,
  taskIds: readonly string[],
  values: Readonly<Record<string, number>>,
): EntryTrip {
  const fees = tripFees(role, sourceId).get(lineId);
  const taskId = taskIds.find((id) => fees?.has(id) === true);
  const trip = taskId === undefined ? undefined : fees?.get(taskId);
  if (taskId === undefined || !trip) return { state: 'none' };
  const tier = tripTier(trip, values[trip.miles_count_id] ?? 0);
  return tier ? { state: 'trip', task_id: taskId, tier } : { state: 'missing', task_id: taskId };
}

/**
 * How the role's trip-fee tasks on a source are paid, for Settings: "Transportation service:
 * $20.00 a trip for 1–30 mi, $40.00 + $20.00 gas for 31–60 mi, …" (decision 0045).
 */
export function tripFeeNotes(
  role: Pick<Role, 'funding'> | null | undefined,
  source: Pick<FundingSourceConfig, 'id' | 'tasks'>,
): string[] {
  const notes = new Set<string>();
  for (const tasks of tripFees(role, source.id).values()) {
    for (const [taskId, trip] of tasks) {
      const task = source.tasks.find((t) => t.id === taskId)?.name ?? taskId;
      const tiers = trip.tiers.map((t, i) => {
        const gas = t.gas_cents === undefined ? '' : ` + ${formatDollars(t.gas_cents)} gas`;
        return `${formatDollars(t.fee_cents)}${i === 0 ? ' a trip' : ''}${gas} for ${tierLabel(t)}`;
      });
      notes.add(
        `${task}: ${tiers.join(', ')}. One entry is one trip, by its miles driven. Its hours are tracked, not billed.`,
      );
    }
  }
  return [...notes];
}

/**
 * Tasks of a line whose hours are tracked, not billed: those paid by a count, by a service fee or
 * by the trip (decisions 0039, 0043, 0045).
 */
export function unbilledTaskIds(
  role: Pick<Role, 'funding'> | null | undefined,
  sourceId: string,
  lineId: string,
): Set<string> {
  return new Set([
    ...(flatRates(role, sourceId).get(lineId)?.keys() ?? []),
    ...(entryFees(role, sourceId).get(lineId)?.keys() ?? []),
    ...(tripFees(role, sourceId).get(lineId)?.keys() ?? []),
  ]);
}

export type FeeText = { ok: true; cents: number } | { ok: false; reason: 'bad' | 'over' };

/**
 * A service fee as typed (decision 0043): untouched (undefined) means the full fee; otherwise an
 * amount from $0.00 up to the fee.
 */
export function feeFromText(text: string | undefined, fee: EntryFee): FeeText {
  if (text === undefined) return { ok: true, cents: fee.max_cents };
  const cents = parseDollars(text);
  if (cents === null) return { ok: false, reason: 'bad' };
  if (cents > fee.max_cents) return { ok: false, reason: 'over' };
  return { ok: true, cents };
}

/**
 * How the role's service-fee tasks on a source are paid, for Settings: "Wednesday dinner service:
 * up to $200.00 each entry. Lower it on the entry if you charged less. Its hours are tracked,
 * not billed." (decision 0043).
 */
export function entryFeeNotes(
  role: Pick<Role, 'funding'> | null | undefined,
  source: Pick<FundingSourceConfig, 'id' | 'tasks'>,
): string[] {
  const notes = new Set<string>();
  for (const tasks of entryFees(role, source.id).values()) {
    for (const [taskId, fee] of tasks) {
      const task = source.tasks.find((t) => t.id === taskId)?.name ?? taskId;
      notes.add(
        `${task}: up to ${formatDollars(fee.max_cents)} each entry. Lower it on the entry if you charged less. Its hours are tracked, not billed.`,
      );
    }
  }
  return [...notes];
}
