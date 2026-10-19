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
  /** Dates (YYYY-MM-DD) where someone on the waitlist was told a slot opened up and one is still free (FR-9). */
  openedUp: string[];
}

/** GET /slots/:id */
export interface SlotResponse {
  timezone: string;
  slot: SlotDto;
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

/** Returned once, right after booking. The manage token is never shown on screen again; it is also emailed. */
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
  /** Whether the confirmation, with the private cancellation link, was emailed to the visitor */
  emailSent: boolean;
}

/** GET /bookings/ref/:code — public, so it carries no personal data (FR-6). */
export interface BookingLookupResponse {
  reference: string;
  status: BookingStatus;
  slot: BookedSlot;
}

/** GET /manage/:token — only the holder of the private link sees this, so it includes their own details. */
export interface ManageBookingResponse {
  timezone: string;
  reference: string;
  status: BookingStatus;
  name: string;
  email: string;
  slot: BookedSlot;
  /** False once the booking is cancelled or the 60-minute cutoff has passed. */
  canCancel: boolean;
  /** ISO 8601, UTC; set once cancelled */
  cancelledAt: string | null;
}

/** POST /manage/:token/cancel. Cancelling twice is safe: the second call reports it was already done. */
export interface CancelBookingResponse extends ManageBookingResponse {
  alreadyCancelled: boolean;
  message: string;
}

/** Booked slots ÷ published slots. `rate` is null when nothing was published, rather than 0 % or NaN. */
export interface BookingRate {
  booked: number;
  published: number;
  /** 0–1 */
  rate: number | null;
}

/** GET /host/stats (FR-8). Deleted slots never count as published. */
export interface HostStatsResponse {
  timezone: string;
  /** Every slot that isn't deleted, past and future */
  totalPublished: number;
  /** Confirmed bookings whose slot hasn't started */
  upcomingBookings: number;
  /** Slots a visitor could book right now: available and more than 30 minutes away */
  remainingAvailable: number;
  bookingRate: {
    /** Slots that started in the last 30 days */
    last30Days: BookingRate;
    /** All slots that aren't deleted */
    allTime: BookingRate;
  };
}

/** One upcoming booking, as the host sees it. */
export interface HostBookingDto {
  id: string;
  reference: string;
  name: string;
  email: string;
  slotId: string;
  slot: BookedSlot;
  createdAt: string;
}

/** GET /host/bookings */
export interface HostBookingsResponse {
  timezone: string;
  bookings: HostBookingDto[];
}

/** ISO weekday: 1 = Monday … 7 = Sunday, in the app's time zone. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface HeatmapCell {
  weekday: IsoWeekday;
  /** 0–23, local hour the slot starts in */
  hour: number;
  bookings: number;
}

export interface TopSlot {
  weekday: IsoWeekday;
  /** Local start time, HH:mm */
  time: string;
  bookings: number;
}

export interface WeekdayRate extends BookingRate {
  weekday: IsoWeekday;
}

/** GET /host/insights (FR-10). All counts are confirmed bookings, all time, grouped in the app's time zone. */
export interface InsightsResponse {
  timezone: string;
  totalBookings: number;
  /** First and last local hour that has any slot, to size the heatmap; null when nothing is published. */
  hourRange: { from: number; to: number } | null;
  /** Only cells with at least one booking; every other weekday/hour is zero. */
  heatmap: HeatmapCell[];
  /** Up to three weekday-and-start-time combinations with the most bookings */
  topSlots: TopSlot[];
  /** Always seven entries, Monday first */
  weekdayRates: WeekdayRate[];
}

export type WaitlistStatus = 'WAITING' | 'NOTIFIED' | 'EXPIRED';

/** POST /waitlist (FR-9) */
export interface JoinWaitlistRequest {
  /** YYYY-MM-DD in the app's time zone */
  date: string;
  name: string;
  email: string;
}

/** Returned once. The status token is never shown again. */
export interface JoinWaitlistResponse {
  date: string;
  status: WaitlistStatus;
  statusToken: string;
  /** e.g. /waitlist/abc… */
  statusPath: string;
  /** Whether the confirmation, with the private status link, was emailed */
  emailSent: boolean;
}

/** GET /waitlist/:token — only the link holder sees this. */
export interface WaitlistStatusResponse {
  timezone: string;
  date: string;
  name: string;
  status: WaitlistStatus;
  /** ISO 8601, UTC */
  createdAt: string;
  notifiedAt: string | null;
  /** Slots on that date that can be booked right now, so the visitor can go straight to one. */
  availableSlots: SlotDto[];
}

export interface HealthResponse {
  status: 'ok' | 'error';
  database: 'up' | 'down';
}
