import type {
  ApiError,
  BookingLookupResponse,
  CancelBookingResponse,
  CreateBookingRequest,
  CreateBookingResponse,
  ManageBookingResponse,
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
};
