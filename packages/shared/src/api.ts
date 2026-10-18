/** Request and response types shared by the API and the web app. */

export type SlotStatus = 'AVAILABLE' | 'BOOKED' | 'DELETED';

/** What a visitor sees. UNAVAILABLE means past the booking cutoff. */
export type SlotState = 'AVAILABLE' | 'BOOKED' | 'UNAVAILABLE';

export interface CreateSlotRequest {
  /** Date in APP_TIMEZONE, YYYY-MM-DD */
  date: string;
  /** Start time in APP_TIMEZONE, HH:mm */
  startTime: string;
  durationMinutes: number;
}

export interface SlotDto {
  id: string;
  /** ISO 8601, UTC */
  startsAt: string;
  /** ISO 8601, UTC */
  endsAt: string;
  durationMinutes: number;
  state: SlotState;
}

export interface SlotsResponse {
  timezone: string;
  slots: SlotDto[];
}

export type BookingStatus = 'CONFIRMED' | 'CANCELLED';

export interface CreateBookingRequest {
  slotId: string;
  /** 2–100 characters once surrounding spaces are trimmed */
  name: string;
  email: string;
}

export interface BookedSlot {
  /** ISO 8601, UTC */
  startsAt: string;
  /** ISO 8601, UTC */
  endsAt: string;
}

/** Returned once, right after booking. The manage token is never shown again. */
export interface CreateBookingResponse {
  /** XXXX-XXXX */
  reference: string;
  status: BookingStatus;
  slot: BookedSlot;
  /** The secret for the private cancellation link /manage/:token */
  manageToken: string;
  /** Path of the private cancellation link, e.g. /manage/abc… */
  managePath: string;
  /** Friendly confirmation message (FR-11) */
  message: string;
}

/** GET /bookings/ref/:code — public, so it carries no personal data (FR-6). */
export interface BookingLookupResponse {
  reference: string;
  status: BookingStatus;
  slot: BookedSlot;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  database: 'up' | 'down';
}
