import type { HostBookingDto, SlotDto } from '@slotbook/shared';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { ApiRequestError, type HostApi, api as publicApi } from '../api/client';
import { Icon } from '../components/Icon';
import { ErrorState, LoadingState } from '../components/States';
import { dayParts, formatDuration, formatLongDate, formatTime, zonedDate } from '../lib/format';
import { useApi } from '../lib/useApi';

const DAYS = 14;
const STATE_LABEL = { AVAILABLE: 'Open', BOOKED: 'Booked', UNAVAILABLE: 'Closed for booking' } as const;

interface Props {
  api: HostApi;
  timezone: string;
  version: number;
  bookings: HostBookingDto[];
  onDeleted: (announcement: string) => void;
  onUnauthorized: () => void;
}

/** The next two weeks of slots. Free slots can be deleted after a confirm step (FR-8). */
export function SlotList({ api, timezone, version, bookings, onDeleted, onUnauthorized }: Props) {
  const today = DateTime.now().setZone(timezone);
  const from = today.toISODate()!;
  const to = today.plus({ days: DAYS - 1 }).toISODate()!;
  const slots = useApi((signal) => publicApi.slots(from, to, signal), `${from}-${version}`);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ id: string; message: string } | null>(null);

  if (slots.status === 'loading') return <LoadingState label="Loading slots…" />;
  if (slots.status === 'error') return <ErrorState title="We couldn't load your slots." onRetry={slots.retry} />;
  if (slots.data.slots.length === 0) {
    return <p className="card__empty">No slots in the next two weeks. Add one above.</p>;
  }

  const bookerBySlot = new Map(bookings.map((b) => [b.slotId, b.name]));
  const byDate = new Map<string, SlotDto[]>();
  for (const s of slots.data.slots) {
    const date = zonedDate(s.startsAt, timezone);
    byDate.set(date, [...(byDate.get(date) ?? []), s]);
  }

  const remove = async (slot: SlotDto) => {
    setDeleting(slot.id);
    setProblem(null);
    try {
      await api.deleteSlot(slot.id);
      setConfirming(null);
      onDeleted(`Deleted ${formatTime(slot.startsAt, timezone)} on ${formatLongDate(slot.startsAt, timezone)}`);
    } catch (err) {
      const e = err instanceof ApiRequestError ? err : new ApiRequestError(0, null);
      if (e.status === 401) {
        onUnauthorized();
        return;
      }
      setProblem({
        id: slot.id,
        message:
          e.code === 'SLOT_ALREADY_BOOKED'
            ? 'Someone has just booked this slot, so it can’t be deleted.'
            : e.status === 0
              ? "We couldn't reach the server. Try again."
              : 'This slot could not be deleted.',
      });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="slot-days">
      {[...byDate].map(([date, daySlots]) => {
        const { longWeekday, day, month } = dayParts(date);
        return (
          <section key={date} className="slot-day" aria-labelledby={`host-day-${date}`}>
            <h3 id={`host-day-${date}`} className="slot-day__heading">
              {longWeekday} {day} {month}
            </h3>
            <ul className="slot-rows">
              {daySlots.map((s) => {
                const booker = bookerBySlot.get(s.id);
                const time = `${formatTime(s.startsAt, timezone)} – ${formatTime(s.endsAt, timezone)}`;
                return (
                  <li key={s.id} className="slot-row">
                    <span className="slot-row__time">{time}</span>
                    <span className="slot-row__length">{formatDuration(s.durationMinutes)}</span>
                    <span className={`badge badge--${s.state.toLowerCase()}`}>
                      <Icon
                        name={s.state === 'BOOKED' ? 'lock' : s.state === 'AVAILABLE' ? 'check' : 'clock'}
                        size={14}
                      />
                      {STATE_LABEL[s.state]}
                      {booker && <span className="slot-row__booker">· {booker}</span>}
                    </span>
                    <span className="slot-row__actions">
                      {s.state !== 'BOOKED' &&
                        (confirming === s.id ? (
                          <>
                            <button
                              type="button"
                              className="button button--danger-solid button--small"
                              onClick={() => remove(s)}
                              disabled={deleting === s.id}
                            >
                              {deleting === s.id ? 'Deleting…' : 'Delete'}
                              <span className="visually-hidden"> {time} now</span>
                            </button>
                            <button
                              type="button"
                              className="button button--secondary button--small"
                              onClick={() => setConfirming(null)}
                              disabled={deleting === s.id}
                            >
                              Keep
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="button button--danger button--small"
                            onClick={() => setConfirming(s.id)}
                            aria-label={`Delete ${time} on ${longWeekday} ${day} ${month}`}
                          >
                            Delete
                          </button>
                        ))}
                    </span>
                    {problem?.id === s.id && (
                      <p className="field__error slot-row__error" role="alert">
                        <Icon name="alert" size={14} />
                        {problem.message}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
