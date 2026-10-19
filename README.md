# SlotBook

A scheduling app for a single host: the host publishes time slots, visitors book them.
The full requirements are in [SRS.md](SRS.md) and the visual design system in [DESIGN.md](DESIGN.md).

## Status

| Area | State |
|---|---|
| Monorepo, database schema and all database constraints | Done |
| FR-1 Create slots (host) | Done, from the dashboard or the API |
| FR-2 Weekly calendar | Done: week in the URL, 7 columns on desktop, a day list below 768 px |
| FR-3 Book a slot | Done: booking form and confirmation page |
| FR-4 No double bookings | Done: guarded update, partial unique index, 20-request race test run 50 times |
| FR-5 Availability rules | Done: one shared table of cases runs against the API DTO and the web form |
| FR-6 Booking reference | Done (`GET /bookings/ref/:code`) |
| FR-11 AI confirmation message | Done: Gemini with a 3-second timeout, template fallback and a 300-character limit |
| `/health`, error format, request-ID logs, host key, Helmet, CORS | Done |
| FR-7 Cancel through the private link | Done: `/manage/:token` page, `GET /manage/:token`, `POST /manage/:token/cancel`, 60-minute cutoff |
| FR-8 Host dashboard | Done: `/host` with stats, upcoming bookings, adding slots and deleting free ones |
| FR-9 Waitlist | Done: join from a fully booked day, private status link, `slot.available` listener, "A slot opened up!" in the calendar |
| FR-10 Insights | Done: heatmap by weekday and hour with a data table, top 3 times, booking rate per weekday (on the dashboard) |
| Swagger, rate limiting, E2E (Playwright), axe checks, CI | Not started |

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

The host dashboard is at http://localhost:5173/host. It asks for the `HOST_ACCESS_KEY` from your
`.env`, which it keeps only until you close the tab (or press **Lock**). There's no link to it from
the public pages.

## Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string. The default matches `docker-compose.yml`. |
| `HOST_ACCESS_KEY` | Yes | Shared secret for host actions, sent in the `X-Host-Key` header. At least 16 characters. |
| `APP_TIMEZONE` | Yes | The one IANA time zone the app works in, such as `Europe/Berlin`. Dates and times the host enters are read in this zone; the database stores UTC. |
| `WEB_ORIGIN` | No | The web app's origin, for CORS. Default `http://localhost:5173`. |
| `PORT` | No | API port. Default `3000`. |
| `GEMINI_API_KEY` | No | Free-tier Gemini key for AI confirmation messages (FR-11), from https://aistudio.google.com/apikey. Without it, a template message is used. |
| `GEMINI_MODEL` | No | Which Gemini model to use. Default `gemini-2.5-flash-lite` (free tier, fast). |

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

# Host only: dashboard numbers, upcoming bookings, delete a free slot
curl localhost:3000/host/stats -H "X-Host-Key: $HOST_ACCESS_KEY"
curl localhost:3000/host/bookings -H "X-Host-Key: $HOST_ACCESS_KEY"
curl localhost:3000/host/insights -H "X-Host-Key: $HOST_ACCESS_KEY"
curl -X DELETE localhost:3000/host/slots/<slot id> -H "X-Host-Key: $HOST_ACCESS_KEY"

# Join a date's waitlist, then check it with the token from the response
curl -X POST localhost:3000/waitlist -H "Content-Type: application/json" \
  -d '{"date":"2026-11-03","name":"Ada Lovelace","email":"ada@example.com"}'
curl localhost:3000/waitlist/<token>

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
- **A page goes blank during development with "X is not defined" in the console.** Vite's file
  watcher sometimes misses a save on Windows and keeps serving an old copy. Save the file again (or
  restart `npm run dev`).

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
- **What the dashboard numbers mean.** *Published* is every slot that isn't deleted, past and future. *Upcoming bookings* are confirmed bookings whose slot hasn't started. *Open slots* are ones a visitor could book right now (available and more than 30 minutes away). The *booking rate* is booked ÷ published: "last 30 days" covers slots that started in the last 30 days, and "all time" covers every slot that isn't deleted. With nothing published, the rate shows "—" instead of 0 %. All the numbers come from one SQL query, so they describe the same moment.
- **Deleting slots.** Deleting is a soft delete (status `DELETED`), so history stays intact. Only free slots that haven't started can be deleted. Delete and booking use the same guarded update, so if both happen at once, exactly one wins (tested 20 times over).
- **New slots notify the waitlist.** Creating a bookable slot emits `slot.available`, as a cancellation does, ready for FR-9.
- **How the waitlist works.**
  - **Who can join.** You can join for any date that hasn't passed and has nothing bookable: every slot is booked or inside the 30-minute cutoff, or the date has no slots yet. The calendar offers it on days where every slot is taken.
  - **Notifying.** Cancellations and new slots emit `slot.available`. The listener marks that date's waiting entries `NOTIFIED` and "emails" each person through a development mailer that writes to the server log (A4). The event is awaited, so the waitlist is up to date before the cancel or create response returns. A failed notification is logged and never undoes the cancellation.
  - **No missed openings.** Joining re-checks availability after inserting the entry. If a slot opened in between, the entry is marked `NOTIFIED` at once.
  - **Expiry.** Entries turn `EXPIRED` once their date has passed in the app's time zone. This happens the next time the status link is opened; there's no background job.
  - **Calendar badge.** A day shows "A slot opened up!" while it has a notified entry and a slot is still free.
- **How insights are counted.**
  - **What counts.** Confirmed bookings, all time. Cancelled bookings and deleted slots never count.
  - **Time zone.** Everything is grouped in SQL in `APP_TIMEZONE` (`starts_at AT TIME ZONE …`), so a 23:30 UTC slot counts on the next local day and summer time is handled.
  - **Weekdays.** Weekdays use `ISODOW` (Monday = 1 … Sunday = 7) instead of the SRS's `DOW` (Sunday = 0), to match the Monday-first calendar.
  - **Top 3.** The "top 3 time slots" are weekday-and-start-time pairs (such as "Monday 10:00"), with ties broken by weekday, then time. The heatmap groups by hour, so 10:00 and 10:30 share a cell.
  - **Consistency.** The four queries run in one repeatable-read transaction, so their numbers agree.
- **Heatmap colours and accessibility.** One blue hue, lighter to darker, with empty hours left on the surface colour. The picture is hidden from screen readers. A data table with the same numbers is always in the page for them, and "Show as table" shows it on screen.
- **How the AI confirmation message works.**
  - **The request.** After a booking is committed, the API calls Gemini's `generateContent` REST method directly, without an SDK. The key goes in the `x-goog-api-key` header, never the URL.
  - **What's sent.** Only the booker's first name, the day and the time. Never the surname or the email.
  - **Fallbacks.** After 3 seconds the request is cancelled and the template is used. The template is also used when there's no key, when Gemini returns an error, or when the answer is empty.
  - **Clean-up.** Answers are reduced to plain text and kept within 300 characters: whole sentences where possible, otherwise whole words with "…".
  - **Bookings never fail because of it.** A slow Gemini delays the booking response by at most 3 seconds.
  - **Tests.** No test calls the real API. They use a fake client, and with no key configured there's no client at all.
  - **Free tier.** Google may use free-tier prompts to improve its products, which is another reason only a first name is sent.
- **Extra error codes.** FR-9 gives status codes but no error codes, so the waitlist adds `ALREADY_ON_WAITLIST` (409) and `DATE_HAS_AVAILABILITY` (422).
- **Extra endpoint.** `GET /slots/:id` isn't in the SRS list. The booking page needs it to load its slot when someone opens a `/book/:slotId` link directly.
- **"This week" before the first response.** The browser doesn't know the app's time zone until the first slot list arrives, so it uses its own zone to pick the opening week. This only matters around midnight on Sunday.
- **The private link is shown once.** It exists only in the booking response. Reloading the confirmation page falls back to the public lookup and says the link was shown once.
- **Extra error code.** Unexpected server errors use `INTERNAL_ERROR`, which isn't in the SRS list. It should never appear in normal use.
- **Package versions.** NestJS 11, Prisma 6, TypeScript 5.9 and Vite 7 are pinned on purpose instead of the newest majors, because they're well proven together.
