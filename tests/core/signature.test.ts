// Typed signature (decision 0046).
import { describe, expect, it } from 'vitest';
import { createInvoice } from '../../src/core/invoice';
import {
  adoptSignature,
  applySignature,
  signatureText,
  signedOnInvoiceDate,
  usableSignature,
  withName,
} from '../../src/core/signature';
import { verifyFingerprint } from '../../src/core/fingerprint';
import { sampleInput } from './fixtures/wireframe-sample';

const NOW = '2026-11-19T09:30:00-07:00';
const LATER = '2026-11-20T16:05:00-07:00';

describe('signatureText', () => {
  it('stamps /s/ before the name', () => {
    expect(signatureText('Jane Doe')).toBe('/s/ Jane Doe');
  });

  it('trims and collapses spaces', () => {
    expect(signatureText('  Jane   Q.  Doe ')).toBe('/s/ Jane Q. Doe');
  });
});

describe('usableSignature', () => {
  const sig = adoptSignature('Jane Doe', NOW);

  it('returns the adopted signature while the name matches', () => {
    expect(usableSignature({ name: 'Jane Doe', signature: sig })).toEqual({
      text: '/s/ Jane Doe',
      adopted_at: NOW,
    });
    expect(usableSignature({ name: ' Jane  Doe ', signature: sig })).toBe(sig);
  });

  it('is null with no profile, no signature, a blank name or a different name', () => {
    expect(usableSignature(null)).toBeNull();
    expect(usableSignature({ name: 'Jane Doe', signature: null })).toBeNull();
    expect(usableSignature({ name: '  ', signature: adoptSignature('', NOW) })).toBeNull();
    expect(usableSignature({ name: 'Jane Smith', signature: sig })).toBeNull();
  });
});

describe('withName', () => {
  const profile = { name: 'Jane Doe', signature: adoptSignature('Jane Doe', NOW) };

  it('keeps the signature when the stamp stays the same', () => {
    expect(withName(profile, 'Jane  Doe ').signature).toBe(profile.signature);
  });

  it('removes the signature when the name changes', () => {
    expect(withName(profile, 'Jane Smith')).toEqual({ name: 'Jane Smith', signature: null });
  });
});

describe('a signed invoice', () => {
  const signature = applySignature(adoptSignature('Chris Example', NOW), LATER);

  it('freezes the stamp, when it was adopted and when it was applied', async () => {
    const result = await createInvoice({ ...sampleInput(), signature });
    if (!result.ok) throw new Error(result.reason);
    expect(result.invoice.signature).toEqual({
      text: '/s/ Chris Example',
      adopted_at: NOW,
      signed_at: LATER,
    });
  });

  it('has no signature field when none is applied', async () => {
    const result = await createInvoice(sampleInput());
    if (!result.ok) throw new Error(result.reason);
    expect('signature' in result.invoice).toBe(false);
  });

  it('has the same fingerprint as the unsigned invoice, and it verifies', async () => {
    const signed = await createInvoice({ ...sampleInput(), signature });
    const unsigned = await createInvoice(sampleInput());
    if (!signed.ok || !unsigned.ok) throw new Error('invoice failed');
    expect(signed.invoice.fingerprint).toBe(unsigned.invoice.fingerprint);
    expect(await verifyFingerprint(signed.invoice)).toBe(true);
  });
});

describe('signedOnInvoiceDate', () => {
  it('is true for a signature applied on the invoice date', () => {
    expect(signedOnInvoiceDate('2026-11-19T00:00:00-07:00', '2026-11-19')).toBe(true);
    expect(signedOnInvoiceDate('2026-11-19T23:59:59-07:00', '2026-11-19')).toBe(true);
  });

  it('is false once midnight has passed since Apply was tapped', () => {
    expect(signedOnInvoiceDate('2026-11-19T23:58:00-07:00', '2026-11-20')).toBe(false);
    expect(signedOnInvoiceDate('2026-12-31T23:59:00-07:00', '2027-01-01')).toBe(false);
  });
});
