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
    return (
      <Link
        to={`/book/${slot.id}`}
        className="slot slot--available"
        aria-label={`Book ${start} to ${end}, ${formatLongDate(slot.startsAt, timezone)}`}
      >
        {content}
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
