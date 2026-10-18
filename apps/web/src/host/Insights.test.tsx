import type { InsightsResponse } from '@slotbook/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Insights } from './Insights';

const data: InsightsResponse = {
  timezone: 'Europe/Berlin',
  totalBookings: 6,
  hourRange: { from: 9, to: 15 },
  heatmap: [
    { weekday: 1, hour: 10, bookings: 3 },
    { weekday: 2, hour: 10, bookings: 1 },
    { weekday: 4, hour: 14, bookings: 2 },
  ],
  topSlots: [
    { weekday: 1, time: '10:00', bookings: 3 },
    { weekday: 4, time: '14:30', bookings: 2 },
    { weekday: 2, time: '10:00', bookings: 1 },
  ],
  weekdayRates: [
    { weekday: 1, booked: 3, published: 4, rate: 0.75 },
    { weekday: 2, booked: 1, published: 4, rate: 0.25 },
    { weekday: 3, booked: 0, published: 2, rate: 0 },
    { weekday: 4, booked: 2, published: 2, rate: 1 },
    { weekday: 5, booked: 0, published: 0, rate: null },
    { weekday: 6, booked: 0, published: 0, rate: null },
    { weekday: 7, booked: 0, published: 0, rate: null },
  ],
};

describe('Insights', () => {
  it('always has a data table with the same numbers as the heatmap', () => {
    render(<Insights data={data} />);
    const table = screen.getByRole('table', { name: 'Bookings by weekday and start hour' });
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Day', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00']);

    const monday = within(table).getByRole('row', { name: /Monday/ });
    expect(within(monday).getAllByRole('cell').map((c) => c.textContent)).toEqual(['0', '3', '0', '0', '0', '0', '0']);
    const thursday = within(table).getByRole('row', { name: /Thursday/ });
    expect(within(thursday).getAllByRole('cell')[5]).toHaveTextContent('2');
    expect(within(table).getAllByRole('row')).toHaveLength(8);
  });

  it('hides the heatmap picture from screen readers, since the table carries the numbers', () => {
    const { container } = render(<Insights data={data} />);
    expect(container.querySelector('.heatmap-wrap')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shades busier hours darker and leaves empty hours on the surface', () => {
    const { container } = render(<Insights data={data} />);
    const cells = [...container.querySelectorAll<HTMLElement>('.heatmap__cell')];
    const monday10 = cells[1]; // Monday row, hours 9–15: index 1 is 10:00
    expect(monday10.style.background).not.toBe('');
    expect(cells[0]).toHaveClass('heatmap__cell--empty');
    expect(screen.getByText('Darkest: 3 bookings')).toBeInTheDocument();
  });

  it('can show the table on screen instead of the heatmap', async () => {
    const { container } = render(<Insights data={data} />);
    const toggle = screen.getByRole('button', { name: 'Show as table' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Show heatmap' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('.heatmap-wrap')).toBeNull();
    expect(container.querySelector('.table-wrap')).toContainElement(screen.getByRole('table'));
  });

  it('lists the three most-booked times in order', () => {
    render(<Insights data={data} />);
    const items = within(screen.getByRole('region', { name: 'Most-booked times' })).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual([
      '1Monday 10:003 bookings',
      '2Thursday 14:302 bookings',
      '3Tuesday 10:001 booking',
    ]);
  });

  it('gives each weekday its rate in words, and "No slots" instead of 0 % when nothing was published', () => {
    render(<Insights data={data} />);
    const rates = within(screen.getByRole('region', { name: 'Booking rate by weekday' })).getAllByRole('listitem');
    expect(rates).toHaveLength(7);
    expect(rates[0]).toHaveTextContent('Monday: 75% · 3 of 4');
    expect(rates[2]).toHaveTextContent('Wednesday: 0% · 0 of 2');
    expect(rates[4]).toHaveTextContent('Friday: No slots');
  });

  it('shows an empty state before anything is published', () => {
    render(
      <Insights
        data={{
          ...data,
          totalBookings: 0,
          hourRange: null,
          heatmap: [],
          topSlots: [],
          weekdayRates: data.weekdayRates.map((r) => ({ ...r, booked: 0, published: 0, rate: null })),
        }}
      />,
    );
    expect(screen.getByText('No bookings yet. Insights appear here once people start booking.')).toBeInTheDocument();
  });
});
