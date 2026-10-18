/**
 * One table of form inputs that both validation layers are tested against (FR-5, NFR-3):
 * the backend's class-validator DTO and the frontend's zod schema must give the same answer.
 */

export interface BookingInputCase {
  label: string;
  input: { name: unknown; email: unknown };
  /** The field that should fail, or null when the input is valid. */
  invalidField: 'name' | 'email' | null;
}

export const BOOKING_INPUT_CASES: BookingInputCase[] = [
  { label: 'a normal name and email', input: { name: 'Ada Lovelace', email: 'ada@example.com' }, invalidField: null },
  { label: 'surrounding spaces', input: { name: '  Ada  ', email: '  ada@example.com ' }, invalidField: null },
  { label: 'an uppercase email', input: { name: 'Ada', email: 'Ada@Example.COM' }, invalidField: null },
  { label: 'a two-letter name', input: { name: 'Al', email: 'al@example.com' }, invalidField: null },
  { label: 'a 100-character name', input: { name: 'x'.repeat(100), email: 'x@example.com' }, invalidField: null },
  { label: 'a non-Latin name', input: { name: '李小龙', email: 'lee@example.com' }, invalidField: null },
  { label: 'a subdomain and plus address', input: { name: 'Ada', email: 'ada+book@mail.example.co.uk' }, invalidField: null },
  { label: 'a one-letter name', input: { name: 'A', email: 'a@example.com' }, invalidField: 'name' },
  { label: 'a name that is one letter once trimmed', input: { name: '   A   ', email: 'a@example.com' }, invalidField: 'name' },
  { label: 'a name of only spaces', input: { name: '     ', email: 'a@example.com' }, invalidField: 'name' },
  { label: 'a 101-character name', input: { name: 'x'.repeat(101), email: 'x@example.com' }, invalidField: 'name' },
  { label: 'an empty name', input: { name: '', email: 'a@example.com' }, invalidField: 'name' },
  { label: 'an email without @', input: { name: 'Ada', email: 'ada.example.com' }, invalidField: 'email' },
  { label: 'an email without a domain', input: { name: 'Ada', email: 'ada@' }, invalidField: 'email' },
  { label: 'an email without a top-level domain', input: { name: 'Ada', email: 'ada@example' }, invalidField: 'email' },
  { label: 'an email with a space inside', input: { name: 'Ada', email: 'ada lovelace@example.com' }, invalidField: 'email' },
  { label: 'an empty email', input: { name: 'Ada', email: '' }, invalidField: 'email' },
  { label: 'an email over 254 characters', input: { name: 'Ada', email: `${'a'.repeat(64)}@${'b'.repeat(190)}.com` }, invalidField: 'email' },
];
