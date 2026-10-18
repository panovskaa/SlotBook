import { EMAIL_MAX_LENGTH, NAME_MAX_LENGTH, NAME_MIN_LENGTH } from '@slotbook/shared';
import { z } from 'zod';

/** Client-side copy of the booking rules for instant feedback (NFR-3). The server checks them again. */
export const bookingFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter your name')
    .min(NAME_MIN_LENGTH, `Your name needs at least ${NAME_MIN_LENGTH} characters`)
    .max(NAME_MAX_LENGTH, `Your name can be at most ${NAME_MAX_LENGTH} characters`),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Enter your email address')
    .max(EMAIL_MAX_LENGTH, 'This email address is too long')
    .pipe(z.email('Enter a valid email address, like name@example.com')),
});

export type BookingFormInput = z.input<typeof bookingFormSchema>;
export type BookingFormValues = z.output<typeof bookingFormSchema>;
