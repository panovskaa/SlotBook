import { DateTime } from 'luxon';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiRequestError, api } from '../api/client';
import { BookingForm, problemFromApiError } from '../booking/BookingForm';
import type { BookingFormValues } from '../booking/schema';
import { Icon } from '../components/Icon';
import { OFFERING } from '../content';
import { ErrorState, LoadingState } from '../components/States';
import { formatDuration, formatLongDate, formatTime } from '../lib/format';
import { useApi } from '../lib/useApi';
import { formatWeek, weekOf } from '../lib/week';

/** FR-3: the booking form for one slot. */
export function BookPage() {
  const { slotId = '' } = useParams();
  const navigate = useNavigate();
  const result = useApi((signal) => api.slot(slotId, signal), slotId);

  const backTo =
    result.status === 'ready'
      ? `/?week=${formatWeek(weekOf(DateTime.fromISO(result.data.slot.startsAt, { zone: result.data.timezone })))}`
      : '/';

  const book = async (values: BookingFormValues) => {
    try {
      const booking = await api.book({ slotId, ...values });
      void navigate(`/confirmation/${booking.reference}`, {
        state: { booking, timezone: result.status === 'ready' ? result.data.timezone : undefined },
      });
      return null;
    } catch (err) {
      const e = err instanceof ApiRequestError ? err : new ApiRequestError(0, null);
      return problemFromApiError(e.status, e.body);
    }
  };

  return (
    <div className="narrow">
      <Link to={backTo} className="back-link">
        <Icon name="chevronLeft" size={16} />
        All times
      </Link>
      <h1 className="page-title">Confirm your booking</h1>

      {result.status === 'loading' && <LoadingState label="Loading this time…" />}

      {result.status === 'error' &&
        (result.error.status === 404 ? (
          <ErrorState title="This time is no longer available.">
            It may have been removed or already started. <Link to="/">Choose another time</Link>.
          </ErrorState>
        ) : (
          <ErrorState title="We couldn't load this time." onRetry={result.retry} />
        ))}

      {result.status === 'ready' && (
        <>
          <div className="summary">
            <p className="summary__what">{OFFERING.title}</p>
            <p className="summary__date">{formatLongDate(result.data.slot.startsAt, result.data.timezone)}</p>
            <p className="summary__time">
              {formatTime(result.data.slot.startsAt, result.data.timezone)} –{' '}
              {formatTime(result.data.slot.endsAt, result.data.timezone)}
              <span className="summary__duration">{formatDuration(result.data.slot.durationMinutes)}</span>
            </p>
          </div>

          {result.data.slot.state === 'AVAILABLE' ? (
            <BookingForm onSubmit={book} backTo={backTo} />
          ) : (
            <ErrorState
              title={
                result.data.slot.state === 'BOOKED'
                  ? 'This time is already booked.'
                  : 'Booking for this time has closed.'
              }
            >
              {result.data.slot.state === 'UNAVAILABLE' && 'Booking closes 30 minutes before start. '}
              <Link to={backTo}>Choose another time</Link>.
            </ErrorState>
          )}
        </>
      )}
    </div>
  );
}
