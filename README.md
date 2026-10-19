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
| NFR-1 Accessibility | axe (WCAG 2.1 A/AA) runs on every page the E2E tests visit; ESLint `jsx-a11y` is on for the web app, and `jsx-a11y/alt-text` fails the lint when an alt is missing. A manual keyboard pass isn't done |
| NFR-2 Mobile | E2E runs at desktop, Pixel 7 and iPhone SE sizes and checks for horizontal overflow; screenshot comparisons aren't done |
| NFR-4 Rate limiting | Done: booking, cancelling and joining the waitlist, per IP and endpoint |
| NFR-6 Performance | Done: a week of 1,000 slots loads with p95 116 ms at 10 concurrent connections (24 ms with one), see [Performance](#performance) |
| NFR-8 Maintainability | Done: ESLint (typescript-eslint strict, react-hooks, jsx-a11y) and Prettier for the whole monorepo; GitHub Actions runs them, the type checks, all tests and both builds |
| API docs | Swagger UI at http://localhost:3000/api/docs, raw OpenAPI at `/api/docs-json` |

## Requirements

- Node 20 or newer
- Docker Desktop (for Postgres and for the integration tests)

## Run it locally

```bash
cp .env.example .env          # then set HOST_ACCESS_KEY to a long random value
docker compose up -d          # Postgres 16 on localhost:5432, Mailpit inbox on http://localhost:8025
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
| `GEMINI_MODEL` | No | Which Gemini model to use. Default `gemini-3.5-flash-lite` (free tier, about 1 second per message). Older models such as `gemini-2.5-flash-lite` are closed to new API keys and answer 404. |
| `RATE_LIMIT_MAX` | No | Requests allowed per window, per IP, for each of booking, cancelling and joining the waitlist. Default `10`. |
| `RATE_LIMIT_WINDOW_SECONDS` | No | Length of that window. Default `60`. |
| `SMTP_URL` | No | SMTP server for the confirmation email with the private cancellation link. `smtp://localhost:1025` is Mailpit from `docker-compose.yml`, which catches every email in a local inbox at http://localhost:8025. For real email use your provider, e.g. `smtps://user:password@smtp.example.com:465`. Empty means no emails. |
| `MAIL_FROM` | No | Sender of those emails. Default `SlotBook <no-reply@slotbook.local>`. |
| `VITE_HOST_NAME` | No | Web app only (put it in `apps/web/.env`). Names the host in the copy, as in "Office hours with Ada Lovelace". Without it the site just says "Office hours". |

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
npm test                                   # unit, integration and web tests
npm run test:unit -w @slotbook/api         # fast, no database
npm run test:int -w @slotbook/api          # starts its own Postgres in Docker
npm test -w @slotbook/web                  # Vitest + React Testing Library
npm run test:e2e                           # Playwright + axe; needs `docker compose up -d`
```

The integration tests start a throwaway Postgres container with Testcontainers and apply the real
migrations, so they never touch your local database. They run one file at a time because they share
that container.

The end-to-end tests (`e2e/`) work like this:
- **Setup.** They build the apps, then start their own API on port 3100 and web app on port 5174, against a separate `slotbook_e2e` database. That database is created and migrated in the Compose Postgres, so it's safe to run next to `npm run dev`.
- **Coverage.** Every flow runs at desktop, Pixel 7 and iPhone SE sizes. Each page is checked with axe for WCAG 2.1 A/AA violations and for horizontal overflow.
- **Browser.** First time only, run `npx playwright install chromium`. The iPhone SE run uses Chromium at the iPhone's size, so only one browser is needed.
- **Report.** `npm run report -w @slotbook/e2e` opens the last report.

## Linting and formatting

```bash
npm run lint            # ESLint for every workspace
npm run format:check    # Prettier, without changing files
npm run format          # Prettier, rewriting files
```

- **ESLint** (`eslint.config.mjs`, flat config) uses typescript-eslint's `strictTypeChecked` and
  `stylisticTypeChecked` rules, each file checked against its own project's `tsconfig`. The web app
  adds `react-hooks` and `jsx-a11y`. Tests may use `any` (supertest bodies) and untyped mocks.
- **Prettier** (`.prettierrc.json`) keeps the existing style: single quotes, 2 spaces, trailing
  commas, 120 characters per line. Markdown files keep their hand-written layout.
- The type-aware rules read the generated Prisma client types. `npx prisma migrate dev` creates
  them; on their own, `npx prisma generate` does.

## Performance

NFR-6 asks for p95 under 200 ms when loading a week with 1,000 slots, on a local machine.

```bash
npm run perf -w @slotbook/api     # needs `docker compose up -d`; not run in CI
```

`apps/api/perf/slots-week.ts` creates a throwaway `slotbook_perf` database in the Compose Postgres,
seeds next week with 1,000 back-to-back 10-minute slots (every third one booked, every 50th deleted)
plus 12 more weeks around it (13,000 slots, 4,342 bookings) and some waitlist entries, starts the
built API against it with logging on, and loads `GET /slots` for that week with autocannon. Then it
prints `EXPLAIN ANALYZE` for the two queries behind the endpoint and drops the database. It exits
with 1 if the p95 is 200 ms or more. `PERF_DURATION`, `PERF_CONNECTIONS` and `PERF_KEEP_DB=1`
change the run.

Results on a Windows 11 laptop (Node 24, Postgres 16 in Docker Desktop), 987 slots per response:

| Run | Requests/s | p50 | p95 | p99 |
|---|---|---|---|---|
| Before the fix, 10 connections, 20 s | 55 | 174 ms | 234 ms | 264 ms |
| After the fix, 10 connections, 20 s | 102 | 96 ms | **116 ms** | 127 ms |
| After the fix, 1 connection, 10 s | 54 | 18 ms | 24 ms | 29 ms |

- **The database wasn't the bottleneck.** The slots query is an index scan on `slot_starts_at_idx`
  (0.4 ms for 987 rows) and the notified-waitlist query takes under 0.1 ms, so no index changes
  were needed. The waitlist query reads a handful of rows; at a larger scale, the unique
  `(date, email)` index already covers its date range.
- **The fix.** A CPU profile showed 28% of the time in Luxon: `GET /slots` turned every slot's
  start into a zoned date to find which notified waitlist dates still had a free slot. It now turns
  each notified date into one UTC range and compares instants, with the same result.
- What's left is mostly Prisma reading the rows and JSON serialization; with 10 requests in flight
  at once, each waits for the others on Node's single thread, which is why p50 there is about ten
  times the single-connection time.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:
- **`lint` job:** `npm run lint` and `npm run format:check`.
- **`test` job (Node 20 and 22):** type-checks all three projects, runs the unit and integration tests (Testcontainers uses the runner's Docker) and the web tests, and builds both apps.
- **`e2e` job:** runs the Playwright suite against a Postgres service container and uploads the HTML report if anything fails.

To make CI a merge requirement, as NFR-8 asks, turn on branch protection for `master` in the GitHub repository settings.

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
e2e              Playwright end-to-end and accessibility tests
.github          CI workflow
.claude/skills   Claude Code skills for this project (taste-skill set and Higgsfield)
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
- **Colour contrast differs slightly from DESIGN.md.** axe found that some DESIGN.md text colours miss WCAG AA's 4.5:1 for small text, so `apps/web/src/styles/tokens.css` keeps the hues and darkens them just enough:
  - muted text `#86868B` → `#6E6E73` (3.6:1 → 5.1:1)
  - success `#248A3D` → `#217E38`
  - warning `#9A6700` → `#956400`
  - a new `--accent-text: #0062C4` for blue text and links on tinted backgrounds; buttons keep `#0071E3`

  DESIGN.md itself still lists the old values.
- **Rate limiting.** Uses in-memory counters (`@nestjs/throttler`), which is right for one API instance. Several instances behind a load balancer would need a shared store such as Redis, and `trust proxy` set so the real client IP is counted. A limited request gets 429 `RATE_LIMITED` with a `Retry-After` header.
- **Swagger.** The `@nestjs/swagger` compiler plugin documents request bodies from the DTOs, validation rules included. Responses are shared TypeScript interfaces, which the plugin can't read, so each endpoint lists its status codes and error codes instead. Only the docs pages get a looser content security policy (Swagger UI needs inline styles).
- **Skiper UI components.** The landing hero (walking crowd, `skiper39`) and the smooth-caret name and email inputs (`skiper106`) come from [Skiper UI](https://skiper-ui.com), added with `npx shadcn add @skiper-ui/…` (registry set in `apps/web/components.json`). They live in `apps/web/src/components/ui/skiper-ui/`, and each file's header says how it was adapted:
  - accessibility: the decorative canvas is hidden from screen readers, it holds still when reduced motion is on, and the inputs keep their real labels and error messages
  - performance: the hero stops drawing while scrolled out of view
  - typing: strict TypeScript types instead of `any`
  - removed: `dialkit`, a live-tuning panel, isn't needed
  - email: the input uses `inputMode="email"` on a text field, so the animated caret can follow the cursor

  The free Skiper UI licence requires attribution, shown under the calendar together with the [Open Peeps](https://www.openpeeps.com) illustrations (`apps/web/public/images/peeps/all-peeps.png`).
- **Tailwind only for those components.** Tailwind 4 (with `@tailwindcss/vite`) loads its theme and utilities but not its base reset, so the hand-written styles in `app.css` are unchanged. The shadcn colour names (`primary`, `muted`, `foreground`, …) map onto the DESIGN.md tokens in `apps/web/src/styles/tailwind.css`.
- **Extra error codes.** FR-9 gives status codes but no error codes, so the waitlist adds `ALREADY_ON_WAITLIST` (409) and `DATE_HAS_AVAILABILITY` (422). Rate limiting adds `RATE_LIMITED` (429).
- **Extra endpoint.** `GET /slots/:id` isn't in the SRS list. The booking page needs it to load its slot when someone opens a `/book/:slotId` link directly.
- **"This week" before the first response.** The browser doesn't know the app's time zone until the first slot list arrives, so it uses its own zone to pick the opening week. This only matters around midnight on Sunday.
- **The private link is shown once, and emailed.** On screen it exists only in the booking response; it is also emailed to the booker with the reference and time. The email is sent after the booking is saved and never fails it: if the mail server is down or slow (6-second limit), the booking still succeeds, `emailSent` is false and the page asks the visitor to copy the link. The database keeps only a hash of the token, so the link can't be sent again later.
- **Extra error code.** Unexpected server errors use `INTERNAL_ERROR`, which isn't in the SRS list. It should never appear in normal use.
- **Package versions.** NestJS 11, Prisma 6, TypeScript 5.9 and Vite 7 are pinned on purpose instead of the newest majors, because they're well proven together.
- **What is being booked.** The site is set up for office hours: short one-to-one sessions with one host. The wording lives in `apps/web/src/content.ts`, so it can be changed in one place.
- **One skills folder.** The taste skills used to live in `.agents/skills` with links from `.claude/skills`. They are now real folders in `.claude/skills` only. `skills-lock.json` still records where they came from; running `npx skills update` may create `.agents` again.
