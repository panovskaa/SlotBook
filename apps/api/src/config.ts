import { DateTime } from 'luxon';

export interface AppConfig {
  databaseUrl: string;
  hostAccessKey: string;
  timezone: string;
  webOrigin: string;
  port: number;
  geminiApiKey?: string;
  /** Free-tier Gemini model for confirmation messages (FR-11). */
  geminiModel?: string;
  /** NFR-4: requests per window, per IP, for each public write endpoint. */
  rateLimit: { limit: number; windowMs: number };
}

// Google closed gemini-2.5-flash-lite to new API keys; this is the free-tier model it recommends instead.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Reads and checks the environment once at startup, so a bad setting fails fast. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const missing = ['DATABASE_URL', 'HOST_ACCESS_KEY', 'APP_TIMEZONE'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);

  const timezone = env.APP_TIMEZONE!;
  if (!DateTime.now().setZone(timezone).isValid) {
    throw new Error(`APP_TIMEZONE "${timezone}" is not a valid IANA time zone`);
  }
  if (env.HOST_ACCESS_KEY!.length < 16) {
    throw new Error('HOST_ACCESS_KEY must be at least 16 characters');
  }

  return {
    databaseUrl: env.DATABASE_URL!,
    hostAccessKey: env.HOST_ACCESS_KEY!,
    timezone,
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
    port: Number(env.PORT ?? 3000),
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    geminiModel: env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    rateLimit: {
      limit: positiveInt(env.RATE_LIMIT_MAX, 10, 'RATE_LIMIT_MAX'),
      windowMs: positiveInt(env.RATE_LIMIT_WINDOW_SECONDS, 60, 'RATE_LIMIT_WINDOW_SECONDS') * 1000,
    },
  };
}

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive whole number`);
  return n;
}
