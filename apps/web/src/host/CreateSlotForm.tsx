import { zodResolver } from '@hookform/resolvers/zod';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiRequestError, type HostApi } from '../api/client';
import { Icon } from '../components/Icon';
import { formatDuration, formatLongDate, formatTime } from '../lib/format';
import { DURATION_OPTIONS, type SlotFormValues, slotFormSchema, startsInPast } from './slotSchema';

interface Props {
  api: HostApi;
  timezone: string;
  onCreated: (announcement: string) => void;
  onUnauthorized: () => void;
}

type FieldName = keyof SlotFormValues;

/** FR-1 from the dashboard. Checks format and "not in the past" instantly; overlaps come from the server. */
export function CreateSlotForm({ api, timezone, onCreated, onUnauthorized }: Props) {
  const today = DateTime.now().setZone(timezone).toISODate()!;
  const [added, setAdded] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SlotFormValues>({
    resolver: zodResolver(slotFormSchema),
    mode: 'onTouched',
    defaultValues: { date: today, startTime: '', durationMinutes: 30 },
  });

  const submit = handleSubmit(async (values) => {
    setAdded(null);
    setFormError(null);
    if (startsInPast(values, timezone)) {
      setError('startTime', { message: 'This time has already passed' }, { shouldFocus: true });
      return;
    }
    try {
      const slot = await api.createSlot(values);
      const label = `${formatLongDate(slot.startsAt, timezone)}, ${formatTime(slot.startsAt, timezone)} – ${formatTime(slot.endsAt, timezone)}`;
      setAdded(label);
      setValue('startTime', '');
      onCreated(`Slot added: ${label}`);
    } catch (err) {
      const e = err instanceof ApiRequestError ? err : new ApiRequestError(0, null);
      if (e.status === 401) return onUnauthorized();
      if (e.code === 'SLOT_OVERLAP') {
        setError('startTime', { message: 'This overlaps a slot you already have' }, { shouldFocus: true });
      } else if (e.code === 'SLOT_IN_PAST') {
        setError('startTime', { message: 'This time has already passed' }, { shouldFocus: true });
      } else if (e.code === 'VALIDATION_ERROR' && Array.isArray(e.body?.details)) {
        for (const d of e.body.details as { field: string; messages: string[] }[]) {
          if (d.field in slotFormSchema.shape) setError(d.field as FieldName, { message: d.messages[0] });
        }
      } else {
        setFormError(e.status === 0 ? "We couldn't reach the server. Try again." : 'Something went wrong. Try again.');
      }
    }
  });

  const describedBy = (name: FieldName) => (errors[name] ? `slot-${name}-error` : undefined);
  const errorText = (name: FieldName) =>
    errors[name] && (
      <p id={`slot-${name}-error`} className="field__error">
        <Icon name="alert" size={14} />
        {errors[name]?.message}
      </p>
    );

  return (
    <form className="form form--compact" onSubmit={submit} noValidate>
      <div className="form__row">
        <div className="field">
          <label htmlFor="slot-date" className="field__label">
            Date
          </label>
          <input
            id="slot-date"
            type="date"
            className="field__input"
            min={today}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={describedBy('date')}
            {...register('date')}
          />
          {errorText('date')}
        </div>
        <div className="field">
          <label htmlFor="slot-startTime" className="field__label">
            Start time
          </label>
          <input
            id="slot-startTime"
            type="time"
            step={900}
            className="field__input"
            aria-invalid={errors.startTime ? true : undefined}
            aria-describedby={describedBy('startTime')}
            {...register('startTime')}
          />
          {errorText('startTime')}
        </div>
      </div>
      <div className="field">
        <label htmlFor="slot-durationMinutes" className="field__label">
          Length
        </label>
        <select
          id="slot-durationMinutes"
          className="field__input"
          aria-invalid={errors.durationMinutes ? true : undefined}
          aria-describedby={describedBy('durationMinutes')}
          {...register('durationMinutes', { valueAsNumber: true })}
        >
          {DURATION_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {formatDuration(m)}
            </option>
          ))}
        </select>
        {errorText('durationMinutes')}
      </div>

      {formError && (
        <p className="field__error" role="alert">
          <Icon name="alert" size={14} />
          {formError}
        </p>
      )}
      {added && (
        <p className="form__success" role="status">
          <Icon name="check" size={16} />
          Added {added}.
        </p>
      )}

      <button type="submit" className="button button--primary" disabled={isSubmitting}>
        {isSubmitting ? 'Adding…' : 'Add slot'}
      </button>
    </form>
  );
}
