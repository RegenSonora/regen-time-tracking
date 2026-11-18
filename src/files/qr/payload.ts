// QR code payload (SPEC §7, decision 0011). Never change v1: a new layout gets a new version,
// and the golden test keeps v1 producing the same text.
import type { Invoice } from '../../core/types';

/** The layout every invoice without flat-rate rows still gets. */
export const QR_PAYLOAD_VERSION = 1;

/** Compact JSON: invoice #, period, [budget line id, quarter-hours, cents] per line, fingerprint. */
export function qrPayloadV1(
  invoice: Pick<Invoice, 'number' | 'period_start' | 'period_end' | 'lines' | 'fingerprint'>,
): string {
  // Built by hand so key order and spacing can't drift with JSON.stringify options.
  const str = (s: string) => JSON.stringify(s);
  const lines = invoice.lines
    .map((l) => `[${str(l.budget_line_id)},${String(l.quarters)},${String(l.amount_cents)}]`)
    .join(',');
  return (
    `{"v":1,"n":${str(invoice.number)},` +
    `"p":[${str(invoice.period_start)},${str(invoice.period_end)}],` +
    `"l":[${lines}],"f":${str(invoice.fingerprint)}}`
  );
}

/**
 * v2 (decision 0039): v1 plus "x", [budget line id, task id, count in quarter-units, cents] per
 * flat-rate row. Used only when an invoice has flat-rate rows.
 */
export function qrPayloadV2(
  invoice: Pick<
    Invoice,
    'number' | 'period_start' | 'period_end' | 'lines' | 'flat_lines' | 'fingerprint'
  >,
): string {
  const str = (s: string) => JSON.stringify(s);
  const lines = invoice.lines
    .map((l) => `[${str(l.budget_line_id)},${String(l.quarters)},${String(l.amount_cents)}]`)
    .join(',');
  const flat = (invoice.flat_lines ?? [])
    .map(
      (l) =>
        `[${str(l.budget_line_id)},${str(l.task_id)},${String(l.units_quarters)},${String(l.amount_cents)}]`,
    )
    .join(',');
  return (
    `{"v":2,"n":${str(invoice.number)},` +
    `"p":[${str(invoice.period_start)},${str(invoice.period_end)}],` +
    `"l":[${lines}],"x":[${flat}],"f":${str(invoice.fingerprint)}}`
  );
}

/**
 * v3 (decision 0043): v2 plus "e", [budget line id, task id, entries, cents] per service-fee row.
 * Used only when an invoice has fee rows.
 */
export function qrPayloadV3(invoice: QrInvoice): string {
  const str = (s: string) => JSON.stringify(s);
  const v2 = qrPayloadV2(invoice);
  const fees = (invoice.fee_lines ?? [])
    .map(
      (l) =>
        `[${str(l.budget_line_id)},${str(l.task_id)},${String(l.entries)},${String(l.amount_cents)}]`,
    )
    .join(',');
  return v2.replace('{"v":2,', '{"v":3,').replace(',"f":', `,"e":[${fees}],"f":`);
}

/**
 * v4 (decision 0045): v3 plus "t", [budget line id, task id, tier's first mile, trips, cents] per
 * trip row, and "g", [budget line id, cents] per gas row. Used only when an invoice has trips.
 */
export function qrPayloadV4(invoice: QrInvoice): string {
  const str = (s: string) => JSON.stringify(s);
  const v3 = qrPayloadV3(invoice);
  const trips = (invoice.trip_lines ?? [])
    .map(
      (l) =>
        `[${str(l.budget_line_id)},${str(l.task_id)},${String(l.from_miles)},${String(l.trips)},${String(l.amount_cents)}]`,
    )
    .join(',');
  const gas = (invoice.gas_lines ?? [])
    .map((l) => `[${str(l.budget_line_id)},${String(l.amount_cents)}]`)
    .join(',');
  return v3.replace('{"v":3,', '{"v":4,').replace(',"f":', `,"t":[${trips}],"g":[${gas}],"f":`);
}

/** What the payloads read from an invoice. */
type QrInvoice = Pick<
  Invoice,
  | 'number'
  | 'period_start'
  | 'period_end'
  | 'lines'
  | 'flat_lines'
  | 'fee_lines'
  | 'trip_lines'
  | 'gas_lines'
  | 'fingerprint'
>;

/**
 * The payload an invoice prints: v4 when it has trip or gas rows, v3 when it has service-fee
 * rows, v2 when it has flat-rate rows, v1 otherwise (decisions 0039, 0043, 0045).
 */
export function qrPayload(invoice: QrInvoice): string {
  if ((invoice.trip_lines ?? []).length > 0 || (invoice.gas_lines ?? []).length > 0) {
    return qrPayloadV4(invoice);
  }
  if ((invoice.fee_lines ?? []).length > 0) return qrPayloadV3(invoice);
  return (invoice.flat_lines ?? []).length > 0 ? qrPayloadV2(invoice) : qrPayloadV1(invoice);
}
