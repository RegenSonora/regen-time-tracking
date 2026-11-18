// Shared record shapes. Field names are snake_case so stored and exported data read the same.
// Money is integer cents; hours are integer quarter-hours (CLAUDE.md data conventions).
import type { Break } from './time';

export type { Break } from './time';

/** A funding source file in src/funding-sources/ (schemas/funding-source.schema.json, SPEC §3). */
export interface FundingSourceConfig {
  format_version: 1;
  id: string;
  /** Short name for the chip, buttons and file names (decision 0006). */
  code: string;
  name: string;
  version: number;
  /** First and last day hours can be dated for this source; null for no limit (decision 0033). */
  period_start: string | null;
  period_end: string | null;
  has_nte: boolean;
  default_rate_cents: number | null;
  /** NTE prefilled at setup (decision 0023). */
  default_nte_cents?: number;
  /** A raise after some billed hours; the app only reminds (decision 0023). */
  rate_step?: RateStep;
  /** Invoiced hours for CHW certification eligibility (decision 0026). */
  certification_step?: CertificationStep;
  /** Who funds the work, for the Work Hours Report (decision 0026). */
  report_funding_line?: string;
  certification_text: string;
  /** Certification statement on employee timesheets (decision 0031). */
  employee_certification_text?: string;
  tasks: Task[];
  budget_lines: BudgetLine[];
}

export interface RateStep {
  /** Quarter-hours billed before the raise, e.g. 960 for 240 hours. */
  after_quarters: number;
  rate_cents: number;
}

export interface CertificationStep {
  /** Quarter-hours invoiced, e.g. 1920 for 480 hours. */
  after_quarters: number;
  /** Short name on Home, e.g. "CHW Cert". */
  name: string;
}

export interface Task {
  id: string;
  name: string;
  /** Null when the task has none (Domestic support). */
  core_competency: string | null;
}

export interface BudgetLine {
  id: string;
  /** Printed on invoices, timesheets and CSVs. */
  name: string;
  /** Shown in the app instead of `name` when set (decision 0028). */
  display_name?: string;
}

/** src/roles/roles.json (schemas/roles.schema.json, decisions 0027, 0029). */
export interface RolesFile {
  format_version: 1;
  version: number;
  /** Headings on Pick your role, each with its roles in order (decision 0044). */
  role_groups?: RoleGroup[];
  /** Every count any task shows, in display and entry log column order. */
  counts: CountDef[];
  roles: Role[];
}

/** A heading on Pick your role and the roles under it (decision 0044). */
export interface RoleGroup {
  name: string;
  role_ids: string[];
}

/** One count in the shared list (decision 0029). */
export interface CountDef {
  /** Entry log column name; never changes, never reused. */
  id: string;
  label: string;
  /** Shown after the number, e.g. "gal". */
  unit?: string;
  /** quarter: steps by 0.25, stored as whole quarter-units (decision 0039). */
  step?: 'quarter';
  retired?: true;
}

export interface Role {
  id: string;
  /** e.g. CHW-TC01 */
  code: string;
  name: string;
  employment: 'contractor' | 'employee';
  /** Core competency column and Work Hours Report (decision 0032). */
  chw: boolean;
  suggested_rate_cents?: number;
  /** Invoiced or submitted hours for CHW certification eligibility (decision 0032). */
  certification_step?: CertificationStep;
  certification_text?: string;
  employee_certification_text?: string;
  retired?: true;
  /** Where people in this retired role move (decision 0027). */
  replaced_by?: string;
  /** The sources this role bills, in display order. */
  funding: RoleFunding[];
}

/** One source a role bills (decisions 0030, 0033). */
export interface RoleFunding {
  source_id: string;
  rate_cents?: number;
  nte_cents?: number;
  /** A raise after some invoiced or submitted hours on this source; the app only reminds. */
  rate_step?: RateStep;
  /** Last day this role can date hours on this source. */
  ends?: string;
  budget_lines: RoleBudgetLine[];
}

export interface RoleBudgetLine {
  id: string;
  tasks: RoleTask[];
}

export interface RoleTask {
  id: string;
  /** Counts this task shows, by id from the shared list. */
  count_ids: string[];
  /** Paid by this count instead of by the hour; the task's hours are tracked, not billed (0039). */
  flat_rate?: FlatRate;
  /** A service fee per entry, up to max_cents; the task's hours are tracked, not billed (0043). */
  entry_fee?: EntryFee;
  /** Each entry is one trip, paid by its miles; the task's hours are tracked, not billed (0045). */
  trip_fee?: TripFee;
}

/** A task paid per trip by the entry's miles (decision 0045). */
export interface TripFee {
  /** The task's count that holds the trip's miles. */
  miles_count_id: string;
  /** From 1 mile up with no gaps; only the last tier has no to_miles. */
  tiers: TripTier[];
}

export interface TripTier {
  from_miles: number;
  /** Absent on the last, open tier. */
  to_miles?: number;
  fee_cents: number;
  /** Gas reimbursement per trip, billed on its own row. */
  gas_cents?: number;
}

/** A task paid a service fee per entry (decision 0043). */
export interface EntryFee {
  max_cents: number;
}

/** A task paid per count (decision 0039). */
export interface FlatRate {
  count_id: string;
  cents_per_unit: number;
}

/** Count values by count id (decision 0029). Whole numbers; quarter-step counts in quarter-units (0039). */
export type CountValues = Record<string, number>;

/** The CHW's details (SPEC §4). */
export interface Profile {
  name: string;
  initials: string;
  mailing_address: string;
  /** Empty slot so a logo can be added later without redesign (SPEC §2). */
  logo: null;
  /** The role picked at setup (decision 0027); null until one is picked. */
  role_id: string | null;
}

/** Per funding source the CHW works under (SPEC §4). */
export interface SourceSettings {
  source_id: string;
  rate_cents: number;
  /** Not-to-exceed amount; null until entered. Ignored for sources without an NTE. */
  nte_cents: number | null;
}

export interface OtherCount {
  label: string;
  value: number;
}

/** Counts on an entry, or summed over many entries (SPEC §5, decision 0029). */
export interface Counts {
  /** By count id from the shared list in src/roles/roles.json. */
  values: CountValues;
  /** "Add another count": label + number. */
  other: OtherCount[];
}

/** One block of logged time (SPEC §5). */
export interface Entry {
  id: string;
  source_id: string;
  /** The person's role when the entry was saved (decision 0027); null before a role is picked. */
  role_id: string | null;
  /** Raw start, ISO 8601 with offset, whole seconds. */
  start: string;
  /** Raw stop, ISO 8601 with offset, whole seconds. */
  stop: string;
  /** Pauses between start and stop; billed time leaves them out (decision 0037). */
  breaks: Break[];
  /** YYYY-MM-DD: the start's local date. */
  entry_date: string;
  /** The tasks done, with the billed hours split between them (decision 0024). */
  tasks: TaskShare[];
  budget_line_id: string;
  counts: Counts;
  /** Service fees in cents by task id, set when saved, for tasks with a fee (decision 0043). */
  fees: Record<string, number>;
  notes: string;
  /** Set when invoiced; the entry is then locked (CLAUDE.md rule 5). */
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
}

/** One task's part of an entry. The shares add up to the entry's billed quarter-hours. */
export interface TaskShare {
  task_id: string;
  quarters: number;
}

/** A task share as frozen into an invoice, with the names it was billed under. */
export interface InvoiceTaskShare {
  task_id: string;
  task_name: string;
  core_competency: string | null;
  quarters: number;
  /** false: a flat-rate task, its hours tracked, not billed. Absent means billed (decision 0039). */
  billed?: false;
}

/** An entry as frozen into an invoice, with the names it was billed under. */
export interface InvoiceEntry {
  id: string;
  start: string;
  stop: string;
  breaks: Break[];
  entry_date: string;
  quarters: number;
  /** In the order the CHW checked them; quarters add up to `quarters`. */
  tasks: InvoiceTaskShare[];
  budget_line_id: string;
  budget_line_name: string;
  counts: Counts;
  /** The entry's service fees in cents by task id. Absent before decision 0043. */
  fees?: Record<string, number>;
  /** The trip this entry is, with its fee and gas by its miles. Absent when none (0045). */
  trip?: InvoiceEntryTrip;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** One entry's trip as billed (decision 0045). */
export interface InvoiceEntryTrip {
  task_id: string;
  fee_cents: number;
  /** 0 when the tier has no gas. */
  gas_cents: number;
}

export interface InvoiceLine {
  budget_line_id: string;
  budget_line_name: string;
  quarters: number;
  rate_cents: number;
  amount_cents: number;
}

/** A service-fee task's row on an invoice: the fees of its entries added up (decision 0043). */
export interface InvoiceFeeLine {
  budget_line_id: string;
  budget_line_name: string;
  task_id: string;
  task_name: string;
  /** Entries with a fee above $0.00. */
  entries: number;
  max_cents: number;
  amount_cents: number;
}

/** A flat-rate task's fee on an invoice: its count × the cents per unit (decision 0039). */
export interface InvoiceFlatLine {
  budget_line_id: string;
  budget_line_name: string;
  task_id: string;
  task_name: string;
  count_id: string;
  count_label: string;
  /** The count summed over the invoice, in quarter-units (a whole count of 3 is 12). */
  units_quarters: number;
  cents_per_unit: number;
  amount_cents: number;
}

/** A trip-fee task's trips in one tier on an invoice: trips × the tier's fee (decision 0045). */
export interface InvoiceTripLine {
  budget_line_id: string;
  budget_line_name: string;
  task_id: string;
  task_name: string;
  from_miles: number;
  /** Null for the last, open tier. */
  to_miles: number | null;
  trips: number;
  fee_cents: number;
  amount_cents: number;
}

/** The gas reimbursement of a line's trips, added up, with no tier (decision 0045). */
export interface InvoiceGasLine {
  budget_line_id: string;
  budget_line_name: string;
  amount_cents: number;
}

/** Contract tracking box (SPEC §6). Warning only, never a block. */
export type NteStatus =
  | { state: 'none' }
  | { state: 'not_entered' }
  | {
      state: 'tracked';
      nte_cents: number;
      billed_before_cents: number;
      this_invoice_cents: number;
      remaining_cents: number;
      over: boolean;
    };

/** The role an invoice or timesheet was made under, as it was then (decision 0027). */
export type InvoiceRole = Pick<Role, 'id' | 'code' | 'name' | 'employment' | 'chw'>;

/** An invoice or timesheet. Never edited after creation (CLAUDE.md rule 5). */
export interface Invoice {
  id: string;
  /** e.g. CC-2026-004 */
  number: string;
  /** The counter value used, e.g. 4. */
  sequence: number;
  /** Employees submit timesheets; everyone else invoices (decision 0031). */
  kind: 'invoice' | 'timesheet';
  /** Null for invoices made before a role was picked. */
  role: InvoiceRole | null;
  source: {
    id: string;
    code: string;
    name: string;
    version: number;
    certification_text: string;
  };
  chw: { name: string; initials: string; mailing_address: string };
  /** YYYY-MM-DD, the day it was generated. */
  invoice_date: string;
  period_start: string;
  period_end: string;
  rate_cents: number;
  /** Sorted by start, then id. */
  entries: InvoiceEntry[];
  /** Hourly rows, in the source's budget line order (decision 0002). */
  lines: InvoiceLine[];
  /** Flat-rate rows, in budget line order. Absent on invoices made before decision 0039. */
  flat_lines?: InvoiceFlatLine[];
  /** Service-fee rows, in budget line order. Absent on invoices made before decision 0043. */
  fee_lines?: InvoiceFeeLine[];
  /** Trip rows by tier, in budget line order. Absent on invoices made before decision 0045. */
  trip_lines?: InvoiceTripLine[];
  /** Gas reimbursement rows, one per line. Absent on invoices made before decision 0045. */
  gas_lines?: InvoiceGasLine[];
  /** Billed quarter-hours: the sum of the hourly rows. */
  total_quarters: number;
  /** Hours of flat-rate tasks, tracked, not billed. Absent before decision 0039. */
  unbilled_quarters?: number;
  /** Hourly rows plus flat, fee, trip and gas rows. */
  total_cents: number;
  counts_period: Counts;
  /** This source on this phone, including this invoice. */
  counts_all_time: Counts;
  /** Labels and units of the counts with a value in either, in list order (decision 0029). */
  count_defs: CountDef[];
  nte: NteStatus;
  canonical_version: number;
  /** SHA-256 of the canonical form, 64 lower-case hex characters. */
  fingerprint: string;
  created_at: string;
  updated_at: string;
}

/** One counter shared by all funding sources (SPEC §6, decision 0005). */
export interface InvoiceCounter {
  /** The number the next invoice gets. */
  next: number;
  /** True once an invoice has been created; the starting number can't change after. */
  locked: boolean;
}
