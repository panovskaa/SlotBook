import type { SlotDto } from '@slotbook/shared';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { weekDates } from '../lib/week';
import { WeekCalendar } from './WeekCalendar';

const TZ = 'Europe/Berlin';
const dates = weekDates({ year: 2026, week: 45 }); // Mon 2 – Sun 8 Nov 2026

const slot = (id: string, startsAt: string, state: SlotDto['state']): SlotDto => ({
  id,
  startsAt,
  endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
  durationMinutes: 30,
  state,
});

const renderWeek = (slots: SlotDto[]) =>
  render(
    <MemoryRouter>
      <WeekCalendar dates={dates} slots={slots} timezone={TZ} today="2026-11-03" />
    </MemoryRouter>,
  );

describe('WeekCalendar', () => {
  it('shows each state with its own text label, not just a colour', () => {
    renderWeek([
      slot('a', '2026-11-03T09:00:00Z', 'AVAILABLE'),
      slot('b', '2026-11-03T10:00:00Z', 'BOOKED'),
      slot('c', '2026-11-03T11:00:00Z', 'UNAVAILABLE'),
    ]);
    const tuesday = screen.getByRole('region', { name: /Tuesday 3 November/ });
    expect(within(tuesday).getByText('Available')).toBeInTheDocument();
    expect(within(tuesday).getByText('Booked')).toBeInTheDocument();
    expect(within(tuesday).getByText('Closed')).toBeInTheDocument();
  });

  it('makes only available slots links to the booking form', () => {
    renderWeek([slot('a', '2026-11-03T09:00:00Z', 'AVAILABLE'), slot('b', '2026-11-03T10:00:00Z', 'BOOKED')]);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/book/a');
    expect(links[0]).toHaveAccessibleName(/Book 10:00 to 10:30, Tuesday 3 November, 30 min Available/);
  });

  it('shows times in the app time zone and on the right day', () => {
    // 23:30 UTC on Sunday 1 Nov is 00:30 on Monday 2 Nov in Berlin.
    renderWeek([slot('a', '2026-11-01T23:30:00Z', 'AVAILABLE')]);
    const monday = screen.getByRole('region', { name: /Monday 2 November/ });
    expect(within(monday).getByText('00:30')).toBeInTheDocument();
  });

  it('shows all seven days, marks today, and says when a day has no times', () => {
    renderWeek([slot('a', '2026-11-03T09:00:00Z', 'AVAILABLE')]);
    expect(screen.getAllByRole('region')).toHaveLength(7);
    expect(screen.getByRole('region', { name: /Tuesday 3 November, today/ })).toBeInTheDocument();
    expect(screen.getAllByText('No times')).toHaveLength(6);
  });

  it('offers the waitlist on a day where every slot is taken (FR-9)', () => {
    renderWeek([slot('a', '2026-11-04T09:00:00Z', 'BOOKED'), slot('b', '2026-11-04T10:00:00Z', 'UNAVAILABLE')]);
    const wednesday = screen.getByRole('region', { name: /Wednesday 4 November/ });
    expect(within(wednesday).getByText('Fully booked')).toBeInTheDocument();
    expect(within(wednesday).getByRole('link', { name: 'Join the waitlist for Wednesday 4 November' })).toHaveAttribute(
      'href',
      '/join-waitlist/2026-11-04',
    );
  });

  it('does not offer the waitlist on a day with a free slot, an empty day, or a past day', () => {
    renderWeek([
      slot('a', '2026-11-04T09:00:00Z', 'BOOKED'),
      slot('b', '2026-11-04T10:00:00Z', 'AVAILABLE'),
      slot('c', '2026-11-02T09:00:00Z', 'BOOKED'), // Monday, before "today"
    ]);
    expect(screen.queryByText('Fully booked')).not.toBeInTheDocument();
  });

  it('hides the decorative icons from screen readers', () => {
    const { container } = renderWeek([slot('a', '2026-11-03T09:00:00Z', 'AVAILABLE')]);
    for (const svg of container.querySelectorAll('svg')) expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});
