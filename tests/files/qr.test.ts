import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { qrMatrix } from '../../src/files/qr/matrix';
import {
  QR_PAYLOAD_VERSION,
  qrPayload,
  qrPayloadV1,
  qrPayloadV2,
} from '../../src/files/qr/payload';
import { findFundingSource } from '../../src/funding-sources';
import roles from '../../src/roles/roles.json';
import { makeEntry, regen } from '../core/fixtures/wireframe-sample';
import { invoiceFrom, sampleInvoice } from './helpers';

/** Render modules to RGBA pixels with a 4-module quiet zone, as a scanner would see them. */
function decode(matrix: boolean[][], scale = 4): string | null {
  const quiet = 4;
  const size = (matrix.length + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  matrix.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (!dark) return;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const i = (((r + quiet) * scale + y) * size + (c + quiet) * scale + x) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
      }
    });
  });
  return jsQR(pixels, size, size)?.data ?? null;
}

describe('QR payload v1 (decision 0011)', () => {
  it('is pinned for the wireframe sample', async () => {
    const invoice = await sampleInvoice();
    expect(QR_PAYLOAD_VERSION).toBe(1);
    expect(qrPayloadV1(invoice)).toBe(
      '{"v":1,"n":"CC-2026-004","p":["2026-10-20","2026-10-30"],' +
        '"l":[["new-chws",12,6000],["chw-referrals",13,6500],["outreach-and-marketing",12,6000]],' +
        `"f":"${invoice.fingerprint}"}`,
    );
  });

  it('is valid JSON with integers only', async () => {
    const parsed = JSON.parse(qrPayloadV1(await sampleInvoice())) as { l: number[][] };
    expect(
      parsed.l
        .flat()
        .filter((x) => typeof x === 'number')
        .every(Number.isInteger),
    ).toBe(true);
  });
});

describe('qrMatrix', () => {
  it('decodes back to the payload', async () => {
    const payload = qrPayloadV1(await sampleInvoice());
    expect(decode(qrMatrix(payload))).toBe(payload);
  });

  // An invoice bills one role's lines. The most any role bills is REGEN-GO's 13 CHW lines, kept
  // for the certified CHW roles (roles plan Part 2), so that is the bound for a version 20 code.
  it('fits and decodes an invoice with the 13 REGEN-GO CHW budget lines', async () => {
    const entries = regen.budget_lines.slice(0, 13).map((line, i) =>
      makeEntry(
        `2026-10-${String(i + 1).padStart(2, '0')}`,
        '09:00:00',
        '17:00:00',
        'outreach',
        line.id,
        {
          source_id: regen.id,
        },
      ),
    );
    const invoice = await invoiceFrom({
      source: regen,
      settings: { source_id: regen.id, rate_cents: 2237, nte_cents: null },
      entries,
      prior_invoices: [],
    });
    expect(invoice.lines).toHaveLength(13);
    const payload = qrPayloadV1(invoice);
    const matrix = qrMatrix(payload);
    expect(matrix.length).toBeLessThanOrEqual(97); // version 20
    expect(decode(matrix)).toBe(payload);
  });

  // An invoice bills one role's lines, so every role's full set must fit (roles plan R1).
  it.each(roles.roles.flatMap((r) => r.funding.map((f) => [r.code, f] as const)))(
    'fits and decodes an invoice with every budget line %s bills',
    async (_code, funding) => {
      const source = findFundingSource(funding.source_id);
      if (!source) throw new Error(funding.source_id);
      const entries = funding.budget_lines.map((line, i) =>
        makeEntry(
          `2026-10-${String(i + 1).padStart(2, '0')}`,
          '09:00:00',
          '17:00:00',
          line.tasks[0]?.id ?? '',
          line.id,
          { source_id: source.id },
        ),
      );
      const invoice = await invoiceFrom({
        source,
        settings: { source_id: source.id, rate_cents: 2237, nte_cents: null },
        entries,
        prior_invoices: [],
      });
      expect(invoice.lines).toHaveLength(funding.budget_lines.length);
      const payload = qrPayloadV1(invoice);
      const matrix = qrMatrix(payload);
      expect(matrix.length).toBeLessThanOrEqual(97); // version 20
      expect(decode(matrix)).toBe(payload);
    },
  );

  it('refuses text outside printable ASCII', () => {
    expect(() => qrMatrix('café')).toThrow();
  });

  it('v2 adds the flat-rate rows; only invoices with flat rows use it (decision 0039)', () => {
    const base = {
      number: 'RG-2026-001',
      period_start: '2026-11-02',
      period_end: '2026-11-04',
      lines: [
        {
          budget_line_id: 'leos',
          budget_line_name: "Leo's",
          quarters: 6,
          rate_cents: 2000,
          amount_cents: 3000,
        },
      ],
      fingerprint: 'a'.repeat(64),
    };
    const flat = {
      budget_line_id: 'eat-local-network',
      budget_line_name: 'Eat Local Network',
      task_id: 'lehr-reset',
      task_name: 'LEHR reset',
      count_id: 'lehrs_reset',
      count_label: 'LEHRs reset',
      units_quarters: 10,
      cents_per_unit: 14000,
      amount_cents: 35000,
    };
    expect(qrPayloadV2({ ...base, flat_lines: [flat] })).toBe(
      `{"v":2,"n":"RG-2026-001","p":["2026-11-02","2026-11-04"],"l":[["leos",6,3000]],"x":[["eat-local-network","lehr-reset",10,35000]],"f":"${'a'.repeat(64)}"}`,
    );
    expect(qrPayload({ ...base, flat_lines: [flat] })).toBe(
      qrPayloadV2({ ...base, flat_lines: [flat] }),
    );
    expect(qrPayload({ ...base, flat_lines: [] })).toBe(qrPayloadV1(base));
    expect(qrPayload(base)).toBe(qrPayloadV1(base));
    const matrix = qrMatrix(qrPayload({ ...base, flat_lines: [flat] }));
    expect(decode(matrix)).toBe(qrPayloadV2({ ...base, flat_lines: [flat] }));
  });
});
