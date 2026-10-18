import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Secrets for private links (cancellation FR-7, waitlist FR-9): 32 random bytes as base64url.
 * Only the SHA-256 hash is stored, so a database leak doesn't reveal working links.
 */
export function createSecretToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time check of a presented token against a stored hash. */
export function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
