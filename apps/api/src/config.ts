import { DateTime } from 'luxon';

export interface AppConfig {
  databaseUrl: string;
  hostAccessKey: string;
  timezone: string;
  webOrigin: string;
  port: number;
  geminiApiKey?: string;
}

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
  };
}
