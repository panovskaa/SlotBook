import type { ManageBookingResponse } from '@slotbook/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, api } from '../api/client';
import { ManagePage } from './ManagePage';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, api: { manage: vi.fn(), cancel: vi.fn() } };
});

const TOKEN = 'a'.repeat(43);
const booking: ManageBookingResponse = {
  timezone: 'Europe/Berlin',
  reference: 'K7M2-QX9P',
  status: 'CONFIRMED',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  slot: { startsAt: '2026-11-03T09:00:00.000Z', endsAt: '2026-11-03T09:30:00.000Z' },
  canCancel: true,
  cancelledAt: null,
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/manage/${TOKEN}`]}>
      <Routes>
        <Route path="/manage/:token" element={<ManagePage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ManagePage', () => {
  beforeEach(() => {
    vi.mocked(api.manage).mockReset().mockResolvedValue(booking);
    vi.mocked(api.cancel).mockReset();
  });

  it('shows the booking with its status in words', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Your booking' })).toBeInTheDocument();
    expect(screen.getByText('Tuesday 3 November at 10:00 – 10:30')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('K7M2-QX9P')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(api.manage).toHaveBeenCalledWith(TOKEN, expect.any(AbortSignal));
  });

  it('asks for confirmation before cancelling, and can back out', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }));

    const question = screen.getByText('Cancel your booking for Tuesday 3 November at 10:00?');
    expect(question).toHaveFocus();
    expect(api.cancel).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Keep booking' }));
    expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeInTheDocument();
  });

  it('cancels, then shows the result and the cancelled status', async () => {
    vi.mocked(api.cancel).mockResolvedValue({
      ...booking,
      status: 'CANCELLED',
      canCancel: false,
      cancelledAt: '2026-11-02T08:00:00.000Z',
      alreadyCancelled: false,
      message: 'Your booking is cancelled.',
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel booking' }));

    expect(api.cancel).toHaveBeenCalledWith(TOKEN);
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Your booking is cancelled.');
    expect(status).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'This booking is cancelled.' })).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Book another time' })).toHaveAttribute('href', '/');
  });

  it('explains the cutoff when the server says it has passed', async () => {
    vi.mocked(api.cancel).mockRejectedValue(
      new ApiRequestError(422, {
        statusCode: 422,
        code: 'CANCELLATION_CUTOFF',
        message: 'Cancellation closes 1 hour before start',
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel booking' }));

    expect(await screen.findByText('Cancellation closes 1 hour before start.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('keeps the confirm step open with a message when the network fails', async () => {
    vi.mocked(api.cancel).mockRejectedValue(new ApiRequestError(0, null));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel booking' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't reach the server.");
    expect(screen.getByRole('button', { name: 'Yes, cancel booking' })).toBeEnabled();
  });

  it('shows no cancel button once inside the cutoff', async () => {
    vi.mocked(api.manage).mockResolvedValue({ ...booking, canCancel: false });
    renderPage();
    expect(await screen.findByText('Cancellation closes 1 hour before start.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument();
  });

  it('says plainly when the link matches nothing', async () => {
    vi.mocked(api.manage).mockRejectedValue(
      new ApiRequestError(404, { statusCode: 404, code: 'NOT_FOUND', message: '' }),
    );
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent("This link doesn't match a booking.");
  });
});
