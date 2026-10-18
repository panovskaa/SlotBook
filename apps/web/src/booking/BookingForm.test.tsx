import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { BookingForm, problemFromApiError } from './BookingForm';

const renderForm = (onSubmit = vi.fn().mockResolvedValue(null)) => {
  render(
    <MemoryRouter>
      <BookingForm onSubmit={onSubmit} backTo="/?week=2026-W45" />
    </MemoryRouter>,
  );
  return {
    onSubmit,
    name: screen.getByLabelText('Your name'),
    email: screen.getByLabelText('Email address'),
    submit: screen.getByRole('button', { name: 'Book this time' }),
  };
};

describe('BookingForm', () => {
  it('keeps submit disabled until the form is valid', async () => {
    const { name, email, submit } = renderForm();
    expect(submit).toBeDisabled();
    await userEvent.type(name, 'Ada Lovelace');
    await userEvent.type(email, 'ada@example');
    expect(submit).toBeDisabled();
    await userEvent.type(email, '.com');
    await waitFor(() => expect(submit).toBeEnabled());
  });

  it('shows an inline message tied to the field once you leave it', async () => {
    const { name, email } = renderForm();
    await userEvent.type(name, 'A');
    await userEvent.click(email);

    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Your name needs at least 2 characters');
    expect(email).not.toHaveAttribute('aria-invalid');
  });

  it('sends trimmed values', async () => {
    const { onSubmit, name, email, submit } = renderForm();
    await userEvent.type(name, '  Ada  ');
    await userEvent.type(email, ' Ada@Example.com ');
    await waitFor(() => expect(submit).toBeEnabled());
    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada', email: 'ada@example.com' });
  });

  it('replaces the form with a message and a way back when the slot is taken', async () => {
    const onSubmit = vi.fn().mockResolvedValue(problemFromApiError(409, { statusCode: 409, code: 'SLOT_ALREADY_BOOKED', message: '' }));
    const { name, email, submit } = renderForm(onSubmit);
    await userEvent.type(name, 'Ada');
    await userEvent.type(email, 'ada@example.com');
    await waitFor(() => expect(submit).toBeEnabled());
    await userEvent.click(submit);

    expect(await screen.findByRole('alert')).toHaveTextContent('Someone has just booked this time.');
    expect(screen.getByRole('link', { name: 'Choose another time' })).toHaveAttribute('href', '/?week=2026-W45');
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
  });

  it('puts server field errors on the matching field', async () => {
    const onSubmit = vi.fn().mockResolvedValue(
      problemFromApiError(400, {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Some fields are invalid',
        details: [{ field: 'email', messages: ['email must be a valid email address'] }],
      }),
    );
    const { name, email, submit } = renderForm(onSubmit);
    await userEvent.type(name, 'Ada');
    await userEvent.type(email, 'ada@example.com');
    await waitFor(() => expect(submit).toBeEnabled());
    await userEvent.click(submit);

    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
    expect(email).toHaveAccessibleDescription('email must be a valid email address');
  });
});

describe('problemFromApiError', () => {
  it.each([
    [409, 'SLOT_ALREADY_BOOKED', 'Someone has just booked this time.', true],
    [422, 'BOOKING_CUTOFF', 'Booking for this time has closed.', true],
    [404, 'NOT_FOUND', 'This time is no longer available.', true],
  ] as const)('maps %p %p to a final message', (status, code, title, final) => {
    expect(problemFromApiError(status, { statusCode: status, code, message: '' })).toMatchObject({ title, final });
  });

  it('explains network failures and rate limits without hiding the form', () => {
    const offline = problemFromApiError(0, null);
    expect(offline.title).toBe("We couldn't reach the server.");
    expect(offline.final).toBeFalsy();
    expect(problemFromApiError(429, null).title).toBe('Too many attempts.');
  });
});
