import type { WaitlistStatusResponse } from '@slotbook/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, api } from '../api/client';
import { JoinWaitlistPage } from './JoinWaitlistPage';
import { WaitlistStatusPage } from './WaitlistStatusPage';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, api: { joinWaitlist: vi.fn(), waitlistStatus: vi.fn() } };
});

const TOKEN = 't'.repeat(43);
const waiting: WaitlistStatusResponse = {
  timezone: 'Europe/Berlin',
  date: '2026-11-03',
  name: 'Ada Lovelace',
  status: 'WAITING',
  createdAt: '2026-11-02T08:00:00.000Z',
  notifiedAt: null,
  availableSlots: [],
};

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

const renderAt = (path: string, state?: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/join-waitlist/:date" element={<JoinWaitlistPage />} />
        <Route path="/waitlist/:token" element={<WaitlistStatusPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Waitlist status page', () => {
  // Braces matter: a function returned from beforeEach runs as cleanup, and mockReset returns the mock.
  beforeEach(() => {
    vi.mocked(api.waitlistStatus).mockReset();
  });

  it('confirms a new entry and shows the private link once', async () => {
    vi.mocked(api.waitlistStatus).mockResolvedValue(waiting);
    renderAt(`/waitlist/${TOKEN}`, { justJoined: true });
    const heading = await screen.findByRole('heading', { name: "You're on the waitlist." });
    expect(heading).toHaveFocus();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByLabelText('Private waitlist link')).toHaveValue(`${window.location.origin}/waitlist/${TOKEN}`);
  });

  it('does not show the link again on a later visit', async () => {
    vi.mocked(api.waitlistStatus).mockResolvedValue(waiting);
    renderAt(`/waitlist/${TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'Still waiting' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Private waitlist link')).not.toBeInTheDocument();
  });

  it('says a slot opened up and links straight to booking it', async () => {
    vi.mocked(api.waitlistStatus).mockResolvedValue({
      ...waiting,
      status: 'NOTIFIED',
      notifiedAt: '2026-11-02T09:00:00.000Z',
      availableSlots: [
        {
          id: 's1',
          startsAt: '2026-11-03T09:00:00.000Z',
          endsAt: '2026-11-03T09:30:00.000Z',
          durationMinutes: 30,
          state: 'AVAILABLE',
        },
      ],
    });
    renderAt(`/waitlist/${TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'A slot opened up!' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Book 10:00 to 10:30, Tuesday 3 November/ })).toHaveAttribute(
      'href',
      '/book/s1',
    );
  });

  it('explains when the opened slot has been taken again', async () => {
    vi.mocked(api.waitlistStatus).mockResolvedValue({ ...waiting, status: 'NOTIFIED', availableSlots: [] });
    renderAt(`/waitlist/${TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'That slot has been taken again.' })).toBeInTheDocument();
  });

  it('closes once the date has passed', async () => {
    vi.mocked(api.waitlistStatus).mockResolvedValue({ ...waiting, status: 'EXPIRED' });
    renderAt(`/waitlist/${TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'This waitlist has closed.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument();
  });

  it('checks again on request', async () => {
    vi.mocked(api.waitlistStatus).mockResolvedValue(waiting);
    renderAt(`/waitlist/${TOKEN}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(api.waitlistStatus).toHaveBeenCalledTimes(2));
  });

  it('says plainly when the link matches nothing', async () => {
    vi.mocked(api.waitlistStatus).mockRejectedValue(
      new ApiRequestError(404, { statusCode: 404, code: 'NOT_FOUND', message: '' }),
    );
    renderAt(`/waitlist/${TOKEN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent("This link doesn't match a waitlist entry.");
  });
});

describe('Join the waitlist page', () => {
  beforeEach(() => {
    vi.mocked(api.joinWaitlist).mockReset();
  });

  const fillAndSubmit = async () => {
    await userEvent.type(screen.getByLabelText('Your name'), 'Ada Lovelace');
    await userEvent.type(screen.getByLabelText('Email address'), 'ada@example.com');
    const submit = screen.getByRole('button', { name: 'Join the waitlist' });
    await waitFor(() => expect(submit).toBeEnabled());
    await userEvent.click(submit);
  };

  it('joins and moves to the private status link', async () => {
    vi.mocked(api.joinWaitlist).mockResolvedValue({
      date: '2026-11-03',
      status: 'WAITING',
      statusToken: TOKEN,
      statusPath: `/waitlist/${TOKEN}`,
    });
    vi.mocked(api.waitlistStatus).mockResolvedValue(waiting);
    renderAt('/join-waitlist/2026-11-03');
    expect(screen.getByText(/Tuesday 3 November is fully booked/)).toBeInTheDocument();
    await fillAndSubmit();

    expect(api.joinWaitlist).toHaveBeenCalledWith({
      date: '2026-11-03',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(await screen.findByRole('heading', { name: "You're on the waitlist." })).toBeInTheDocument();
  });

  it('says so when this email is already waiting, and keeps the form', async () => {
    vi.mocked(api.joinWaitlist).mockRejectedValue(
      new ApiRequestError(409, { statusCode: 409, code: 'ALREADY_ON_WAITLIST', message: '' }),
    );
    renderAt('/join-waitlist/2026-11-03');
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent("You're already on the waitlist for this date.");
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
  });

  it('points to booking when a slot is free after all', async () => {
    vi.mocked(api.joinWaitlist).mockRejectedValue(
      new ApiRequestError(422, { statusCode: 422, code: 'DATE_HAS_AVAILABILITY', message: '' }),
    );
    renderAt('/join-waitlist/2026-11-03');
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Good news: a slot is free on this date.');
    expect(screen.getByRole('link', { name: 'Choose another time' })).toHaveAttribute('href', '/?week=2026-W45');
  });

  it('treats a malformed date as a page that does not exist', () => {
    renderAt('/join-waitlist/2026-02-30');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
