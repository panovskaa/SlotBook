import { DateTime } from 'luxon';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { Icon } from '../components/Icon';
import { LandingHero } from '../components/LandingHero';
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

  // The dates travel with the slots, so the last loaded week can stay on screen as one piece.
  const result = useApi(
    (signal) =>
      api.slots(dates[0], dates[6], signal).then((data) => {
        rememberAppTimezone(data.timezone);
        return { dates, data };
      }),
    weekKey,
  );

  // While the next week loads, keep showing the last one (faded) instead of a short loading box:
  // swapping in something shorter made the page shrink, and the browser pulled the scroll position up.
  const shown = result.status === 'ready' ? result.data : result.status === 'loading' ? result.previous : undefined;
  const stale = result.status === 'loading' && shown !== undefined;

  // "Book a session" in the header links to /#times: bring the calendar into view.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#times') document.getElementById('times')?.scrollIntoView();
  }, [hash]);

  // Changing week never makes the panel shorter than it was, so the page can't shrink under the
  // reader and pull the scroll position up (an emptier week just leaves some space).
  const panelRef = useRef<HTMLElement>(null);
  const [minHeight, setMinHeight] = useState<number>();
  const goTo = (target: typeof week) => {
    const current = panelRef.current?.offsetHeight ?? 0;
    setMinHeight((h) => Math.max(h ?? 0, current));
    setParams({ week: formatWeek(target) });
  };
  const isThisWeek = compareWeeks(week, thisWeek) === 0;
  const isPast = compareWeeks(week, thisWeek) < 0;

  return (
    <>
      <LandingHero />

      <div id="times" className="container calendar-section">
        <section
          ref={panelRef}
          className="panel"
          style={{ minHeight }}
          aria-labelledby="week-heading"
          aria-busy={result.status === 'loading'}
        >
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
              <button
                type="button"
                className="icon-button"
                onClick={() => goTo(shiftWeek(week, 1))}
                aria-label="Next week"
              >
                <Icon name="chevronRight" />
              </button>
            </div>
          </div>

          {result.status === 'loading' && !stale && <LoadingState label="Loading times…" />}
          {stale && (
            <p className="visually-hidden" role="status">
              Loading times…
            </p>
          )}
          {result.status === 'error' && (
            <ErrorState title="We couldn't load the times." onRetry={result.retry}>
              Check your connection and try again.
            </ErrorState>
          )}
          {shown && (
            <div className={stale ? 'week-body week-body--stale' : 'week-body'}>
              {shown.data.slots.length === 0 ? (
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
                  dates={shown.dates}
                  slots={shown.data.slots}
                  timezone={shown.data.timezone}
                  today={DateTime.now().setZone(shown.data.timezone).toISODate()!}
                  openedUp={shown.data.openedUp}
                />
              )}
            </div>
          )}
        </section>

        <p className="credits">
          Hero animation by <a href="https://skiper-ui.com">Skiper UI</a>, illustrations by{' '}
          <a href="https://www.openpeeps.com">Open Peeps</a>.
        </p>
      </div>
    </>
  );
}
