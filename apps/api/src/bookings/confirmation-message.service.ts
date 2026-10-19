import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DateTime } from 'luxon';
import { APP_CONFIG, AppConfig } from '../config';
import { LLM_CLIENT, LlmClient } from '../llm/llm-client';

export const MESSAGE_MAX_LENGTH = 300;
/** FR-11: the LLM gets this long before the template is used instead. */
export const LLM_TIMEOUT_MS = 3_000;

const SYSTEM_PROMPT = [
  'You write the short confirmation shown to someone who has just booked an appointment.',
  'Write one or two warm, natural sentences in English, under 250 characters.',
  'Mention the first name, the day and the time exactly as given. Invent nothing else.',
  'Plain text only: no markdown, no emojis, no quotes, no greeting line, no sign-off.',
].join(' ');

/**
 * FR-11: a friendly confirmation from Gemini, falling back to a template when there is no API key,
 * the call fails, or it takes longer than 3 seconds. Only the first name, date and time are sent;
 * never the email.
 */
@Injectable()
export class ConfirmationMessageService {
  private readonly logger = new Logger(ConfirmationMessageService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(LLM_CLIENT) private readonly llm: LlmClient | null = null,
  ) {}

  async compose(fullName: string, startsAt: Date): Promise<string> {
    if (!this.llm) return this.template(fullName, startsAt);

    const { firstName, day, time } = this.parts(fullName, startsAt);
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`No answer within ${LLM_TIMEOUT_MS} ms`));
      }, LLM_TIMEOUT_MS);
    });

    try {
      const raw = await Promise.race([
        this.llm.generate({
          system: SYSTEM_PROMPT,
          prompt: `First name: ${firstName}\nDay: ${day}\nTime: ${time}`,
          signal: controller.signal,
        }),
        timeout,
      ]);
      const message = shorten(clean(raw), MESSAGE_MAX_LENGTH);
      return message || this.template(fullName, startsAt);
    } catch (err) {
      // No personal data in the log line: the reason is enough to diagnose it.
      this.logger.warn(`Using the template message: ${(err as Error).message}`);
      return this.template(fullName, startsAt);
    } finally {
      clearTimeout(timer);
    }
  }

  template(fullName: string, startsAt: Date): string {
    const { firstName, day, time } = this.parts(fullName, startsAt);
    return shorten(`Thanks, ${firstName}. You're booked for ${day} at ${time}. See you then.`, MESSAGE_MAX_LENGTH);
  }

  private parts(fullName: string, startsAt: Date) {
    const local = DateTime.fromJSDate(startsAt, { zone: this.config.timezone }).setLocale('en-GB');
    return {
      firstName: fullName.trim().split(/\s+/)[0],
      day: local.toFormat('cccc d LLLL'),
      time: local.toFormat('HH:mm'),
    };
  }
}

/** Plain text on one line: drops markdown marks and wrapping quotes, collapses whitespace. */
export function clean(text: string): string {
  return text
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .trim();
}

/**
 * Keeps a message within `max` characters: whole sentences when that keeps most of it,
 * otherwise whole words with an ellipsis.
 */
export function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const sentenceEnd = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (sentenceEnd >= max / 2) return head.slice(0, sentenceEnd + 1);
  const wordEnd = head.lastIndexOf(' ', max - 1);
  return `${(wordEnd > 0 ? head.slice(0, wordEnd) : head.slice(0, max - 1)).trimEnd()}…`;
}
