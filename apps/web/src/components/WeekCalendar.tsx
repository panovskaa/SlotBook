import type { SlotDto } from '@slotbook/shared';
import { Link } from 'react-router-dom';
import { dayParts, zonedDate } from '../lib/format';
import { SlotCell } from './SlotCell';

interface Props {
  dates: string[];
  slots: SlotDto[];
  timezone: string;
  today: string;
}

/**
 * Monday to Sunday. Seven columns on wider screens; below 768 px the same markup stacks into a
 * list grouped by day (FR-2). Each day is a labelled list so screen readers can jump between days.
 * A day whose slots are all taken offers the waitlist (FR-9).
 */
export function WeekCalendar({ dates, slots, timezone, today }: Props) {
  const byDate = new Map<string, SlotDto[]>(dates.map((d) => [d, []]));
  for (const slot of slots) byDate.get(zonedDate(slot.startsAt, timezone))?.push(slot);

  return (
    <div className="week">
      {dates.map((date) => {
        const { weekday, longWeekday, day, month } = dayParts(date);
        const daySlots = byDate.get(date)!;
        const isToday = date === today;
        const fullyBooked = date >= today && daySlots.length > 0 && daySlots.every((s) => s.state !== 'AVAILABLE');
        const headingId = `day-${date}`;
        return (
          <section
            key={date}
            className={`day${isToday ? ' day--today' : ''}${daySlots.length ? '' : ' day--empty'}`}
            aria-labelledby={headingId}
          >
            <h3 className="day__heading" id={headingId}>
              <span className="day__weekday" aria-hidden="true">
                {weekday}
              </span>
              <span className="day__date" aria-hidden="true">
                {day}
              </span>
              <span className="visually-hidden">
                {longWeekday} {day} {month}
                {isToday ? ', today' : ''}
              </span>
              {isToday && (
                <span className="day__today" aria-hidden="true">
                  Today
                </span>
              )}
            </h3>
            {daySlots.length ? (
              <ul className="day__slots">
                {daySlots.map((slot) => (
                  <li key={slot.id}>
                    <SlotCell slot={slot} timezone={timezone} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="day__none">No times</p>
            )}
            {fullyBooked && (
              <div className="day__full">
                <p className="day__full-text">Fully booked</p>
                <Link
                  to={`/join-waitlist/${date}`}
                  className="day__waitlist"
                  aria-label={`Join the waitlist for ${longWeekday} ${day} ${month}`}
                >
                  Join the waitlist
                </Link>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
