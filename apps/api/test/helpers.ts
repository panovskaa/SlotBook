import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { Clock } from '../src/common/clock';
import { AppConfig } from '../src/config';
import { configureApp } from '../src/configure-app';
import { LLM_CLIENT, LlmClient } from '../src/llm/llm-client';
import { MAILER, MailMessage, Mailer } from '../src/mail/mailer';
import { PrismaService } from '../src/prisma/prisma.service';

export const HOST_KEY = 'test-host-key-0123456789';
export const TIMEZONE = 'Europe/Berlin';

/** A clock the test moves by hand. */
export class FakeClock extends Clock {
  constructor(private current: Date) {
    super();
  }
  now(): Date {
    return new Date(this.current);
  }
  set(iso: string): void {
    this.current = new Date(iso);
  }
}

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  clock: FakeClock;
}

/** Boots the real app (same pipes, filter and guards as main.ts) against the test database. */
export async function createTestApp(
  now: string,
  options: { llm?: LlmClient; mailer?: Mailer; rateLimit?: AppConfig['rateLimit'] } = {},
): Promise<TestApp> {
  const config: AppConfig = {
    databaseUrl: process.env.DATABASE_URL!,
    hostAccessKey: HOST_KEY,
    timezone: TIMEZONE,
    webOrigin: 'http://localhost:5173',
    port: 0,
    mailFrom: 'SlotBook <no-reply@slotbook.test>',
    // High by default so the concurrency tests aren't throttled; the rate-limit test sets its own.
    rateLimit: options.rateLimit ?? { limit: 100_000, windowMs: 60_000 },
  };
  const clock = new FakeClock(new Date(now));
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(config, { logLevel: 'silent' })],
  })
    .overrideProvider(Clock)
    .useValue(clock)
    // No test ever calls the real Gemini API: without an override, there's no LLM at all.
    .overrideProvider(LLM_CLIENT)
    .useValue(options.llm ?? null)
    // Likewise no test sends real email: without an override, emails are skipped.
    .overrideProvider(MAILER)
    .useValue(options.mailer ?? null)
    .compile();

  const app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }), config);
  // Listening once up front stops supertest from opening a server per request.
  await app.listen(0);
  return { app, prisma: app.get(PrismaService), clock };
}

/** A mailer that keeps what it was asked to send. */
export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE "booking", "waitlist_entry", "slot" RESTART IDENTITY CASCADE');
}
