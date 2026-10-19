import { REFERENCE_ALPHABET, normalizeReference } from '@slotbook/shared';
import { ReferenceGenerator } from './reference.generator';

describe('ReferenceGenerator', () => {
  const generator = new ReferenceGenerator();

  it('makes XXXX-XXXX codes from the Crockford alphabet only', () => {
    for (let i = 0; i < 2000; i++) {
      const ref = generator.next();
      expect(ref).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(ref).not.toMatch(/[ILOU]/);
    }
  });

  it('uses the whole alphabet', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) for (const ch of generator.next().replace('-', '')) seen.add(ch);
    expect([...seen].sort().join('')).toBe(REFERENCE_ALPHABET.split('').sort().join(''));
  });

  it('almost never repeats', () => {
    const refs = new Set(Array.from({ length: 10_000 }, () => generator.next()));
    expect(refs.size).toBeGreaterThan(9_990);
  });
});

describe('normalizeReference', () => {
  it.each([
    ['K7M2-QX9P', 'K7M2-QX9P'],
    ['k7m2qx9p', 'K7M2-QX9P'],
    ['  k7m2 qx9p ', 'K7M2-QX9P'],
    ['K7M2-QX9O', 'K7M2-QX90'],
    ['K7M2-QXIL', 'K7M2-QX11'],
  ])('reads %p as %p', (input, expected) => {
    expect(normalizeReference(input)).toBe(expected);
  });

  it.each(['K7M2-QX9', 'K7M2-QX9PP', 'K7M2-QX9U', 'K7M2_QX9P', '', '../etc/passwd'])('rejects %p', (input) => {
    expect(normalizeReference(input)).toBeNull();
  });
});
