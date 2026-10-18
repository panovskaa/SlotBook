import type { InsightsResponse, IsoWeekday } from '@slotbook/shared';
import { Fragment, useState } from 'react';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const dayName = (d: IsoWeekday) => WEEKDAYS[d - 1];
const shortDay = (d: IsoWeekday) => dayName(d).slice(0, 3);
const pad = (h: number) => String(h).padStart(2, '0');

/**
 * Sequential scale for magnitude: one blue hue, light to dark (dataviz reference ramp, steps
 * 150/300/450/600). Zero stays on the surface colour, so empty hours recede.
 */
const STEPS = ['#b7d3f6', '#6da7ec', '#2a78d6', '#184f95'];
function cellColor(count: number, max: number): string | undefined {
  if (count === 0 || max === 0) return undefined;
  return STEPS[Math.min(STEPS.length - 1, Math.ceil((count / max) * STEPS.length) - 1)];
}

/** FR-10: when people book, which times are most popular, and how full each weekday gets. */
export function Insights({ data }: { data: InsightsResponse }) {
  if (data.totalBookings === 0 && data.weekdayRates.every((r) => r.published === 0)) {
    return <p className="card__empty">No bookings yet. Insights appear here once people start booking.</p>;
  }
  return (
    <div className="insights">
      <Heatmap data={data} />
      <div className="insights__columns">
        <TopSlots data={data} />
        <WeekdayRates data={data} />
      </div>
    </div>
  );
}

function Heatmap({ data }: { data: InsightsResponse }) {
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<{ weekday: IsoWeekday; hour: number; x: number; y: number } | null>(null);

  const from = data.hourRange?.from ?? 8;
  const to = data.hourRange?.to ?? 18;
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const counts = new Map(data.heatmap.map((c) => [`${c.weekday}-${c.hour}`, c.bookings]));
  const countAt = (weekday: IsoWeekday, hour: number) => counts.get(`${weekday}-${hour}`) ?? 0;
  const max = Math.max(0, ...data.heatmap.map((c) => c.bookings));
  const days = [1, 2, 3, 4, 5, 6, 7] as IsoWeekday[];

  return (
    <section className="insights__block" aria-labelledby="heatmap-heading">
      <div className="insights__head">
        <h3 id="heatmap-heading" className="insights__title">
          When people book
        </h3>
        <button
          type="button"
          className="button button--secondary button--small"
          aria-pressed={showTable}
          onClick={() => setShowTable((s) => !s)}
        >
          {showTable ? 'Show heatmap' : 'Show as table'}
        </button>
      </div>
      <p className="insights__note">
        Bookings by weekday and start hour, all time, in {data.timezone.replace('_', ' ')}.
      </p>

      {/* The picture is for sighted readers; the table below carries the same numbers for everyone. */}
      {!showTable && (
        <div className="heatmap-wrap" aria-hidden="true" onMouseLeave={() => setHover(null)}>
          <div className="heatmap" style={{ gridTemplateColumns: `40px repeat(${hours.length}, minmax(22px, 1fr))` }}>
            <span />
            {hours.map((h) => (
              <span key={h} className="heatmap__hour">
                {h % 2 === from % 2 ? pad(h) : ''}
              </span>
            ))}
            {days.map((d) => (
              <Fragment key={d}>
                <span className="heatmap__day">{shortDay(d)}</span>
                {hours.map((h) => {
                  const count = countAt(d, h);
                  return (
                    <span
                      key={h}
                      className={`heatmap__cell${count ? '' : ' heatmap__cell--empty'}`}
                      style={{ background: cellColor(count, max) }}
                      onMouseEnter={(e) => {
                        const box = e.currentTarget.getBoundingClientRect();
                        const wrap = e.currentTarget.closest('.heatmap-wrap')!.getBoundingClientRect();
                        setHover({ weekday: d, hour: h, x: box.left - wrap.left + box.width / 2, y: box.top - wrap.top });
                      }}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
          {hover && (
            <div className="heatmap__tooltip" style={{ left: hover.x, top: hover.y }}>
              <strong>
                {dayName(hover.weekday)} {pad(hover.hour)}:00–{pad((hover.hour + 1) % 24)}:00
              </strong>
              <span>
                {countAt(hover.weekday, hover.hour)} booking{countAt(hover.weekday, hover.hour) === 1 ? '' : 's'}
              </span>
            </div>
          )}
          <div className="heatmap__legend">
            <span>Fewer</span>
            <span className="heatmap__swatch heatmap__cell--empty" />
            {STEPS.map((c) => (
              <span key={c} className="heatmap__swatch" style={{ background: c }} />
            ))}
            <span>More</span>
            {max > 0 && <span className="heatmap__max">Darkest: {max} booking{max === 1 ? '' : 's'}</span>}
          </div>
        </div>
      )}

      <div className={showTable ? 'table-wrap' : 'visually-hidden'}>
        <table className="data-table">
          <caption className="visually-hidden">Bookings by weekday and start hour</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              {hours.map((h) => (
                <th key={h} scope="col">
                  {pad(h)}:00
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d}>
                <th scope="row">{dayName(d)}</th>
                {hours.map((h) => (
                  <td key={h}>{countAt(d, h)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


function TopSlots({ data }: { data: InsightsResponse }) {
  return (
    <section className="insights__block" aria-labelledby="top-heading">
      <h3 id="top-heading" className="insights__title">
        Most-booked times
      </h3>
      {data.topSlots.length === 0 ? (
        <p className="card__empty">No bookings yet.</p>
      ) : (
        <ol className="top-slots">
          {data.topSlots.map((s, i) => (
            <li key={`${s.weekday}-${s.time}`} className="top-slots__item">
              <span className="top-slots__rank" aria-hidden="true">
                {i + 1}
              </span>
              <span className="top-slots__when">
                {dayName(s.weekday)} {s.time}
              </span>
              <span className="top-slots__count">
                {s.bookings} booking{s.bookings === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function WeekdayRates({ data }: { data: InsightsResponse }) {
  return (
    <section className="insights__block" aria-labelledby="rates-heading">
      <h3 id="rates-heading" className="insights__title">
        Booking rate by weekday
      </h3>
      <ul className="rates">
        {data.weekdayRates.map((r) => (
          <li key={r.weekday} className="rates__row">
            <span className="rates__day">{shortDay(r.weekday)}</span>
            <span className="rates__track" aria-hidden="true">
              {r.rate !== null && r.rate > 0 && <span className="rates__bar" style={{ width: `${Math.round(r.rate * 100)}%` }} />}
            </span>
            <span className="rates__value">
              <span className="visually-hidden">{dayName(r.weekday)}: </span>
              {r.rate === null ? (
                'No slots'
              ) : (
                <>
                  <strong>{Math.round(r.rate * 100)}%</strong> · {r.booked} of {r.published}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
