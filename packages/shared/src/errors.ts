export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SLOT_IN_PAST: 'SLOT_IN_PAST',
  SLOT_OVERLAP: 'SLOT_OVERLAP',
  SLOT_ALREADY_BOOKED: 'SLOT_ALREADY_BOOKED',
  BOOKING_CUTOFF: 'BOOKING_CUTOFF',
  CANCELLATION_CUTOFF: 'CANCELLATION_CUTOFF',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** Not in the SRS list: FR-9's 409, this email is already waiting for that date. */
  ALREADY_ON_WAITLIST: 'ALREADY_ON_WAITLIST',
  /** Not in the SRS list: FR-9's 422, the date still has slots to book, so there's nothing to wait for. */
  DATE_HAS_AVAILABILITY: 'DATE_HAS_AVAILABILITY',
  /** Not in the SRS list: only for unexpected server errors, which should never happen. */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** The one JSON shape every API error uses (SRS 4.2). */
export interface ApiError {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}
