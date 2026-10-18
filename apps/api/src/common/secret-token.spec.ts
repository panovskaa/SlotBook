import { createHash } from 'crypto';
import { createSecretToken, hashToken, tokenMatches } from './secret-token';

describe('secret tokens', () => {
  it('makes 32-byte base64url tokens and stores only their SHA-256 hash', () => {
    const { token, hash } = createSecretToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hash).not.toContain(token);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => createSecretToken().token));
    expect(tokens.size).toBe(1000);
  });

  it('matches only the right token', () => {
    const { token, hash } = createSecretToken();
    expect(tokenMatches(token, hash)).toBe(true);
    expect(tokenMatches(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'), hash)).toBe(false);
    expect(tokenMatches('', hash)).toBe(false);
  });

  it('treats a malformed stored hash as no match instead of throwing', () => {
    expect(tokenMatches('anything', 'not-hex')).toBe(false);
    expect(hashToken('a')).toHaveLength(64);
  });
});
