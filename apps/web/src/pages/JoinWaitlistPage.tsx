import { isValidDate } from '@slotbook/shared';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiRequestError, api } from '../api/client';
import { BookingForm, type SubmitProblem } from '../booking/BookingForm';
import type { BookingFormValues } from '../booking/schema';
import { Icon } from '../components/Icon';
import { dayParts } from '../lib/format';
import { formatWeek, weekOf } from '../lib/week';
import { DateTime } from 'luxon';
import { NotFoundPage } from './NotFoundPage';

/** FR-9: join the waitlist for a fully booked date. */
export function JoinWaitlistPage() {
  const { date = '' } = useParams();
  const navigate = useNavigate();
  if (!isValidDate(date)) return <NotFoundPage />;

  const { longWeekday, day, month } = dayParts(date);
  const weekLink = `/?week=${formatWeek(weekOf(DateTime.fromISO(date)))}`;

  const join = async (values: BookingFormValues): Promise<SubmitProblem | null> => {
    try {
      const res = await api.joinWaitlist({ date, ...values });
      navigate(res.statusPath, { state: { justJoined: true } });
      return null;
    } catch (err) {
      const e = err instanceof ApiRequestError ? err : new ApiRequestError(0, null);
      switch (e.code) {
        case 'ALREADY_ON_WAITLIST':
          return {
            title: "You're already on the waitlist for this date.",
            body: 'Use the private link you got when you joined to check its status.',
          };
        case 'DATE_HAS_AVAILABILITY':
          return { title: 'Good news: a slot is free on this date.', body: 'You can book it now instead.', final: true };
        case 'VALIDATION_ERROR': {
          const details = Array.isArray(e.body?.details) ? (e.body.details as { field: string; messages: string[] }[]) : [];
          if (details.some((d) => d.field === 'date')) return { title: 'This date has passed.', final: true };
          const fieldErrors: SubmitProblem['fieldErrors'] = {};
          for (const d of details) if (d.field === 'name' || d.field === 'email') fieldErrors[d.field] = d.messages[0];
          return { title: 'Please check the highlighted fields.', fieldErrors };
        }
      }
      return e.status === 0
        ? { title: "We couldn't reach the server.", body: 'Check your connection and try again.' }
        : { title: 'Something went wrong.', body: 'Please try again in a moment.' };
    }
  };

  return (
    <div className="narrow">
      <Link to={weekLink} className="back-link">
        <Icon name="chevronLeft" size={16} />
        All times
      </Link>
      <h1 className="page-title">Join the waitlist</h1>
      <p className="lede lede--tight">
        {longWeekday} {day} {month} is fully booked. Leave your name and email, and your private link will show you as soon
        as a slot opens up.
      </p>
      <BookingForm
        onSubmit={join}
        backTo={weekLink}
        submitLabel="Join the waitlist"
        submittingLabel="Joining…"
        hint="We only use your email for this waitlist."
      />
    </div>
  );
}
