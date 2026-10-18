import type { SlotDto } from '@slotbook/shared';
import { Link } from 'react-router-dom';
import { dayParts, zonedDate } from '../lib/format';
import { Icon } from './Icon';
import { SlotCell } from './SlotCell';

interface Props {
  dates: string[];
  slots: SlotDto[];
  timezone: string;
  today: string;
  /** Dates where a slot opened up for the waitlist and is still free (FR-9) */
  openedUp?: string[];
}

/**
 * Monday to Sunday. Seven columns on wider screens; below 768 px the same markup stacks into a
 * list grouped by day (FR-2). Each day is a labelled list so screen readers can jump between days.
 * A day whose slots are all taken offers the waitlist (FR-9).
 */
export function WeekCalendar({ dates, slots, timezone, today, openedUp = [] }: Props) {
  const byDate = new Map<string, SlotDto[]>(dates.map((d) => [d, []]));
  for (const slot of slots) byDate.get(zonedDate(slot.startsAt, timezone))?.push(slot);

  return (
    <div className="week">
      {dates.map((date) => {
        const { weekday, longWeekday, day, month } = dayParts(date);
        const daySlots = byDate.get(date)!;
        const isToday = date === today;
        const fullyBooked = date >= today && daySlots.length > 0 && daySlots.every((s) => s.state !== 'AVAILABLE');
        const slotOpenedUp = openedUp.includes(date);
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
            {slotOpenedUp && (
              <p className="day__opened">
                <Icon name="check" size={14} />A slot opened up!
              </p>
            )}
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
