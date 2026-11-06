import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** RFC 6238 time-based one-time passwords (SHA-1, 6 digits, 30 s), compatible with every authenticator app. Pure functions. */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Invalid base32 character");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);
export const totpAt = (secretB32: string, ms = Date.now(), digits = 6) => hotp(base32Decode(secretB32), stepAt(ms), digits);

/**
 * Checks a code against the current step and one step either side (clock drift).
 * `lastStep` is the newest step already accepted for this user: a code is never accepted twice.
 * Returns the accepted step, or null.
 */
export function verifyTotp(secretB32: string, code: string, nowMs = Date.now(), lastStep = 0, window = 1): number | null {
  const digits = String(code).replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return null;
  const secret = base32Decode(secretB32), now = stepAt(nowMs);
  let found: number | null = null;
  for (let off = -window; off <= window; off++) {          // no early exit: same work whatever the code
    const step = now + off, want = Buffer.from(hotp(secret, step)), got = Buffer.from(digits);
    if (step > lastStep && timingSafeEqual(want, got)) found = step;
  }
  return found;
}

export const generateSecret = () => base32Encode(randomBytes(20));

export function otpauthUri(account: string, secretB32: string, issuer = "Talent CRM"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

/** Ten one-time recovery codes like "k3x9q-2mt7d" (50 random bits each). */
export function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const s = base32Encode(randomBytes(7)).toLowerCase().replace(/[^a-z2-7]/g, "").slice(0, 10);
    return `${s.slice(0, 5)}-${s.slice(5, 10)}`;
  });
}
export const normalizeRecovery = (c: string) => c.toLowerCase().replace(/[^a-z2-7]/g, "");
