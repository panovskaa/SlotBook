import { useEffect, useState } from 'react';
import type { HostApi } from '../api/client';
import { ErrorState, LoadingState } from '../components/States';
import { getAppTimezone, rememberAppTimezone } from '../lib/timezone';
import { useApi } from '../lib/useApi';
import { CreateSlotForm } from './CreateSlotForm';
import { Insights } from './Insights';
import { SlotList } from './SlotList';
import { StatTiles } from './StatTiles';
import { UpcomingBookings } from './UpcomingBookings';

interface Props {
  api: HostApi;
  onLock: () => void;
  /** The key stopped working (changed on the server): go back to the key screen. */
  onUnauthorized: () => void;
}

/** FR-8: stats, upcoming bookings, adding slots and deleting free ones. */
export function Dashboard({ api, onLock, onUnauthorized }: Props) {
  // Bumped after every change, so each section reloads from the server.
  const [version, setVersion] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const stats = useApi((signal) => api.stats(signal), `stats-${version}`);
  const bookings = useApi((signal) => api.bookings(signal), `bookings-${version}`);
  const insights = useApi((signal) => api.insights(signal), `insights-${version}`);

  const unauthorized = [stats, bookings, insights].some((r) => r.status === 'error' && r.error.status === 401);
  useEffect(() => {
    if (unauthorized) onUnauthorized();
  }, [unauthorized, onUnauthorized]);

  if (stats.status === 'ready') rememberAppTimezone(stats.data.timezone);
  const timezone = stats.status === 'ready' ? stats.data.timezone : getAppTimezone();

  const changed = (message: string) => {
    setAnnouncement(message);
    setVersion((v) => v + 1);
  };

  return (
    <div className="dashboard">
      <div className="dashboard__head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="muted-text dashboard__tz">Times are in {timezone.replace('_', ' ')}.</p>
        </div>
        <button type="button" className="button button--secondary button--small" onClick={onLock}>
          Lock
        </button>
      </div>

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      <section aria-labelledby="stats-heading" className="dashboard__section">
        <h2 id="stats-heading" className="visually-hidden">
          Overview
        </h2>
        {stats.status === 'loading' && <LoadingState label="Loading numbers…" />}
        {stats.status === 'error' && stats.error.status !== 401 && (
          <ErrorState title="We couldn't load the numbers." onRetry={stats.retry} />
        )}
        {stats.status === 'ready' && <StatTiles stats={stats.data} />}
      </section>

      <div className="dashboard__columns">
        <section aria-labelledby="create-heading" className="card">
          <h2 id="create-heading" className="card__title">
            Add a slot
          </h2>
          <CreateSlotForm api={api} timezone={timezone} onCreated={changed} onUnauthorized={onUnauthorized} />
        </section>

        <section aria-labelledby="bookings-heading" className="card">
          <h2 id="bookings-heading" className="card__title">
            Upcoming bookings
          </h2>
          {bookings.status === 'loading' && <LoadingState label="Loading bookings…" />}
          {bookings.status === 'error' && bookings.error.status !== 401 && (
            <ErrorState title="We couldn't load the bookings." onRetry={bookings.retry} />
          )}
          {bookings.status === 'ready' && <UpcomingBookings bookings={bookings.data.bookings} timezone={timezone} />}
        </section>
      </div>

      <section aria-labelledby="insights-heading" className="card dashboard__section">
        <h2 id="insights-heading" className="card__title">
          Insights
        </h2>
        {insights.status === 'loading' && <LoadingState label="Loading insights…" />}
        {insights.status === 'error' && insights.error.status !== 401 && (
          <ErrorState title="We couldn't load the insights." onRetry={insights.retry} />
        )}
        {insights.status === 'ready' && <Insights data={insights.data} />}
      </section>

      <section aria-labelledby="slots-heading" className="card dashboard__section">
        <h2 id="slots-heading" className="card__title">
          Your slots, next two weeks
        </h2>
        <SlotList
          api={api}
          timezone={timezone}
          version={version}
          bookings={bookings.status === 'ready' ? bookings.data.bookings : []}
          onDeleted={changed}
          onUnauthorized={onUnauthorized}
        />
      </section>
    </div>
  );
}
