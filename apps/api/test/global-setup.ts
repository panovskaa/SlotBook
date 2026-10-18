import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'child_process';
import { resolve } from 'path';

/** Starts a throwaway Postgres 16 for the integration tests and applies the real migrations to it. */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();

  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  process.env.DATABASE_URL = url;
  (globalThis as { __PG__?: unknown }).__PG__ = container;
}
