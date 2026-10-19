import { useEffect, useRef } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Icon } from '../components/Icon';
import { PrivateLink } from '../components/PrivateLink';
import { ErrorState, LoadingState } from '../components/States';
import { dayParts, formatDuration, formatTime } from '../lib/format';
import { useApi } from '../lib/useApi';

/** How each waitlist status is shown in the details list. */
const BADGE = {
  WAITING: { tone: 'unavailable', icon: 'clock', label: 'Waiting' },
  NOTIFIED: { tone: 'available', icon: 'check', label: 'Slot opened up' },
  BOOKED: { tone: 'available', icon: 'check', label: 'Booked for you' },
  EXPIRED: { tone: 'cancelled', icon: 'clock', label: 'Closed' },
} as const;

/**
 * FR-9: the private waitlist status link. Shows whether you're still waiting, or the slot that was
 * booked for you when one freed up.
 */
export function WaitlistStatusPage() {
  const { token = '' } = useParams();
  const state = useLocation().state as { justJoined?: boolean; emailSent?: boolean } | null;
  const justJoined = Boolean(state?.justJoined);
  const emailSent = Boolean(state?.emailSent);
  const result = useApi((signal) => api.waitlistStatus(token, signal), token);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Announce the result once it's known (NFR-1).
  useEffect(() => {
    if (result.status === 'ready') headingRef.current?.focus();
  }, [result.status]);

  if (result.status === 'loading') return <LoadingState label="Checking the waitlist…" />;
  if (result.status === 'error') {
    return (
      <div className="narrow">
        <h1 className="page-title">Waitlist</h1>
        {result.error.status === 404 ? (
          <ErrorState title="This link doesn't match a waitlist entry.">
            Check that you copied the whole link. <Link to="/">See available times</Link>.
          </ErrorState>
        ) : (
          <ErrorState title="We couldn't check the waitlist." onRetry={result.retry} />
        )}
      </div>
    );
  }

  const entry = result.data;
  const { longWeekday, day, month } = dayParts(entry.date);
  const dateLabel = `${longWeekday} ${day} ${month}`;
  const open = entry.availableSlots;
  const booked = entry.booking;

  return (
    <div className="narrow">
      {entry.status === 'NOTIFIED' && open.length > 0 && (
        <>
          <div className="success-mark" aria-hidden="true">
            <Icon name="check" size={28} />
          </div>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>
            A slot opened up!
          </h1>
          <p className="lede lede--tight">
            There {open.length === 1 ? 'is a free slot' : `are ${open.length} free slots`} on {dateLabel}. Book quickly:
            the first person to book gets it.
          </p>
          <ul className="open-slots">
            {open.map((s) => (
              <li key={s.id}>
                <Link to={`/book/${s.id}`} className="slot slot--available open-slots__slot">
                  <span className="slot__time">
                    <span aria-hidden="true">
                      {formatTime(s.startsAt, entry.timezone)} – {formatTime(s.endsAt, entry.timezone)}
                    </span>
                    <span className="visually-hidden">
                      Book {formatTime(s.startsAt, entry.timezone)} to {formatTime(s.endsAt, entry.timezone)},{' '}
                      {dateLabel},
                    </span>
                  </span>
                  <span className="slot__meta">{formatDuration(s.durationMinutes)}</span>
                  <span className="slot__state">
                    <Icon name="check" size={14} />
                    Book this time
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {entry.status === 'NOTIFIED' && open.length === 0 && (
        <>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>
            That slot has been taken again.
          </h1>
          <p className="lede lede--tight">
            A slot opened up on {dateLabel}, but someone has booked it since. Check back here in case another one opens.
          </p>
        </>
      )}

      {entry.status === 'BOOKED' && booked?.status === 'CONFIRMED' && (
        <>
          <div className="success-mark" aria-hidden="true">
            <Icon name="check" size={28} />
          </div>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>
            You got a slot!
          </h1>
          <p className="lede lede--tight">
            A time opened up on {dateLabel} and you were first on the waitlist, so it's booked for you. The confirmation
            email has your private link to cancel.
          </p>
        </>
      )}

      {entry.status === 'BOOKED' && booked?.status === 'CANCELLED' && (
        <>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>
            Your waitlist booking was cancelled.
          </h1>
          <p className="lede lede--tight">
            You got a slot on {dateLabel} from the waitlist, and it has since been cancelled.
          </p>
        </>
      )}

      {entry.status === 'WAITING' && (
        <>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>
            {justJoined ? "You're on the waitlist." : 'Still waiting'}
          </h1>
          <p className="lede lede--tight">
            {dateLabel} is fully booked. If a slot opens up and you're first in line, it's booked for you automatically,
            and we'll email you the details.
          </p>
        </>
      )}

      {entry.status === 'EXPIRED' && (
        <>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>
            This waitlist has closed.
          </h1>
          <p className="lede lede--tight">{dateLabel} has passed.</p>
        </>
      )}

      <dl className="details">
        <div>
          <dt>Date</dt>
          <dd>{dateLabel}</dd>
        </div>
        {booked && (
          <>
            <div>
              <dt>Your time</dt>
              <dd>
                {formatTime(booked.startsAt, entry.timezone)} – {formatTime(booked.endsAt, entry.timezone)}
              </dd>
            </div>
            <div>
              <dt>Booking reference</dt>
              <dd className="reference">{booked.reference}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Name</dt>
          <dd>{entry.name}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className={`badge badge--${BADGE[entry.status].tone}`}>
              <Icon name={BADGE[entry.status].icon} size={14} />
              {entry.status === 'BOOKED' && booked?.status === 'CANCELLED' ? 'Cancelled' : BADGE[entry.status].label}
            </span>
          </dd>
        </div>
      </dl>

      {justJoined && (
        <PrivateLink path={`/waitlist/${token}`} label="Private waitlist link">
          Come back to this link to check the waitlist.{' '}
          {emailSent
            ? "We've also emailed it to you. It's private, so keep it to yourself."
            : "Copy it now: it's shown only once here."}
        </PrivateLink>
      )}

      <div className="actions-row">
        {(entry.status === 'WAITING' || entry.status === 'NOTIFIED') && (
          <button type="button" className="button button--secondary" onClick={result.retry}>
            Check again
          </button>
        )}
        <Link to="/" className="button button--secondary">
          See all times
        </Link>
      </div>
    </div>
  );
}
