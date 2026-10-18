import { CANCELLATION_CUTOFF_MESSAGE, type ManageBookingResponse } from '@slotbook/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiRequestError, api } from '../api/client';
import { Icon } from '../components/Icon';
import { ErrorState, LoadingState } from '../components/States';
import { formatLongDate, formatTime } from '../lib/format';
import { useApi } from '../lib/useApi';

type Step = 'idle' | 'confirming' | 'cancelling';

/** FR-7: the private link. Shows the booking and lets its holder cancel up to an hour before. */
export function ManagePage() {
  const { token = '' } = useParams();
  const result = useApi((signal) => api.manage(token, signal), token);

  if (result.status === 'loading') return <LoadingState label="Loading your booking…" />;
  if (result.status === 'error') {
    return (
      <div className="narrow">
        <h1 className="page-title">Manage booking</h1>
        {result.error.status === 404 ? (
          <ErrorState title="This link doesn't match a booking.">
            Check that you copied the whole link from your confirmation. <Link to="/">See available times</Link>.
          </ErrorState>
        ) : (
          <ErrorState title="We couldn't load your booking." onRetry={result.retry} />
        )}
      </div>
    );
  }
  return <ManageBooking token={token} initial={result.data} />;
}

function ManageBooking({ token, initial }: { token: string; initial: ManageBookingResponse }) {
  const [booking, setBooking] = useState(initial);
  const [step, setStep] = useState<Step>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [justCancelled, setJustCancelled] = useState(false);
  const confirmRef = useRef<HTMLParagraphElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const { timezone } = booking;
  const when = `${formatLongDate(booking.slot.startsAt, timezone)} at ${formatTime(booking.slot.startsAt, timezone)}`;
  const cancelled = booking.status === 'CANCELLED';

  // Keep keyboard and screen reader users where the action is (NFR-1).
  useEffect(() => {
    if (step === 'confirming') confirmRef.current?.focus();
  }, [step]);
  useEffect(() => {
    if (justCancelled) resultRef.current?.focus();
  }, [justCancelled]);

  const cancel = async () => {
    setStep('cancelling');
    setProblem(null);
    try {
      const res = await api.cancel(token);
      setBooking(res);
      setJustCancelled(true);
      setStep('idle');
    } catch (err) {
      const e = err instanceof ApiRequestError ? err : new ApiRequestError(0, null);
      if (e.code === 'CANCELLATION_CUTOFF') {
        setBooking((b) => ({ ...b, canCancel: false }));
        setStep('idle');
        return;
      }
      setProblem(e.status === 0 ? "We couldn't reach the server. Check your connection and try again." : 'Something went wrong. Please try again.');
      setStep('confirming');
    }
  };

  return (
    <div className="narrow">
      <h1 className="page-title">{cancelled ? 'This booking is cancelled.' : 'Your booking'}</h1>

      {justCancelled && (
        <div className="notice notice--success" role="status" tabIndex={-1} ref={resultRef}>
          <Icon name="check" />
          <div>
            <p className="notice__title">Your booking is cancelled.</p>
            <p className="notice__body">The time is open for others again.</p>
          </div>
        </div>
      )}

      <dl className="details">
        <div>
          <dt>When</dt>
          <dd className={cancelled ? 'details__struck' : undefined}>
            {when} – {formatTime(booking.slot.endsAt, timezone)}
          </dd>
        </div>
        <div>
          <dt>Name</dt>
          <dd>{booking.name}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{booking.email}</dd>
        </div>
        <div>
          <dt>Booking reference</dt>
          <dd className="reference">{booking.reference}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className={`badge badge--${cancelled ? 'cancelled' : 'confirmed'}`}>
              <Icon name={cancelled ? 'alert' : 'check'} size={14} />
              {cancelled ? 'Cancelled' : 'Confirmed'}
            </span>
          </dd>
        </div>
      </dl>

      {!cancelled && booking.canCancel && step === 'idle' && (
        <section className="cancel-box" aria-labelledby="cancel-heading">
          <h2 id="cancel-heading" className="cancel-box__title">
            Can't make it?
          </h2>
          <p className="cancel-box__body">You can cancel until 1 hour before the start. The time then opens up for someone else.</p>
          <button type="button" className="button button--danger" onClick={() => setStep('confirming')}>
            Cancel booking
          </button>
        </section>
      )}

      {!cancelled && booking.canCancel && step !== 'idle' && (
        <section className="cancel-box cancel-box--confirm" aria-labelledby="confirm-text">
          <p id="confirm-text" className="cancel-box__title" tabIndex={-1} ref={confirmRef}>
            Cancel your booking for {when}?
          </p>
          <p className="cancel-box__body">This can't be undone. You'd need to book again if you change your mind.</p>
          {problem && (
            <p className="field__error" role="alert">
              <Icon name="alert" size={14} />
              {problem}
            </p>
          )}
          <div className="cancel-box__actions">
            <button type="button" className="button button--danger-solid" onClick={cancel} disabled={step === 'cancelling'}>
              {step === 'cancelling' ? (
                <>
                  <span className="spinner spinner--on-accent" aria-hidden="true" /> Cancelling…
                </>
              ) : (
                'Yes, cancel booking'
              )}
            </button>
            <button type="button" className="button button--secondary" onClick={() => setStep('idle')} disabled={step === 'cancelling'}>
              Keep booking
            </button>
          </div>
          <p className="visually-hidden" aria-live="polite">
            {step === 'cancelling' ? 'Cancelling your booking…' : ''}
          </p>
        </section>
      )}

      {!cancelled && !booking.canCancel && (
        <div className="notice notice--warning" role="status">
          <Icon name="clock" />
          <div>
            <p className="notice__title">{CANCELLATION_CUTOFF_MESSAGE}.</p>
            <p className="notice__body">It's too late to cancel this booking online.</p>
          </div>
        </div>
      )}

      <Link to="/" className="button button--secondary manage-back">
        {cancelled ? 'Book another time' : 'See all times'}
      </Link>
    </div>
  );
}
