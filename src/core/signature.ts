// The typed signature (decision 0046): "/s/ <name>", adopted once, applied per invoice.
import type { AdoptedSignature, InvoiceSignature, Profile } from './types';

/** The stamp for a name: "/s/ Jane Doe". Inner runs of spaces collapse to one. */
export function signatureText(name: string): string {
  return `/s/ ${name.trim().replace(/\s+/g, ' ')}`;
}

/** Adopt the stamp for the profile's current name. */
export function adoptSignature(name: string, now: string): AdoptedSignature {
  return { text: signatureText(name), adopted_at: now };
}

/** The adopted signature, only while it still matches the profile's name; otherwise null. */
export function usableSignature(
  profile: Pick<Profile, 'name' | 'signature'> | null,
): AdoptedSignature | null {
  const sig = profile?.signature;
  if (!profile || !sig || profile.name.trim() === '') return null;
  return sig.text === signatureText(profile.name) ? sig : null;
}

/** A profile with a new name loses a signature that no longer matches it (decision 0046). */
export function withName<P extends Pick<Profile, 'name' | 'signature'>>(
  profile: P,
  name: string,
): P {
  const keep = profile.signature?.text === signatureText(name);
  return { ...profile, name, signature: keep ? profile.signature : null };
}

/** Apply an adopted signature to an invoice made now. */
export function applySignature(sig: AdoptedSignature, now: string): InvoiceSignature {
  return { text: sig.text, adopted_at: sig.adopted_at, signed_at: now };
}

/**
 * A signature is dated the day Apply was tapped, and must match the invoice date: after midnight
 * the person applies it again (decision 0046). Both are the phone's local calendar day.
 */
export function signedOnInvoiceDate(signedAt: string, invoiceDate: string): boolean {
  return signedAt.slice(0, 10) === invoiceDate;
}
