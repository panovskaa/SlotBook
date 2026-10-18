import type { BookingRate, HostStatsResponse } from '@slotbook/shared';

const percent = (r: BookingRate) => (r.rate === null ? '—' : `${Math.round(r.rate * 100)}%`);
const ofSlots = (r: BookingRate) =>
  r.published === 0 ? 'No slots yet' : `${r.booked} of ${r.published} slot${r.published === 1 ? '' : 's'} booked`;

export function StatTiles({ stats }: { stats: HostStatsResponse }) {
  const { last30Days, allTime } = stats.bookingRate;
  return (
    <dl className="tiles">
      <div className="tile">
        <dt className="tile__label">Published slots</dt>
        <dd className="tile__value">{stats.totalPublished}</dd>
        <dd className="tile__note">Past and upcoming</dd>
      </div>
      <div className="tile">
        <dt className="tile__label">Upcoming bookings</dt>
        <dd className="tile__value">{stats.upcomingBookings}</dd>
        <dd className="tile__note">Not started yet</dd>
      </div>
      <div className="tile">
        <dt className="tile__label">Open slots</dt>
        <dd className="tile__value">{stats.remainingAvailable}</dd>
        <dd className="tile__note">Bookable right now</dd>
      </div>
      <div className="tile">
        <dt className="tile__label">Booking rate, last 30 days</dt>
        <dd className="tile__value">{percent(last30Days)}</dd>
        <dd className="tile__note">
          {ofSlots(last30Days)}
          <br />
          All time: {percent(allTime)} ({ofSlots(allTime).toLowerCase()})
        </dd>
      </div>
    </dl>
  );
}
