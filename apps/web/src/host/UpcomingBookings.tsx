import type { HostBookingDto } from '@slotbook/shared';
import { formatLongDate, formatTime } from '../lib/format';

export function UpcomingBookings({ bookings, timezone }: { bookings: HostBookingDto[]; timezone: string }) {
  if (bookings.length === 0) {
    return <p className="card__empty">No upcoming bookings yet. They'll appear here as people book.</p>;
  }
  return (
    <ul className="booking-list">
      {bookings.map((b) => (
        <li key={b.id} className="booking-list__item">
          <div className="booking-list__when">
            <span className="booking-list__date">{formatLongDate(b.slot.startsAt, timezone)}</span>
            <span className="booking-list__time">
              {formatTime(b.slot.startsAt, timezone)} – {formatTime(b.slot.endsAt, timezone)}
            </span>
          </div>
          <div className="booking-list__who">
            <span className="booking-list__name">{b.name}</span>
            <a className="booking-list__email" href={`mailto:${b.email}`}>
              {b.email}
            </a>
            <span className="reference booking-list__ref" aria-label={`Reference ${b.reference}`}>
              {b.reference}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
