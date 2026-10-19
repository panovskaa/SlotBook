/**
 * NFR-6: loading a week of slots takes under 200 ms for 95% of requests, with 1,000 slots per week.
 *
 * 1. Creates a throwaway database (slotbook_perf) in the Compose Postgres and applies the migrations.
 * 2. Seeds the target week (next week) with 1,000 slots and its bookings, plus 12 more weeks of slots
 *    around it and some waitlist entries, so the planner has a realistic table to choose plans for.
 * 3. Starts the built API (dist/main.js) against it and loads GET /slots for that week with autocannon.
 * 4. Prints EXPLAIN ANALYZE for the queries behind GET /slots, then drops the database.
 *
 * Run with `npm run perf -w @slotbook/api` (needs `docker compose up -d`). Not part of CI: the
 * numbers depend on the machine. Exits with 1 if the p95 is 200 ms or more.
 *
 * Settings: PERF_DATABASE_URL, PERF_DURATION (seconds, default 20), PERF_CONNECTIONS (default 10),
 * PERF_KEEP_DB=1 to keep the database afterwards.
 */
import { ChildProcess, execSync, spawn } from 'child_process';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import autocannon from 'autocannon';
import { DateTime } from 'luxon';

const DATABASE_URL = process.env.PERF_DATABASE_URL ?? 'postgresql://slotbook:slotbook@localhost:5432/slotbook_perf';
const DURATION_S = Number(process.env.PERF_DURATION ?? 20);
const CONNECTIONS = Number(process.env.PERF_CONNECTIONS ?? 10);
const KEEP_DB = process.env.PERF_KEEP_DB === '1';
const TIMEZONE = 'Europe/Berlin';
const PORT = 3200;
const TARGET_P95_MS = 200;

const SLOTS_PER_WEEK = 1000;
const SLOT_MINUTES = 10; // 1,000 back-to-back 10-minute slots fit in one week (about 167 hours).
const OTHER_WEEKS = [-4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8]; // relative to the target week

const apiDir = resolve(__dirname, '..');

async function main(): Promise<void> {
  const weekStart = DateTime.now().setZone(TIMEZONE).plus({ weeks: 1 }).startOf('week');
  const from = weekStart.toISODate()!;
  const to = weekStart.plus({ days: 6 }).toISODate()!;

  console.log(`Database: ${new URL(DATABASE_URL).pathname.slice(1)}`);
  await recreateDatabase();
  execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL },
    stdio: 'ignore',
  });

  const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });
  let server: ChildProcess | undefined;
  try {
    await seed(prisma, weekStart);
    const counts = await prisma.$queryRaw<{ slots: bigint; bookings: bigint }[]>`
      SELECT (SELECT count(*) FROM slot) AS slots, (SELECT count(*) FROM booking) AS bookings`;
    console.log(`Seeded ${counts[0].slots} slots and ${counts[0].bookings} bookings; target week ${from} to ${to}`);

    server = startApi();
    const url = `http://localhost:${PORT}/slots?from=${from}&to=${to}`;
    await waitForHealth();

    const first = (await (await fetch(url)).json()) as { slots: unknown[] };
    console.log(`GET /slots returns ${first.slots.length} slots for the week (deleted ones are hidden)`);

    // A short warm-up, so JIT compilation and the connection pool don't count against the result.
    await load(url, 3);
    const result = await load(url, DURATION_S);
    report(result);

    await explain(prisma, weekStart, from, to);

    if (result.p95 >= TARGET_P95_MS) process.exitCode = 1;
  } finally {
    server?.kill();
    await prisma.$disconnect();
    if (!KEEP_DB) await dropDatabase();
  }
}

/** Runs the database admin statements against the server's `postgres` database. */
async function admin(sql: string): Promise<void> {
  const url = new URL(DATABASE_URL);
  url.pathname = '/postgres';
  const client = new PrismaClient({ datasourceUrl: url.toString() });
  try {
    await client.$executeRawUnsafe(sql);
  } finally {
    await client.$disconnect();
  }
}

const dbName = () => new URL(DATABASE_URL).pathname.slice(1).replace(/"/g, '');

async function recreateDatabase(): Promise<void> {
  await dropDatabase();
  await admin(`CREATE DATABASE "${dbName()}"`);
}

async function dropDatabase(): Promise<void> {
  await admin(`DROP DATABASE IF EXISTS "${dbName()}" WITH (FORCE)`);
}

/**
 * Every third slot is booked (with a confirmed booking) and every 50th is deleted, in every week.
 * Each day of the target week also has some waitlist entries, a few of them already notified.
 */
async function seed(prisma: PrismaClient, weekStart: DateTime): Promise<void> {
  for (const offset of [0, ...OTHER_WEEKS]) {
    const start = weekStart.plus({ weeks: offset }).toJSDate();
    await prisma.$executeRaw`
      INSERT INTO slot (id, starts_at, ends_at, status)
      SELECT gen_random_uuid(),
             ${start}::timestamptz + make_interval(mins => (i * ${SLOT_MINUTES})::int),
             ${start}::timestamptz + make_interval(mins => ((i + 1) * ${SLOT_MINUTES})::int),
             (CASE WHEN i % 3 = 0 THEN 'BOOKED' WHEN i % 50 = 7 THEN 'DELETED' ELSE 'AVAILABLE' END)::"SlotStatus"
      FROM generate_series(0, ${SLOTS_PER_WEEK - 1}) AS i`;
  }
  await prisma.$executeRaw`
    INSERT INTO booking (id, slot_id, name, email, reference, cancel_token_hash, status)
    SELECT gen_random_uuid(), id, 'Perf Visitor', 'visitor' || n || '@example.com',
           'PERF-' || lpad(n::text, 6, '0'), md5('token' || n), 'CONFIRMED'
    FROM (SELECT id, row_number() OVER (ORDER BY starts_at) AS n FROM slot WHERE status = 'BOOKED') AS booked`;
  await prisma.$executeRaw`
    INSERT INTO waitlist_entry (id, date, name, email, token_hash, status)
    SELECT gen_random_uuid(), ${weekStart.toISODate()}::date + d, 'Waiting Visitor',
           'waiting' || d || '-' || n || '@example.com', md5('wait' || d || '-' || n),
           (CASE WHEN n <= 2 THEN 'NOTIFIED' ELSE 'WAITING' END)::"WaitlistStatus"
    FROM generate_series(0, 6) AS d, generate_series(1, 20) AS n`;
  await prisma.$executeRawUnsafe('ANALYZE');
}

/** The production build, as `npm start` runs it, with logging on. */
function startApi(): ChildProcess {
  return spawn(process.execPath, ['dist/main.js'], {
    cwd: apiDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL,
      PORT: String(PORT),
      APP_TIMEZONE: TIMEZONE,
      HOST_ACCESS_KEY: 'perf-host-key-0123456789',
      GEMINI_API_KEY: '',
    },
    stdio: 'ignore',
  });
}

async function waitForHealth(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/health`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('The API did not start; did `nest build` run?');
}

interface LoadResult {
  requests: number;
  errors: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

/** autocannon's summary has p90 and p97.5 but no p95, so every response time is collected here. */
function load(url: string, seconds: number): Promise<LoadResult> {
  const times: number[] = [];
  return new Promise((resolvePromise, reject) => {
    const instance = autocannon({ url, connections: CONNECTIONS, duration: seconds }, (err, result) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      times.sort((a, b) => a - b);
      const at = (p: number) => times[Math.min(times.length - 1, Math.ceil((p / 100) * times.length) - 1)] ?? NaN;
      resolvePromise({
        requests: times.length,
        errors: result.errors + result.non2xx,
        rps: times.length / seconds,
        p50: at(50),
        p95: at(95),
        p99: at(99),
        max: times[times.length - 1] ?? NaN,
      });
    });
    instance.on('response', (_client, _status, _bytes, responseTime) => times.push(responseTime));
  });
}

function report(r: LoadResult): void {
  const ms = (n: number) => `${n.toFixed(1)} ms`;
  console.log(`\nGET /slots, one week of ${SLOTS_PER_WEEK} slots, ${CONNECTIONS} connection(s) for ${DURATION_S} s`);
  console.log(`  requests ${r.requests} (${r.rps.toFixed(0)}/s), errors or non-2xx ${r.errors}`);
  console.log(`  p50 ${ms(r.p50)}  p95 ${ms(r.p95)}  p99 ${ms(r.p99)}  max ${ms(r.max)}`);
  console.log(`  NFR-6 target p95 < ${TARGET_P95_MS} ms: ${r.p95 < TARGET_P95_MS ? 'PASS' : 'FAIL'}`);
}

/** The two queries SlotsService.list runs, written out as the SQL Prisma sends. */
async function explain(prisma: PrismaClient, weekStart: DateTime, from: string, to: string): Promise<void> {
  const rangeStart = weekStart.toJSDate();
  const rangeEnd = weekStart.plus({ weeks: 1 }).toJSDate();
  const plans: [string, Promise<{ 'QUERY PLAN': string }[]>][] = [
    [
      'Slots in the week',
      prisma.$queryRaw`
        EXPLAIN (ANALYZE, BUFFERS)
        SELECT id, starts_at, ends_at, status, created_at FROM slot
        WHERE status <> 'DELETED' AND starts_at >= ${rangeStart} AND starts_at > now() AND starts_at < ${rangeEnd}
        ORDER BY starts_at ASC`,
    ],
    [
      'Notified waitlist dates in the week',
      prisma.$queryRaw`
        EXPLAIN (ANALYZE, BUFFERS)
        SELECT date FROM waitlist_entry
        WHERE status = 'NOTIFIED' AND date >= ${from}::date AND date <= ${to}::date`,
    ],
  ];
  for (const [title, rows] of plans) {
    console.log(`\nEXPLAIN ANALYZE: ${title}`);
    for (const row of await rows) console.log(`  ${row['QUERY PLAN']}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
