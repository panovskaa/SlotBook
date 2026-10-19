/** Settings shared by the Playwright config and the tests. */

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://slotbook:slotbook@localhost:5432/slotbook_e2e';

export const HOST_KEY = 'e2e-host-key-not-a-secret-0123456789';
export const TIMEZONE = 'Europe/Berlin';
export const API_PORT = 3100;
export const WEB_PORT = 5174;
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
