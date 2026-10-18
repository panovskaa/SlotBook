import { DateTime } from 'luxon';
import { PrismaClient } from '@prisma/client';
import { readConfig } from './config';
import { loadEnv } from './load-env';

/**
 * Fills the next two weeks with weekday slots so the calendar has something to show.
 * Re-running it clears every slot, booking and waitlist entry first.
 */
async function seed(): Promise<void> {
  loadEnv();
  const { timezone } = readConfig();
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction([
      prisma.booking.deleteMany(),
      prisma.waitlistEntry.deleteMany(),
      prisma.slot.deleteMany(),
    ]);

    const now = DateTime.now().setZone(timezone);
    const data: { startsAt: Date; endsAt: Date }[] = [];
    for (let day = 1; day <= 14; day++) {
      const date = now.plus({ days: day }).startOf('day');
      if (date.weekday > 5) continue;
      for (const [hour, minute, duration] of [
        [9, 0, 30],
        [9, 30, 30],
        [10, 30, 60],
        [13, 0, 45],
        [14, 0, 30],
        [15, 30, 60],
      ]) {
        const start = date.set({ hour, minute });
        data.push({ startsAt: start.toJSDate(), endsAt: start.plus({ minutes: duration }).toJSDate() });
      }
    }
    await prisma.slot.createMany({ data });
    console.log(`Seeded ${data.length} slots over the next two weeks (${timezone}).`);
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
