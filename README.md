# SlotBook

A scheduling app for a single host: the host publishes time slots, visitors book them.
The full requirements are in [SRS.md](SRS.md) and the visual design system in [DESIGN.md](DESIGN.md).

## Status

| Area | State |
|---|---|
| Monorepo, database schema and all database constraints | Done |
| FR-1 Create slots (host) | Done, API only (the host page comes with FR-8) |
| FR-2 Weekly calendar | Done: week in the URL, 7 columns on desktop, a day list below 768 px |
| FR-3 Book a slot | Done: booking form and confirmation page |
| FR-4 No double bookings | Done: guarded update, partial unique index, 20-request race test run 50 times |
| FR-5 Availability rules | Done: one shared table of cases runs against the API DTO and the web form |
| FR-6 Booking reference | Done (`GET /bookings/ref/:code`) |
| FR-11 Confirmation message | Template message only; the Gemini call isn't wired in yet |
| `/health`, error format, request-ID logs, host key, Helmet, CORS | Done |
| FR-7 Cancel through the private link | Done: `/manage/:token` page, `GET /manage/:token`, `POST /manage/:token/cancel`, 60-minute cutoff |
| FR-8 to FR-10, Swagger, rate limiting, E2E (Playwright), axe checks, CI | Not started |

## Requirements

- Node 20 or newer
- Docker Desktop (for Postgres and for the integration tests)

## Run it locally

```bash
cp .env.example .env          # then set HOST_ACCESS_KEY to a long random value
docker compose up -d          # Postgres 16 on localhost:5432
npm install
npx prisma migrate dev        # creates the tables and constraints
npm run seed                  # optional: two weeks of sample slots
npm run dev                   # API on :3000, web app on :5173
```

Then open http://localhost:5173. The seed adds slots on weekdays only, starting tomorrow, so if
this week looks empty, use the arrow to go to the next week.

## Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string. The default matches `docker-compose.yml`. |
| `HOST_ACCESS_KEY` | Yes | Shared secret for host actions, sent in the `X-Host-Key` header. At least 16 characters. |
| `APP_TIMEZONE` | Yes | The one IANA time zone the app works in, such as `Europe/Berlin`. Dates and times the host enters are read in this zone; the database stores UTC. |
| `WEB_ORIGIN` | No | The web app's origin, for CORS. Default `http://localhost:5173`. |
| `PORT` | No | API port. Default `3000`. |
| `GEMINI_API_KEY` | No | Free-tier Gemini key for AI confirmation messages (FR-11). Without it, a template message is used. |

## Try the API

```bash
# Create a slot (host only)
curl -X POST localhost:3000/host/slots \
  -H "X-Host-Key: $HOST_ACCESS_KEY" -H "Content-Type: application/json" \
  -d '{"date":"2026-12-01","startTime":"10:00","durationMinutes":30}'

# List the slots in a week (public)
curl "localhost:3000/slots?from=2026-11-30&to=2026-12-06"

# One slot, for the booking page (public; not in the SRS endpoint list)
curl localhost:3000/slots/<slot id>

# Book a slot (public). The response holds the reference and the private manage link.
curl -X POST localhost:3000/bookings -H "Content-Type: application/json" \
  -d '{"slotId":"<slot id>","name":"Ada Lovelace","email":"ada@example.com"}'

# Look up a booking by its reference (public, no personal data)
curl localhost:3000/bookings/ref/K7M2-QX9P

# View or cancel a booking with the token from its private link
curl localhost:3000/manage/<token>
curl -X POST localhost:3000/manage/<token>/cancel
```

Every error has the shape `{ statusCode, code, message, details? }`.

## Tests

```bash
npm test                                   # everything
npm run test:unit -w @slotbook/api         # fast, no database
npm run test:int -w @slotbook/api          # starts its own Postgres in Docker
npm test -w @slotbook/web                  # Vitest + React Testing Library
```

The integration tests start a throwaway Postgres container with Testcontainers and apply the real
migrations, so they never touch your local database. They run one file at a time because they share
that container.

## Troubleshooting

- **`npm run build` fails with `EPERM … query_engine-windows.dll.node` on Windows.** A running
  `npm run dev` holds Prisma's engine file open. Stop the dev server, then build again.

## Project layout

```
apps/api         NestJS REST API, Prisma schema and migrations
apps/web         React + Vite web app
packages/shared  Rules, error codes and API types used by both
```

## Decisions worth knowing

- **Cutoff boundaries.** The SRS says both "can't be booked less than 30 minutes before" and "more than 30 minutes". The code follows FR-3: booking closes **at** 30 minutes before the start, and cancelling closes **at** 60 minutes. The rules live in `packages/shared/src/slot-rules.ts`.
- **Clock changes.** A start time that doesn't exist because the clocks spring forward (such as 02:30 on the last Sunday of March in Berlin) is rejected with `VALIDATION_ERROR`.
- **Two locks against double booking.** A booking only goes through if its `UPDATE slot SET status='BOOKED' … WHERE status='AVAILABLE'` changes the row. Behind that, a partial unique index allows one confirmed booking per slot, and its error is returned as 409. Each layer alone holds up under the race test.
- **Reference collisions.** A colliding reference makes Postgres abort the transaction, so the whole booking transaction is retried with a new code (up to 3 tries) rather than just the insert.
- **Typed references.** Lookups accept any case, with or without the dash, and read O as 0 and I or L as 1, as Crockford Base32 allows.
- **Private links stay private.** Only the token's SHA-256 hash is stored. A wrong or malformed token gets the same 404. Logged URLs show `/manage/[redacted]`, and route params are left out of request logs because they repeat the token. The web app sends no `Referer` header, so the link can't leak to other sites.
- **Cancelling.** Cancelling closes **at** 60 minutes before the start. A second cancel returns 200 with "already cancelled", even after the cutoff. Simultaneous cancels are guarded like bookings: one cancels, the rest report it was already done. A freed slot emits a `slot.available` event for the waitlist (FR-9).
- **Extra endpoint.** `GET /slots/:id` isn't in the SRS list. The booking page needs it to load its slot when someone opens a `/book/:slotId` link directly.
- **"This week" before the first response.** The browser doesn't know the app's time zone until the first slot list arrives, so it uses its own zone to pick the opening week. This only matters around midnight on Sunday.
- **The private link is shown once.** It exists only in the booking response. Reloading the confirmation page falls back to the public lookup and says the link was shown once.
- **Extra error code.** Unexpected server errors use `INTERNAL_ERROR`, which isn't in the SRS list. It should never appear in normal use.
- **Package versions.** NestJS 11, Prisma 6, TypeScript 5.9 and Vite 7 are pinned on purpose instead of the newest majors, because they're well proven together.
