import type {
  ApiError,
  BookingLookupResponse,
  CancelBookingResponse,
  CreateBookingRequest,
  CreateBookingResponse,
  CreateSlotRequest,
  HostBookingsResponse,
  HostStatsResponse,
  InsightsResponse,
  JoinWaitlistRequest,
  JoinWaitlistResponse,
  ManageBookingResponse,
  WaitlistStatusResponse,
  SlotDto,
  SlotResponse,
  SlotsResponse,
} from '@slotbook/shared';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

/** An error response from the API, or a network failure (status 0). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
  ) {
    super(body?.message ?? (status === 0 ? 'Could not reach the server' : `Request failed (${status})`));
  }

  get code(): string | undefined {
    return this.body?.code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  } catch {
    throw new ApiRequestError(0, null);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(res.status, body as ApiError | null);
  return body as T;
}

export const api = {
  slots: (from: string, to: string, signal?: AbortSignal) =>
    request<SlotsResponse>(`/slots?from=${from}&to=${to}`, { signal }),
  slot: (id: string, signal?: AbortSignal) => request<SlotResponse>(`/slots/${encodeURIComponent(id)}`, { signal }),
  book: (body: CreateBookingRequest) =>
    request<CreateBookingResponse>('/bookings', { method: 'POST', body: JSON.stringify(body) }),
  lookup: (reference: string, signal?: AbortSignal) =>
    request<BookingLookupResponse>(`/bookings/ref/${encodeURIComponent(reference)}`, { signal }),
  manage: (token: string, signal?: AbortSignal) =>
    request<ManageBookingResponse>(`/manage/${encodeURIComponent(token)}`, { signal }),
  cancel: (token: string) =>
    request<CancelBookingResponse>(`/manage/${encodeURIComponent(token)}/cancel`, { method: 'POST' }),
  joinWaitlist: (body: JoinWaitlistRequest) =>
    request<JoinWaitlistResponse>('/waitlist', { method: 'POST', body: JSON.stringify(body) }),
  waitlistStatus: (token: string, signal?: AbortSignal) =>
    request<WaitlistStatusResponse>(`/waitlist/${encodeURIComponent(token)}`, { signal }),
};

/** Host routes (FR-8). Each call carries the host key in X-Host-Key. */
export function hostApi(key: string) {
  const headers = { 'X-Host-Key': key };
  return {
    stats: (signal?: AbortSignal) => request<HostStatsResponse>('/host/stats', { headers, signal }),
    bookings: (signal?: AbortSignal) => request<HostBookingsResponse>('/host/bookings', { headers, signal }),
    insights: (signal?: AbortSignal) => request<InsightsResponse>('/host/insights', { headers, signal }),
    createSlot: (body: CreateSlotRequest) =>
      request<SlotDto>('/host/slots', { method: 'POST', headers, body: JSON.stringify(body) }),
    deleteSlot: (id: string) => request<null>(`/host/slots/${encodeURIComponent(id)}`, { method: 'DELETE', headers }),
  };
}

export type HostApi = ReturnType<typeof hostApi>;
