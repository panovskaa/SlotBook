import { DateTime } from 'luxon';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { Icon } from '../components/Icon';
import { ErrorState, LoadingState } from '../components/States';
import { WeekCalendar } from '../components/WeekCalendar';
import { getAppTimezone, rememberAppTimezone } from '../lib/timezone';
import { useApi } from '../lib/useApi';
import { compareWeeks, currentWeek, formatWeek, parseWeek, shiftWeek, weekDates, weekLabel } from '../lib/week';

/** FR-2: the public weekly calendar. The week lives in the URL (?week=2026-W43), so links and reloads keep it. */
export function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const thisWeek = currentWeek(getAppTimezone());
  const week = parseWeek(params.get('week')) ?? thisWeek;
  const weekKey = formatWeek(week);
  const dates = weekDates(week);

  // Fix a missing or malformed ?week= in place, without adding a history entry.
  useEffect(() => {
    if (params.get('week') !== weekKey) setParams({ week: weekKey }, { replace: true });
  }, [params, weekKey, setParams]);

  const result = useApi(
    (signal) =>
      api.slots(dates[0], dates[6], signal).then((data) => {
        rememberAppTimezone(data.timezone);
        return data;
      }),
    weekKey,
  );

  const goTo = (target: typeof week) => setParams({ week: formatWeek(target) });
  const isThisWeek = compareWeeks(week, thisWeek) === 0;
  const isPast = compareWeeks(week, thisWeek) < 0;

  return (
    <>
      <section className="intro">
        <h1 className="display">Find a time that works.</h1>
        <p className="lede">Pick an open slot below. Booking takes less than a minute, and you can cancel up to an hour before.</p>
      </section>

      <section className="panel" aria-labelledby="week-heading">
        <div className="week-nav">
          <h2 id="week-heading" className="week-nav__label" aria-live="polite">
            {weekLabel(week)}
          </h2>
          <div className="week-nav__controls">
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => goTo(thisWeek)}
              disabled={isThisWeek}
            >
              Today
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => goTo(shiftWeek(week, -1))}
              disabled={isThisWeek || isPast}
              aria-label="Previous week"
            >
              <Icon name="chevronLeft" />
            </button>
            <button type="button" className="icon-button" onClick={() => goTo(shiftWeek(week, 1))} aria-label="Next week">
              <Icon name="chevronRight" />
            </button>
          </div>
        </div>

        {result.status === 'loading' && <LoadingState label="Loading times…" />}
        {result.status === 'error' && (
          <ErrorState title="We couldn't load the times." onRetry={result.retry}>
            Check your connection and try again.
          </ErrorState>
        )}
        {result.status === 'ready' &&
          (result.data.slots.length === 0 ? (
            <div className="empty">
              <Icon name="calendar" size={28} />
              <p className="empty__title">No times this week.</p>
              <p className="empty__body">New times are added regularly. Try the next week.</p>
              <button type="button" className="button button--secondary" onClick={() => goTo(shiftWeek(week, 1))}>
                Show next week
              </button>
            </div>
          ) : (
            <WeekCalendar
              dates={dates}
              slots={result.data.slots}
              timezone={result.data.timezone}
              today={DateTime.now().setZone(result.data.timezone).toISODate()!}
              openedUp={result.data.openedUp}
            />
          ))}
      </section>
    </>
  );
}
