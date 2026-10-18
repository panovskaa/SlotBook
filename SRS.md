# SlotBook — Software Requirements Specification

**Version:** 1.0 · **Date:** 2026-10-18
**Stack:** React + TypeScript (Vite) · NestJS · PostgreSQL 16 · Prisma · Gemini (free tier)

## 1. Introduction

### 1.1 Purpose

This document lists everything SlotBook must do and how well it must do it. Each feature comes with acceptance criteria and a test concept, so the finished app can be checked against it item by item.

### 1.2 Scope

SlotBook is a scheduling app for a single host:

- The host publishes time slots.
- The host sees a dashboard with statistics and booking insights.
- Visitors browse a weekly calendar and book a slot with their name and email.
- Each booker gets a booking reference and a private cancellation link.
- Visitors can join a waitlist for dates that are fully booked.
- An LLM writes a short, friendly confirmation message for each booking.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| Host | The single person who publishes slots. They're identified by a shared host access key, not an account. |
| Visitor | Anyone who views the calendar, books, cancels or joins a waitlist. |
| Slot | A bookable time window: a start date-time and a duration (15–240 min). |
| Booking | A visitor's reservation of one slot: name, email, reference and status. |
| Booking reference | A short unique code such as `K7M2-QX9P` that identifies a booking. |
| Cancellation token | A random secret inside the private manage link. Only its SHA-256 hash is stored. |
| Booking cutoff | A slot can't be booked less than 30 minutes before it starts. |
| Cancellation cutoff | A booking can't be cancelled less than 60 minutes before it starts. |
| Waitlist entry | A visitor's request to be told when a slot opens on a fully booked date. |

### 1.4 References

- The assignment brief
- NestJS, Prisma and PostgreSQL documentation
- WCAG 2.1 AA

## 2. Overall description

### 2.1 Product perspective

SlotBook has four parts:

- A React single-page app with two areas: the public calendar and the host area.
- A NestJS REST API that the frontend calls.
- PostgreSQL, which the API reaches through Prisma.
- The Gemini API, which the backend calls for confirmation messages.

### 2.2 User classes

| User | Access | Main tasks |
|---|---|---|
| Host | Host access key, sent in the `X-Host-Key` header | Create and delete slots, view the dashboard and insights |
| Visitor | Anonymous | Browse, book, cancel with the private link, join a waitlist |

### 2.3 Operating environment

- **Browsers:** current Chrome, Firefox, Safari and Edge, on screens from 320 px phones up to desktop.
- **Runtime:** Node 20+ and PostgreSQL 16, with Docker Compose for running locally.

### 2.4 Constraints

- No user accounts or login.
- One time zone, set by `APP_TIMEZONE`. All timestamps are stored in UTC as `timestamptz`.
- The LLM must be on a free tier.

### 2.5 Assumptions

- **A1. Booking cutoff:** the "30-minute buffer" means a slot can't be booked once it starts in less than 30 minutes. Such slots show as Unavailable.
- **A2. Cancellation cutoff:** a booker can cancel up to 60 minutes before the start, but not after that.
- **A3. Host key:** the host's actions are protected by one shared secret key instead of a login. Otherwise any visitor could create or delete slots.
- **A4. Waitlist notifications:** no real email is sent. The waitlist status page shows when a slot opens up, and a development mailer writes the "email" to the server log.

## 3. Functional requirements

Each requirement below has a description, acceptance criteria (AC) and a test concept (TC).

### FR-1 Create time slots (host)

**Description**

- The host enters a date, a start time and a duration (15–240 min, in 15-minute steps).
- The backend rejects any slot that starts in the past.
- The backend rejects any slot that overlaps an existing active slot.

**AC**

- A valid slot returns 201 and appears in the calendar.
- A past slot returns 400 `SLOT_IN_PAST`.
- An overlapping slot returns 409 `SLOT_OVERLAP`.
- A rejected slot leaves nothing in the database.

**TC**

- Unit: DTO validation (bad date format, duration out of range, not a multiple of 15).
- Integration (supertest + Testcontainers Postgres): overlap cases — identical, partial, contained and containing slots are rejected; back-to-back slots (10:00–10:30 then 10:30–11:00) are allowed.
- Database level: insert overlapping rows with raw SQL and assert that the exclusion constraint rejects them.
- E2E (Playwright): the host creates a slot and sees it in the calendar.

### FR-2 See available slots: weekly calendar

**Description**

- The calendar shows one week (Mon–Sun). Each slot is marked Available, Booked or Unavailable (past the booking cutoff).
- Buttons: previous week, next week and "Today".
- The current week is kept in the URL (`?week=2026-W43`), so a link opens the same week.
- Below 768 px wide, the week becomes a list grouped by day.

**AC**

- Past slots are not shown.
- Every state has a text label and an icon, not just a color.
- Navigating between weeks updates the URL, and reloading the page keeps the week.

**TC**

- Unit (Vitest): date helpers — start of week, year rollover (week 52 → week 1), daylight-saving changeover.
- Component (React Testing Library): each slot state renders the correct label; the empty week shows an empty-state message.
- E2E: week navigation at 375 px and 1280 px widths.

### FR-3 Book a slot

**Description**

- The booking form asks for:
  - **Name:** 2–100 characters, surrounding spaces trimmed.
  - **Email:** a valid address, saved in lowercase.
- A slot can only be booked while it is Available and starts in more than 30 minutes.
- On success, the visitor sees the booking reference, the private cancellation link and the confirmation message.

**AC**

- The slot shows as Booked to every visitor straight away.
- Booking inside the cutoff returns 422 `BOOKING_CUTOFF` with the message "Booking closes 30 minutes before start".
- A slot that doesn't exist returns 404.

**TC**

- Unit: the cutoff rule with an injected clock, at 29, 30 and 31 minutes before the start.
- Integration: the successful booking, the cutoff, a missing slot, and an already booked slot (409).
- E2E: the whole booking flow, ending on the confirmation screen.

### FR-4 No double bookings, even with simultaneous requests

**Description**

The database guarantees that only one booking succeeds:

- A partial unique index allows only one confirmed booking per slot: `UNIQUE (slot_id) WHERE status = 'CONFIRMED'`.
- Inside one transaction, the API runs `UPDATE slot SET status='BOOKED' WHERE id=$1 AND status='AVAILABLE'`. If no row changed, the slot was already taken and the API returns 409.
- If the unique index still rejects an insert (Prisma error P2002), the API returns 409 instead of a server error.

**AC**

- When N people request the same slot at once, exactly 1 request gets 201 and N−1 get 409 `SLOT_ALREADY_BOOKED`.
- No request gets a 500.

**TC**

- Concurrency integration test: send 20 `POST /bookings` for one slot at the same moment (`Promise.all`) against a real Postgres. Assert one 201, nineteen 409s and exactly one booking row. Repeat the test 50 times to catch timing-dependent failures.
- Unit: the error filter maps Prisma P2002 to 409.

### FR-5 Smart availability rules

**Description**

- Past slots are hidden from visitors.
- The host can't publish a slot in the past.
- The host's slots can't overlap. PostgreSQL enforces this with an exclusion constraint, added through a raw SQL migration: `EXCLUDE USING gist (tstzrange(starts_at, ends_at) WITH &&) WHERE (status <> 'DELETED')`.
- The frontend checks the same rules for instant feedback. The backend stays the authority.

**AC**

- Frontend and backend give the same result for every edge case.

**TC**

- One shared table of edge cases runs against both the zod schema (frontend) and the class-validator DTO (backend).
- Clock-controlled tests at the exact boundaries of each rule.

### FR-6 Booking reference

**Description**

- Every booking gets an 8-character code from the Crockford Base32 alphabet, which has no I, L, O or U, so codes are hard to misread. It is shown as `XXXX-XXXX`.
- The reference column has a unique constraint. If a new code collides with an existing one, the app generates a new one, up to 3 tries.
- `GET /bookings/ref/:code` returns the slot time and status only — no email.

**TC**

- Unit: the code's length and alphabet.
- Unit: force a collision with a mocked generator and check that a new code is used.
- Integration: the lookup response contains no personal data.

### FR-7 Cancel through a private link

**Description**

- The app creates 32 random bytes with `crypto.randomBytes` and encodes them as base64url. Only the SHA-256 hash is stored.
- The private link is `/manage/:token`.
- Cancelling is allowed until 60 minutes before the start.
- Cancelling frees the slot again, if it's still more than 30 minutes away, and runs the waitlist check (FR-9).

**AC**

- A wrong token returns 404, so the response reveals nothing about which bookings exist.
- Cancelling inside 60 minutes returns 422 `CANCELLATION_CUTOFF` with the message "Cancellation closes 1 hour before start".
- Cancelling twice is safe: the second request returns 200 with "already cancelled".

**TC**

- Unit: hashing and the constant-time comparison.
- Integration:
  - The raw token never appears in the database.
  - A wrong token returns 404.
  - The cancellation cutoff is enforced.
  - Cancelling twice behaves as described.
  - The slot shows as Available again afterwards.
- E2E: open the link and cancel the booking.

### FR-8 Host dashboard

**Description**

- The dashboard shows:
  - Total slots published
  - Upcoming bookings
  - Remaining available slots
  - Booking rate: booked slots ÷ published slots, for the last 30 days and for all time
- It lists upcoming bookings, and the host can delete slots that nobody has booked.

**AC**

- Requests without a valid host key return 401.
- The numbers match the database exactly.

**TC**

- Integration: seed a known dataset and assert each number exactly. Check that requests without a host key get 401.
- Component: the empty, loading and loaded states.

### FR-9 Waitlist for fully booked dates

**Description**

- When a date has no available slots, a visitor can join that date's waitlist with their name and email.
- They get a private status link (`/waitlist/:token`). The token is stored as a hash, like the cancellation token.
- When a slot on that date becomes available (through a cancellation or a newly created slot), the app emits a `slot.available` event using NestJS EventEmitter.
- An event listener marks that date's waitlist entries as `NOTIFIED`. The status page and the calendar then show "A slot opened up!"
- Each email can be on a date's waitlist only once (unique on date + email). Entries expire once the date has passed.

**AC**

- Joining twice with the same email returns 409.
- Joining a date that still has open slots returns 422.

**TC**

- Unit: the event listener, tested with an in-memory repository.
- Integration: join the waitlist, cancel a booking on that date, and assert the entry is `NOTIFIED`. Also test the duplicate (409) and has-availability (422) cases.
- E2E: the status page shows the notification.

### FR-10 Availability insights (host)

**Description**

- A heatmap shows bookings by weekday and hour.
- The page lists the 3 most-booked time slots and the booking rate for each weekday.
- The numbers come from SQL aggregates, grouped in the app's time zone: `EXTRACT(DOW / HOUR FROM starts_at AT TIME ZONE :tz)`.

**AC**

- The heatmap has a data table next to it, so screen readers can read the same numbers.

**TC**

- Integration: seed bookings across weekdays and around midnight in the app's time zone, then assert each bucket count.
- Component: the table fallback renders.

### FR-11 AI confirmation message (optional extra)

**Description**

- After a booking is committed, the backend asks Gemini for a short, friendly confirmation message.
- The call times out after 3 seconds. On a timeout or error, a template message is used instead.
- The prompt includes only the booker's first name, the date and the time — no email.
- The message is saved on the booking.

**AC**

- A booking always succeeds, even if the LLM fails.
- The message is at most 300 characters.

**TC**

- Unit: mock the LLM client for three cases — success, timeout and error. In each case the booking succeeds, and the fallback is used when the LLM fails.
- Unit: the message is shortened if the LLM returns more than 300 characters.

## 4. External interfaces

### 4.1 UI pages

| Route | Purpose |
|---|---|
| `/` | Weekly calendar |
| `/book/:slotId` | Booking form |
| `/confirmation/:ref` | Reference, cancellation link and AI message |
| `/manage/:token` | View or cancel a booking |
| `/waitlist/:token` | Waitlist status |
| `/host` | Dashboard, slot creation, insights (needs the host key) |

### 4.2 REST API

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/slots?from&to` | Public | Slots in a date range |
| POST | `/bookings` | Public | Book a slot |
| GET | `/bookings/ref/:code` | Public | Look up a booking by its reference |
| GET | `/manage/:token` | Token | View a booking |
| POST | `/manage/:token/cancel` | Token | Cancel a booking |
| POST | `/waitlist` | Public | Join a date's waitlist |
| GET | `/waitlist/:token` | Token | Waitlist status |
| POST | `/host/slots` | Host key | Create a slot |
| DELETE | `/host/slots/:id` | Host key | Delete a free slot |
| GET | `/host/stats` | Host key | Dashboard numbers |
| GET | `/host/insights` | Host key | Heatmap data |
| GET | `/host/bookings` | Host key | Upcoming bookings |
| GET | `/health` | Public | Checks the API and the database |

**Errors.** Every error has the same JSON shape: `{ statusCode, code, message, details? }`. The codes are `VALIDATION_ERROR`, `SLOT_IN_PAST`, `SLOT_OVERLAP`, `SLOT_ALREADY_BOOKED`, `BOOKING_CUTOFF`, `CANCELLATION_CUTOFF`, `NOT_FOUND` and `UNAUTHORIZED`.

**API docs.** Swagger/OpenAPI at `/api/docs`.

### 4.3 Data model (Prisma)

| Entity | Fields | Constraints |
|---|---|---|
| Slot | id, startsAt, endsAt, status (AVAILABLE / BOOKED / DELETED), createdAt | `CHECK (ends_at > starts_at)`; the exclusion constraint against overlaps; index on `starts_at` |
| Booking | id, slotId, name, email, reference, cancelTokenHash, status (CONFIRMED / CANCELLED), aiMessage, createdAt, cancelledAt | Unique on reference and on cancelTokenHash; partial unique on slotId where status is CONFIRMED |
| WaitlistEntry | id, date, name, email, tokenHash, status (WAITING / NOTIFIED / EXPIRED), createdAt, notifiedAt | Unique on (date, email) |

## 5. Non-functional requirements

| ID | Requirement | Test concept |
|---|---|---|
| NFR-1 Accessibility | WCAG 2.1 AA. Every image and icon has meaningful alt text; purely decorative images use `alt=""`. Full keyboard navigation with a visible focus ring. Booking results are announced to screen readers through an `aria-live` region. Information is never shown by color alone. | `@axe-core/playwright` runs on every page. The ESLint `jsx-a11y/alt-text` rule fails the build when alt is missing. A manual keyboard-only pass. |
| NFR-2 Mobile-friendly | Mobile-first layout. Works from 320 px wide with no horizontal scrolling. Touch targets are at least 44 × 44 px. The calendar becomes a day list on phones. | Playwright runs on iPhone SE, Pixel 7 and desktop sizes. A test asserts there is no horizontal overflow. Screenshot comparisons of the key screens. |
| NFR-3 Form validation | The client validates with react-hook-form + zod: inline messages, `aria-invalid`, `aria-describedby`, and submit is disabled while the form is invalid. The server checks everything again with class-validator DTOs and a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`). | One table of invalid inputs runs against both layers. Integration tests send malformed or extra fields and expect 400. |
| NFR-4 Security | The host key is compared in constant time. Cancellation and waitlist tokens are stored only as hashes. Booking, cancel and waitlist endpoints are rate-limited (`@nestjs/throttler`). Helmet sets security headers. CORS allows only the frontend's origin. Public responses never include personal data. | Integration tests for 401 and 429 responses, and a check that no email appears in public responses. A test that the raw token never appears in the database. |
| NFR-5 Data integrity | The rules that matter are enforced by the database itself (unique, exclusion and check constraints), not only by application code. Every write that touches more than one row runs in a transaction. | Database-level tests that bypass the API. The FR-4 concurrency test. |
| NFR-6 Performance | Loading a week of slots takes under 200 ms for 95% of requests, with 1,000 slots per week, on a local machine. | Load a seeded week with autocannon. Check the main queries with `EXPLAIN ANALYZE`. |
| NFR-7 Observability | Structured JSON logs (pino) with a request ID on every line. `/health` checks the database connection. | Integration test of `/health`. A test that the request ID appears in the logs. |
| NFR-8 Maintainability | Strict TypeScript, ESLint and Prettier. API types are shared between frontend and backend. CI on GitHub Actions runs linting and all tests. | The CI pipeline must pass before merging. |
| NFR-9 Local setup | `docker compose up -d` → `npm install` → `npx prisma migrate dev` → `npm run seed` → `npm run dev`. The README explains `DATABASE_URL`, `HOST_ACCESS_KEY`, `APP_TIMEZONE` and `GEMINI_API_KEY` (optional). | Follow the README step by step on a fresh clone. |

## 6. Test strategy

| Level | Tools | What it covers |
|---|---|---|
| Unit (backend) | Jest | Validation, time rules with an injected clock, generating references and tokens, mapping errors to HTTP codes, the LLM fallback |
| Unit and component (frontend) | Vitest + React Testing Library | Date helpers, calendar states, forms and validation messages |
| Integration | Jest + supertest + Testcontainers (a real Postgres) | Every endpoint, the database constraints, the concurrency test, the dashboard and insights numbers |
| End-to-end | Playwright | Booking, cancelling, the waitlist and the host flows on phone and desktop sizes |
| Accessibility | axe-core + eslint-plugin-jsx-a11y | Alt text, contrast, ARIA, keyboard use |
| CI | GitHub Actions | Runs everything above on every push |

### Traceability matrix

| Requirement | Unit | Integration | E2E | Accessibility |
|---|---|---|---|---|
| FR-1 Create slots | ✓ | ✓ (+ database level) | ✓ | |
| FR-2 Weekly calendar | ✓ | | ✓ | ✓ |
| FR-3 Book a slot | ✓ | ✓ | ✓ | ✓ |
| FR-4 Concurrency | ✓ | ✓ (concurrency test) | | |
| FR-5 Availability rules | ✓ (shared cases) | ✓ | | |
| FR-6 Booking reference | ✓ | ✓ | | |
| FR-7 Cancel link | ✓ | ✓ | ✓ | |
| FR-8 Dashboard | ✓ | ✓ | ✓ | |
| FR-9 Waitlist | ✓ | ✓ | ✓ | |
| FR-10 Insights | | ✓ | | ✓ |
| FR-11 AI message | ✓ | | | |
| NFR-1 to NFR-3 | ✓ | ✓ | ✓ | ✓ |
