// Step-by-step data upgrades (CLAUDE.md rule 7). Each step is a pure function from one
// version's stores to the next. The IndexedDB adapter runs them inside the upgrade
// transaction, so a step that throws leaves the old data and version untouched.
import { checkEntryTimes } from '../core/time';
import { DATA_VERSION, STORES_V1, STORES_V6 } from './records';
import type { StoredRecord } from './types';

/** Every store's records, by store name. Old versions may have stores v1 doesn't. */
export type Snapshot = Record<string, StoredRecord[]>;

/** Upgrade from version `key` to `key + 1`. */
export type UpgradeStep = (snapshot: Snapshot) => Snapshot;

export interface Schema {
  /** The data format version this app writes. */
  version: number;
  /** Store names per version. */
  layouts: Record<number, readonly string[]>;
  /** Upgrade steps by the version they start from. */
  steps: Record<number, UpgradeStep>;
}

/** v1 → v2: app state gains `draft`, empty until the CHW starts an entry or setup. */
export const v1ToV2: UpgradeStep = (snapshot) => ({
  ...snapshot,
  app_state: (snapshot['app_state'] ?? []).map((record) => ({ ...record, draft: null })),
});

type WithTask = StoredRecord & { task_id?: unknown };

/** Drop the one-task fields and put `tasks` where they were, keeping the other fields. */
function replaceTask(record: WithTask, tasks: unknown): StoredRecord {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'task_id') copy['tasks'] = tasks;
    else if (key !== 'task_name' && key !== 'core_competency') copy[key] = value;
  }
  return copy as unknown as StoredRecord;
}

/**
 * v2 → v3 (decision 0024): every entry's `task_id` becomes one task share holding all its billed
 * quarter-hours. The same goes for drafts (the share is filled in at save) and for entries frozen
 * in past invoices, which keep canonical form v1 and still verify.
 */
export const v2ToV3: UpgradeStep = (snapshot) => ({
  ...snapshot,
  entries: (snapshot['entries'] ?? []).map((record) => {
    const e = record as WithTask & { start: string; stop: string };
    const times = checkEntryTimes(e.start, e.stop);
    return replaceTask(e, [{ task_id: e.task_id, quarters: times.ok ? times.quarters : 0 }]);
  }),
  invoices: (snapshot['invoices'] ?? []).map((record) => {
    const invoice = record as StoredRecord & { entries: WithTask[] };
    return {
      ...invoice,
      entries: invoice.entries.map((e) => {
        const old = e as WithTask & {
          task_name: string;
          core_competency: string | null;
          quarters: number;
        };
        return replaceTask(old, [
          {
            task_id: old.task_id,
            task_name: old.task_name,
            core_competency: old.core_competency,
            quarters: old.quarters,
          },
        ]);
      }),
    };
  }),
  app_state: (snapshot['app_state'] ?? []).map((record) => {
    const state = record as StoredRecord & { draft: (WithTask & { kind: string }) | null };
    const draft = state.draft;
    if (draft?.kind !== 'entry') return state;
    const tasks =
      typeof draft.task_id === 'string' ? [{ task_id: draft.task_id, quarters: 0 }] : [];
    return { ...state, draft: replaceTask(draft, tasks) };
  }),
});

/** The five counts data v3 and earlier kept as fields, in their order, as v4 names them. */
const V3_COUNTS = [
  { id: 'contacts', label: 'Contacts' },
  { id: 'referrals_given', label: 'Referrals given' },
  { id: 'referral_followups', label: 'Referral follow-ups' },
  { id: 'rides_provided', label: 'Rides provided' },
  { id: 'applications_completed', label: 'Applications completed' },
] as const;

/** v3 counts (five fields plus `other`) → v4 counts (`values` by id plus `other`). */
function countsV4(counts: Record<string, unknown>) {
  return {
    values: Object.fromEntries(V3_COUNTS.map(({ id }) => [id, counts[id] ?? 0])),
    other: counts['other'] ?? [],
  };
}

type WithCounts = StoredRecord & { counts: Record<string, unknown> };

/** A half-done v3 setup starts over at its details step with no role; typed rates are kept. */
function setupDraftV4(draft: object) {
  const sources = (draft as { sources?: Record<string, { rate?: unknown }> }).sources ?? {};
  return {
    ...draft,
    step: 'details',
    role_id: null,
    sources: Object.fromEntries(
      Object.entries(sources).map(([id, s]) => [id, { rate: s.rate ?? '' }]),
    ),
  };
}

/**
 * v3 → v4 (roles plans R3 and R4, decision 0027): profiles and entries get no role (`role_id: null`;
 * none is guessed), counts move under their count ids, and invoices become `kind: "invoice"`
 * with no role and the labels of the five counts they hold. Frozen invoices keep their canonical
 * version and still verify: forms v1 and v2 read the same five values from the map. A half-done
 * setup starts over at its details step, since setup now picks a role. App state gains an empty
 * `role_notice` (roles plan R7).
 */
export const v3ToV4: UpgradeStep = (snapshot) => ({
  ...snapshot,
  profile: (snapshot['profile'] ?? []).map((record) => ({ ...record, role_id: null })),
  entries: (snapshot['entries'] ?? []).map((record) => {
    const e = record as WithCounts;
    return { ...e, role_id: null, counts: countsV4(e.counts) };
  }),
  invoices: (snapshot['invoices'] ?? []).map((record) => {
    const invoice = record as StoredRecord & {
      entries: WithCounts[];
      counts_period: Record<string, unknown>;
      counts_all_time: Record<string, unknown>;
    };
    return {
      ...invoice,
      kind: 'invoice',
      role: null,
      entries: invoice.entries.map((e) => ({ ...e, counts: countsV4(e.counts) })),
      counts_period: countsV4(invoice.counts_period),
      counts_all_time: countsV4(invoice.counts_all_time),
      count_defs: V3_COUNTS.map((c) => ({ ...c })),
    };
  }),
  app_state: (snapshot['app_state'] ?? []).map((record) => {
    const state = {
      ...(record as StoredRecord & { draft: (WithCounts & { kind: string }) | null }),
      role_notice: null,
    };
    const draft = state.draft;
    if (draft?.kind === 'setup') return { ...state, draft: setupDraftV4(draft) };
    if (draft?.kind !== 'entry') return state;
    return { ...state, draft: { ...draft, counts: countsV4(draft.counts) } };
  }),
});

/**
 * v4 → v5 (decision 0037): entries, entry drafts and frozen invoice entries get no breaks; a
 * running timer is running, not paused, with no breaks. Frozen invoices keep their canonical
 * version, and forms v1 to v3 never read breaks, so they still verify.
 */
export const v4ToV5: UpgradeStep = (snapshot) => ({
  ...snapshot,
  entries: (snapshot['entries'] ?? []).map((record) => ({ ...record, breaks: [] })),
  invoices: (snapshot['invoices'] ?? []).map((record) => {
    const invoice = record as StoredRecord & { entries: object[] };
    return { ...invoice, entries: invoice.entries.map((e) => ({ ...e, breaks: [] })) };
  }),
  app_state: (snapshot['app_state'] ?? []).map((record) => {
    const state = record as StoredRecord & {
      running_timer: object | null;
      draft: { kind: string } | null;
    };
    return {
      ...state,
      running_timer: state.running_timer && { ...state.running_timer, paused_at: null, breaks: [] },
      draft: state.draft?.kind === 'entry' ? { ...state.draft, breaks: [] } : state.draft,
    };
  }),
});

/** v5 → v6 (decision 0041): an empty `task_progress` store; nothing else changes. */
export const v5ToV6: UpgradeStep = (snapshot) => ({ ...snapshot, task_progress: [] });

/**
 * v6 → v7 (decision 0043): entries get `fees` (cents by task id) and entry drafts get `fees`
 * (as typed), both empty. Frozen invoices are not rewritten.
 */
export const v6ToV7: UpgradeStep = (snapshot) => ({
  ...snapshot,
  entries: (snapshot['entries'] ?? []).map((e) => ({
    ...e,
    fees: (e as StoredRecord & { fees?: object }).fees ?? {},
  })),
  app_state: (snapshot['app_state'] ?? []).map((record) => {
    const state = record as StoredRecord & { draft: { kind: string; fees?: object } | null };
    return state.draft?.kind === 'entry'
      ? { ...state, draft: { ...state.draft, fees: state.draft.fees ?? {} } }
      : state;
  }),
});

export const SCHEMA: Schema = {
  version: DATA_VERSION,
  layouts: {
    1: STORES_V1,
    2: STORES_V1,
    3: STORES_V1,
    4: STORES_V1,
    5: STORES_V1,
    6: STORES_V6,
    7: STORES_V6,
  },
  steps: { 1: v1ToV2, 2: v2ToV3, 3: v3ToV4, 4: v4ToV5, 5: v5ToV6, 6: v6ToV7 },
};

/** Run every step from `from` up to `to`. Throws if one is missing or fails. */
export function runUpgrades(
  snapshot: Snapshot,
  from: number,
  to: number,
  steps: Record<number, UpgradeStep>,
): Snapshot {
  let current = structuredClone(snapshot);
  for (let v = from; v < to; v++) {
    const step = steps[v];
    if (!step) throw new Error(`No upgrade from data version ${String(v)}`);
    current = step(current);
  }
  return current;
}
