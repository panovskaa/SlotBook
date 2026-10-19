import { zodResolver } from '@hookform/resolvers/zod';
import type { ApiError } from '@slotbook/shared';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { SmoothInput } from '../components/ui/skiper-ui/skiper106';
import { type BookingFormInput, type BookingFormValues, bookingFormSchema } from './schema';

export interface SubmitProblem {
  title: string;
  body?: string;
  /** The slot can no longer be booked, so hide the form. */
  final?: boolean;
  fieldErrors?: Partial<Record<keyof BookingFormValues, string>>;
}

interface Props {
  onSubmit: (values: BookingFormValues) => Promise<SubmitProblem | null>;
  /** Where "Choose another time" goes when the slot can't be booked any more. */
  backTo: string;
  /** The same name-and-email form also joins the waitlist (FR-9); these change its wording. */
  submitLabel?: string;
  submittingLabel?: string;
  hint?: string;
}

/**
 * Name and email, checked as you go (NFR-3): inline messages tied to each field with
 * aria-describedby, aria-invalid on the field, and submit disabled until the form is valid.
 */
export function BookingForm({
  onSubmit,
  backTo,
  submitLabel = 'Book this time',
  submittingLabel = 'Booking…',
  hint = 'We only use your email for this booking.',
}: Props) {
  const id = useId();
  const [problem, setProblem] = useState<SubmitProblem | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid, isSubmitting },
  } = useForm<BookingFormInput, unknown, BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    mode: 'onTouched',
    defaultValues: { name: '', email: '' },
  });

  const submit = handleSubmit(async (values) => {
    setProblem(null);
    const result = await onSubmit(values);
    if (!result) return;
    for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
      setError(field as keyof BookingFormValues, { message }, { shouldFocus: true });
    }
    setProblem(result);
  });

  if (problem?.final) {
    return (
      <div className="notice notice--error" role="alert">
        <Icon name="alert" />
        <div>
          <p className="notice__title">{problem.title}</p>
          {problem.body && <p className="notice__body">{problem.body}</p>}
          <Link to={backTo} className="button button--secondary button--small notice__action">
            Choose another time
          </Link>
        </div>
      </div>
    );
  }

  const field = (
    name: keyof BookingFormValues,
    label: string,
    props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { type?: 'text' | 'email' },
  ) => {
    const inputId = `${id}-${name}`;
    const errorId = `${inputId}-error`;
    const error = errors[name]?.message;
    return (
      <div className="field">
        <label htmlFor={inputId} className="field__label">
          {label}
        </label>
        {/* Skiper UI smooth input: the caret glides as you type (the label and error stay wired to it). */}
        <SmoothInput
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...props}
          {...register(name)}
        />
        {error && (
          <p id={errorId} className="field__error">
            <Icon name="alert" size={14} />
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      {field('name', 'Your name', { autoComplete: 'name', maxLength: 120 })}
      {field('email', 'Email address', { type: 'email', autoComplete: 'email', spellCheck: false })}

      {problem && (
        <div className="notice notice--error" role="alert">
          <Icon name="alert" />
          <div>
            <p className="notice__title">{problem.title}</p>
            {problem.body && <p className="notice__body">{problem.body}</p>}
          </div>
        </div>
      )}

      <button type="submit" className="button button--primary button--large" disabled={!isValid || isSubmitting}>
        {isSubmitting ? (
          <>
            <span className="spinner spinner--on-accent" aria-hidden="true" /> {submittingLabel}
          </>
        ) : (
          submitLabel
        )}
      </button>
      <p className="visually-hidden" aria-live="polite">
        {isSubmitting ? submittingLabel : ''}
      </p>
      <p className="form__hint">{hint}</p>
    </form>
  );
}

/** Turns an API error from POST /bookings into what the form should show. */
export function problemFromApiError(status: number, body: ApiError | null): SubmitProblem {
  switch (body?.code) {
    case 'SLOT_ALREADY_BOOKED':
      return { title: 'Someone has just booked this time.', final: true };
    case 'BOOKING_CUTOFF':
      return {
        title: 'Booking for this time has closed.',
        body: 'Booking closes 30 minutes before start.',
        final: true,
      };
    case 'NOT_FOUND':
      return { title: 'This time is no longer available.', final: true };
    case 'VALIDATION_ERROR': {
      const details = Array.isArray(body.details) ? (body.details as { field: string; messages: string[] }[]) : [];
      const fieldErrors: SubmitProblem['fieldErrors'] = {};
      for (const d of details) if (d.field === 'name' || d.field === 'email') fieldErrors[d.field] = d.messages[0];
      return { title: 'Please check the highlighted fields.', fieldErrors };
    }
  }
  if (status === 0) return { title: "We couldn't reach the server.", body: 'Check your connection and try again.' };
  if (status === 429) return { title: 'Too many attempts.', body: 'Please wait a minute and try again.' };
  return { title: 'Something went wrong.', body: 'Please try again in a moment.' };
}
