/**
 * Creates the E2E database if needed and applies the migrations. Runs as part of the E2E API's
 * start command, because Playwright starts its web servers before any global setup.
 */
const { execSync } = require('node:child_process');
const { resolve } = require('node:path');
const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const name = new URL(url).pathname.slice(1);
  const admin = new Client({ connectionString: url.replace(/\/[^/?]+(\?|$)/, '/postgres$1') });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${name.replace(/"/g, '')}"`);
  } finally {
    await admin.end();
  }
  execSync('npx prisma migrate deploy --schema apps/api/prisma/schema.prisma', {
    cwd: resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
