import { AppConfig } from '../config';
import { LlmClient } from '../llm/llm-client';
import { ConfirmationMessageService, LLM_TIMEOUT_MS, clean, shorten } from './confirmation-message.service';

const CONFIG = { timezone: 'Europe/Berlin' } as AppConfig;
const STARTS_AT = new Date('2026-11-03T10:00:00Z'); // Tuesday 3 November, 11:00 in Berlin
const TEMPLATE = "Thanks, Ada. You're booked for Tuesday 3 November at 11:00. See you then.";

const fakeLlm = (impl: LlmClient['generate']) => ({ generate: jest.fn(impl) });

describe('ConfirmationMessageService', () => {
  afterEach(() => jest.useRealTimers());

  it('uses the template when no LLM is configured', async () => {
    const service = new ConfirmationMessageService(CONFIG, null);
    await expect(service.compose('Ada Lovelace', STARTS_AT)).resolves.toBe(TEMPLATE);
  });

  it('uses the LLM answer, cleaned up, when it arrives in time', async () => {
    const llm = fakeLlm(async () => '  "**Lovely, Ada!** You\'re all set for Tuesday 3 November at 11:00."\n');
    const service = new ConfirmationMessageService(CONFIG, llm);
    await expect(service.compose('Ada Lovelace', STARTS_AT)).resolves.toBe(
      "Lovely, Ada! You're all set for Tuesday 3 November at 11:00.",
    );
  });

  it('sends only the first name, day and time: never the surname or anything else', async () => {
    const llm = fakeLlm(async () => 'Booked!');
    await new ConfirmationMessageService(CONFIG, llm).compose('Ada King Lovelace', STARTS_AT);
    const { prompt, system } = llm.generate.mock.calls[0][0];
    expect(prompt).toBe('First name: Ada\nDay: Tuesday 3 November\nTime: 11:00');
    expect(prompt + system).not.toMatch(/Lovelace|King|@/);
  });

  it('falls back to the template after 3 seconds and cancels the request', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    const llm = fakeLlm(({ signal: s }) => {
      signal = s;
      return new Promise(() => {}); // never answers
    });
    const result = new ConfirmationMessageService(CONFIG, llm).compose('Ada Lovelace', STARTS_AT);

    await jest.advanceTimersByTimeAsync(LLM_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe(TEMPLATE);
    expect(signal?.aborted).toBe(true);
  });

  it('still uses an answer that arrives just before the 3 seconds are up', async () => {
    jest.useFakeTimers();
    const llm = fakeLlm(() => new Promise((resolve) => setTimeout(() => resolve('Just in time, Ada.'), LLM_TIMEOUT_MS - 10)));
    const result = new ConfirmationMessageService(CONFIG, llm).compose('Ada Lovelace', STARTS_AT);
    await jest.advanceTimersByTimeAsync(LLM_TIMEOUT_MS);
    await expect(result).resolves.toBe('Just in time, Ada.');
  });

  it('falls back to the template when the LLM fails', async () => {
    const llm = fakeLlm(async () => {
      throw new Error('429 Too Many Requests');
    });
    await expect(new ConfirmationMessageService(CONFIG, llm).compose('Ada Lovelace', STARTS_AT)).resolves.toBe(TEMPLATE);
  });

  it('falls back to the template when the answer is empty once cleaned', async () => {
    const llm = fakeLlm(async () => ' ** "" ** ');
    await expect(new ConfirmationMessageService(CONFIG, llm).compose('Ada Lovelace', STARTS_AT)).resolves.toBe(TEMPLATE);
  });

  it('shortens an answer longer than 300 characters', async () => {
    const long = `${'You are booked and we cannot wait to see you. '.repeat(10)}`;
    const llm = fakeLlm(async () => long);
    const message = await new ConfirmationMessageService(CONFIG, llm).compose('Ada Lovelace', STARTS_AT);
    expect(long.length).toBeGreaterThan(300);
    expect(message.length).toBeLessThanOrEqual(300);
    expect(message.endsWith('.')).toBe(true);
  });
});

describe('shorten', () => {
  it('leaves text within the limit alone', () => {
    expect(shorten('Short.', 300)).toBe('Short.');
    expect(shorten('x'.repeat(300), 300)).toHaveLength(300);
  });

  it('keeps whole sentences when that keeps most of the text', () => {
    const text = `${'a'.repeat(200)}. ${'b'.repeat(200)}.`;
    expect(shorten(text, 300)).toBe(`${'a'.repeat(200)}.`);
  });

  it('otherwise cuts at a word and adds an ellipsis, staying within the limit', () => {
    const text = `${'word '.repeat(80)}end`;
    const out = shorten(text, 300);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out.endsWith('word…')).toBe(true);
  });

  it('cuts one unbroken run of characters hard', () => {
    expect(shorten('x'.repeat(400), 300)).toBe(`${'x'.repeat(299)}…`);
  });
});

describe('clean', () => {
  it.each([
    ['**Bold** and _italic_', 'Bold and italic'],
    ['"Quoted."', 'Quoted.'],
    ['Line one\n\nLine two', 'Line one Line two'],
    ['# Heading', 'Heading'],
  ])('turns %p into %p', (input, expected) => {
    expect(clean(input)).toBe(expected);
  });
});
