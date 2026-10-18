import type { CreateBookingResponse } from '@slotbook/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Icon } from '../components/Icon';
import { ErrorState, LoadingState } from '../components/States';
import { formatLongDate, formatTime } from '../lib/format';
import { getAppTimezone } from '../lib/timezone';
import { useApi } from '../lib/useApi';

interface NavState {
  booking?: CreateBookingResponse;
  timezone?: string;
}

/**
 * FR-3: shown right after booking, with the reference, the private cancellation link and the message.
 * The link exists only in the booking response, so a reload falls back to the public lookup without it.
 */
export function ConfirmationPage() {
  const { ref = '' } = useParams();
  const { booking, timezone: navTimezone } = (useLocation().state ?? {}) as NavState;
  const timezone = navTimezone ?? getAppTimezone();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the result so screen readers announce it (NFR-1).
  useEffect(() => headingRef.current?.focus(), []);

  if (booking && booking.reference === ref) {
    return (
      <div className="narrow">
        <div className="success-mark" aria-hidden="true">
          <Icon name="check" size={28} />
        </div>
        <h1 className="page-title" tabIndex={-1} ref={headingRef}>
          You're booked.
        </h1>
        <p className="lede lede--tight">{booking.message}</p>

        <dl className="details">
          <div>
            <dt>When</dt>
            <dd>
              {formatLongDate(booking.slot.startsAt, timezone)}, {formatTime(booking.slot.startsAt, timezone)} –{' '}
              {formatTime(booking.slot.endsAt, timezone)}
            </dd>
          </div>
          <div>
            <dt>Booking reference</dt>
            <dd className="reference">{booking.reference}</dd>
          </div>
        </dl>

        <ManageLink path={booking.managePath} />

        <Link to="/" className="button button--secondary">
          Back to all times
        </Link>
      </div>
    );
  }

  return <ConfirmationLookup reference={ref} timezone={timezone} headingRef={headingRef} />;
}

function ManageLink({ path }: { path: string }) {
  const url = `${window.location.origin}${path}`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="manage" aria-labelledby="manage-heading">
      <h2 id="manage-heading" className="manage__title">
        Your private link
      </h2>
      <p className="manage__body">
        Use it to cancel, up to an hour before the start. Keep it safe: it's shown only once, and anyone with the link can
        cancel.
      </p>
      <div className="manage__row">
        <input className="field__input manage__url" readOnly value={url} aria-label="Private cancellation link" onFocus={(e) => e.target.select()} />
        <button type="button" className="button button--secondary" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {copied ? 'Link copied' : ''}
      </p>
    </section>
  );
}

function ConfirmationLookup({
  reference,
  timezone,
  headingRef,
}: {
  reference: string;
  timezone: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const result = useApi((signal) => api.lookup(reference, signal), reference);
  useEffect(() => {
    if (result.status !== 'loading') headingRef.current?.focus();
  }, [result.status, headingRef]);

  if (result.status === 'loading') return <LoadingState label="Looking up your booking…" />;
  if (result.status === 'error') {
    return (
      <div className="narrow">
        <h1 className="page-title" tabIndex={-1} ref={headingRef}>
          Booking not found
        </h1>
        <ErrorState title={result.error.status === 404 ? 'No booking has this reference.' : "We couldn't look up this booking."} onRetry={result.error.status === 404 ? undefined : result.retry}>
          <Link to="/">Go to the calendar</Link>
        </ErrorState>
      </div>
    );
  }

  const { data } = result;
  const cancelled = data.status === 'CANCELLED';
  return (
    <div className="narrow">
      <h1 className="page-title" tabIndex={-1} ref={headingRef}>
        {cancelled ? 'This booking was cancelled.' : 'Your booking is confirmed.'}
      </h1>
      <dl className="details">
        <div>
          <dt>When</dt>
          <dd>
            {formatLongDate(data.slot.startsAt, timezone)}, {formatTime(data.slot.startsAt, timezone)} –{' '}
            {formatTime(data.slot.endsAt, timezone)}
          </dd>
        </div>
        <div>
          <dt>Booking reference</dt>
          <dd className="reference">{data.reference}</dd>
        </div>
      </dl>
      {!cancelled && (
        <p className="muted-text">The private cancellation link was shown once, right after booking. Use that link to cancel.</p>
      )}
      <Link to="/" className="button button--secondary">
        Back to all times
      </Link>
    </div>
  );
}
