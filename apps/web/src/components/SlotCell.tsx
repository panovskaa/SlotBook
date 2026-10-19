import type { SlotDto } from '@slotbook/shared';
import { Link } from 'react-router-dom';
import { formatDuration, formatLongDate, formatTime } from '../lib/format';
import { Icon } from './Icon';

const STATE_LABEL = { AVAILABLE: 'Available', BOOKED: 'Booked', UNAVAILABLE: 'Closed' } as const;
const STATE_ICON = { AVAILABLE: 'check', BOOKED: 'lock', UNAVAILABLE: 'clock' } as const;

/**
 * One slot in the calendar. Available slots link to the booking form; booked and closed ones are
 * plain text. Every state shows a word and an icon, never just a colour (FR-2, NFR-1).
 */
export function SlotCell({ slot, timezone }: { slot: SlotDto; timezone: string }) {
  const start = formatTime(slot.startsAt, timezone);
  const end = formatTime(slot.endsAt, timezone);
  const label = STATE_LABEL[slot.state];

  const content = (
    <>
      <span className="slot__time">{start}</span>
      <span className="slot__meta">{formatDuration(slot.durationMinutes)}</span>
      <span className="slot__state">
        <Icon name={STATE_ICON[slot.state]} size={14} />
        {label}
      </span>
    </>
  );

  if (slot.state === 'AVAILABLE') {
    // The name comes from the content, so it always includes the visible text (WCAG 2.5.3);
    // the hidden parts add what sighted users get from the column heading.
    return (
      <Link to={`/book/${slot.id}`} className="slot slot--available">
        <span className="visually-hidden">Book </span>
        <span className="slot__time">{start}</span>
        <span className="visually-hidden">
          {' '}
          to {end}, {formatLongDate(slot.startsAt, timezone)},{' '}
        </span>
        <span className="slot__meta">{formatDuration(slot.durationMinutes)}</span>
        <span className="slot__state">
          <Icon name="check" size={14} />
          {label}
        </span>
      </Link>
    );
  }

  return (
    <div
      className={`slot slot--${slot.state.toLowerCase()}`}
      aria-label={`${start} to ${end}, ${label.toLowerCase()}`}
      role="group"
    >
      {content}
    </div>
  );
}
