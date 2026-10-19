import type { HostBookingsResponse, HostStatsResponse, SlotsResponse } from '@slotbook/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, type HostApi, api as publicApi } from '../api/client';
import { Dashboard } from './Dashboard';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, api: { ...actual.api, slots: vi.fn() } };
});

const TZ = 'Europe/Berlin';

const emptyStats: HostStatsResponse = {
  timezone: TZ,
  totalPublished: 0,
  upcomingBookings: 0,
  remainingAvailable: 0,
  bookingRate: {
    last30Days: { booked: 0, published: 0, rate: null },
    allTime: { booked: 0, published: 0, rate: null },
  },
};

const stats: HostStatsResponse = {
  timezone: TZ,
  totalPublished: 13,
  upcomingBookings: 2,
  remainingAvailable: 3,
  bookingRate: {
    last30Days: { booked: 2, published: 4, rate: 0.5 },
    allTime: { booked: 6, published: 13, rate: 6 / 13 },
  },
};

const bookings: HostBookingsResponse = {
  timezone: TZ,
  bookings: [
    {
      id: 'b1',
      reference: 'K7M2-QX9P',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      slotId: 's-booked',
      slot: { startsAt: '2030-01-08T09:00:00.000Z', endsAt: '2030-01-08T09:30:00.000Z' },
      createdAt: '2030-01-01T09:00:00.000Z',
    },
  ],
};

const slots: SlotsResponse = {
  timezone: TZ,
  slots: [
    { id: 's-open', startsAt: '2030-01-08T08:00:00.000Z', endsAt: '2030-01-08T08:30:00.000Z', durationMinutes: 30, state: 'AVAILABLE' },
    { id: 's-booked', startsAt: '2030-01-08T09:00:00.000Z', endsAt: '2030-01-08T09:30:00.000Z', durationMinutes: 30, state: 'BOOKED' },
  ],
  openedUp: [],
};

function makeApi(overrides: Partial<Record<keyof HostApi, unknown>> = {}): HostApi {
  return {
    stats: vi.fn().mockResolvedValue(stats),
    bookings: vi.fn().mockResolvedValue(bookings),
    insights: vi.fn().mockResolvedValue({
      timezone: TZ,
      totalBookings: 0,
      hourRange: null,
      heatmap: [],
      topSlots: [],
      weekdayRates: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, booked: 0, published: 0, rate: null })),
    }),
    createSlot: vi.fn(),
    deleteSlot: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as HostApi;
}

const renderDashboard = (api: HostApi, onUnauthorized = vi.fn()) => {
  render(
    <MemoryRouter>
      <Dashboard api={api} onLock={vi.fn()} onUnauthorized={onUnauthorized} />
    </MemoryRouter>,
  );
  return { onUnauthorized };
};

describe('Dashboard', () => {
  beforeEach(() => {
    vi.mocked(publicApi.slots).mockReset().mockResolvedValue(slots);
  });

  it('shows loading states while the data is on its way', () => {
    const never = () => new Promise<never>(() => {});
    vi.mocked(publicApi.slots).mockImplementation(never);
    renderDashboard(makeApi({ stats: vi.fn(never), bookings: vi.fn(never) }));
    expect(screen.getByText('Loading numbers…')).toBeInTheDocument();
    expect(screen.getByText('Loading bookings…')).toBeInTheDocument();
    expect(screen.getByText('Loading slots…')).toBeInTheDocument();
  });

  it('shows empty states, and no rate rather than 0 %', async () => {
    vi.mocked(publicApi.slots).mockResolvedValue({ timezone: TZ, slots: [], openedUp: [] });
    renderDashboard(makeApi({ stats: vi.fn().mockResolvedValue(emptyStats), bookings: vi.fn().mockResolvedValue({ timezone: TZ, bookings: [] }) }));

    expect(await screen.findByText('No upcoming bookings yet. They\'ll appear here as people book.')).toBeInTheDocument();
    expect(await screen.findByText('No slots in the next two weeks. Add one above.')).toBeInTheDocument();
    const rate = screen.getByText('Booking rate, last 30 days').parentElement!;
    expect(within(rate).getByText('—')).toBeInTheDocument();
    expect(within(rate).getByText(/No slots yet/)).toBeInTheDocument();
  });

  it('shows the numbers, the bookings and the slots once loaded', async () => {
    renderDashboard(makeApi());

    const published = (await screen.findByText('Published slots')).parentElement!;
    expect(within(published).getByText('13')).toBeInTheDocument();
    const rate = screen.getByText('Booking rate, last 30 days').parentElement!;
    expect(within(rate).getByText('50%')).toBeInTheDocument();
    expect(within(rate).getByText(/2 of 4 slots booked/)).toBeInTheDocument();
    expect(within(rate).getByText(/All time: 46%/)).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'ada@example.com' })).toHaveAttribute('href', 'mailto:ada@example.com');
    const day = await screen.findByRole('region', { name: 'Tuesday 8 January' });
    expect(within(day).getByText('Open')).toBeInTheDocument();
    expect(within(day).getByText('Booked')).toBeInTheDocument();
    expect(within(day).getByText('· Ada Lovelace')).toBeInTheDocument();
  });

  it('offers delete only for free slots, and asks before deleting', async () => {
    const api = makeApi();
    renderDashboard(api);
    const deleteButtons = await screen.findAllByRole('button', { name: /^Delete / });
    expect(deleteButtons).toHaveLength(1);
    expect(deleteButtons[0]).toHaveAccessibleName('Delete 09:00 – 09:30 on Tuesday 8 January');

    await userEvent.click(deleteButtons[0]);
    expect(api.deleteSlot).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete 09:00 – 09:30 now' }));

    expect(api.deleteSlot).toHaveBeenCalledWith('s-open');
    // Everything reloads after the change.
    await waitFor(() => expect(api.stats).toHaveBeenCalledTimes(2));
  });

  it('explains when a slot was booked just before deleting', async () => {
    const api = makeApi({
      deleteSlot: vi.fn().mockRejectedValue(new ApiRequestError(409, { statusCode: 409, code: 'SLOT_ALREADY_BOOKED', message: '' })),
    });
    renderDashboard(api);
    await userEvent.click((await screen.findAllByRole('button', { name: /^Delete / }))[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete 09:00 – 09:30 now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone has just booked this slot');
  });

  it('goes back to the key screen when the key stops working', async () => {
    const { onUnauthorized } = renderDashboard(
      makeApi({ stats: vi.fn().mockRejectedValue(new ApiRequestError(401, { statusCode: 401, code: 'UNAUTHORIZED', message: '' })) }),
    );
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });

  it('maps an overlap from the server onto the start time field', async () => {
    const api = makeApi({
      createSlot: vi.fn().mockRejectedValue(new ApiRequestError(409, { statusCode: 409, code: 'SLOT_OVERLAP', message: '' })),
    });
    renderDashboard(api);
    await userEvent.clear(await screen.findByLabelText('Date'));
    await userEvent.type(screen.getByLabelText('Date'), '2030-01-08');
    await userEvent.type(screen.getByLabelText('Start time'), '09:00');
    await userEvent.click(screen.getByRole('button', { name: 'Add slot' }));

    const time = screen.getByLabelText('Start time');
    await waitFor(() => expect(time).toHaveAttribute('aria-invalid', 'true'));
    expect(time).toHaveAccessibleDescription('This overlaps a slot you already have');
    expect(api.createSlot).toHaveBeenCalledWith({ date: '2030-01-08', startTime: '09:00', durationMinutes: 30 });
  });
});
