import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { Clock } from '../src/common/clock';
import { AppConfig } from '../src/config';
import { configureApp } from '../src/configure-app';
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
export async function createTestApp(now: string): Promise<TestApp> {
  const config: AppConfig = {
    databaseUrl: process.env.DATABASE_URL!,
    hostAccessKey: HOST_KEY,
    timezone: TIMEZONE,
    webOrigin: 'http://localhost:5173',
    port: 0,
  };
  const clock = new FakeClock(new Date(now));
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(config, { logLevel: 'silent' })],
  })
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();

  const app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }), config);
  // Listening once up front stops supertest from opening a server per request.
  await app.listen(0);
  return { app, prisma: app.get(PrismaService), clock };
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE "booking", "waitlist_entry", "slot" RESTART IDENTITY CASCADE');
}
