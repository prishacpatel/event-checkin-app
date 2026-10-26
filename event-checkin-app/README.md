# Door & Duty: event check-in and volunteer app

A web app for cultural events: QR-code tickets, check-in at the door, and volunteer shift sign-ups with conflict-aware scheduling. Designed in Figma first (see `docs/design-brief.md`), then built.

> Designed and built a QR check-in and volunteer-shift web app for cultural events (React, Node, PostgreSQL), from Figma wireframes to a working app with signed QR tickets and conflict-aware scheduling.

**Stack:** Figma, React (Vite), Node/Express, PostgreSQL

## Features

- **Tickets:** attendees get a QR ticket by name and email. One ticket per email per event, and sold-out events are enforced.
- **Signed QR codes:** each code carries an HMAC signature, so forged or edited codes are rejected without a database lookup.
- **Door check-in:** scan with the phone camera or type the code. The result is a clear Checked in, Already used (with the first scan time), or Not valid. Live count of who is in.
- **Volunteer shifts:** sign up and leave, with capacity limits, overlap detection, and a "Needs people" nudge toward under-filled shifts.
- **No double-booking races:** sign-ups lock the shift row in a transaction. A test fires six simultaneous requests at the last spot and exactly one wins.
- **Organizer tools** (behind a PIN): create events and shifts, see the volunteer roster.

## Run it

You need Node 18+ and either Docker or a local PostgreSQL.

```bash
cp .env.example .env              # then set ADMIN_PIN and TICKET_SECRET
docker compose up -d              # Postgres with schema and a sample "Diwali Night" event
cd server && npm install && npm run dev        # API on :3001
cd client && npm install && npm run dev        # app on :5173 (proxies /api to :3001)
```

Without Docker: create a database, then `psql <url> -f server/schema.sql -f server/seed.sql` and put the URL in `.env`.

For production, run `npm run build` in `client/`. The API server then serves the built app, so one process serves everything.

The door scanner needs the camera, which browsers only allow on `https://` or `localhost`. For a real event, deploy behind HTTPS.

## Tests

```bash
cd server
npm test                                   # scheduling and ticket-signing unit tests, no database needed
DATABASE_URL=postgres://events:events@localhost:5432/events_test npm run test:api
```

`test:api` needs a Postgres database with `schema.sql` loaded. It truncates the tables, so use a throwaway database.

## Using your Shiftly scheduling logic

All scheduling rules live in `server/src/scheduling.js` as pure functions (`overlaps`, `findConflicts`, `canSignUp`, `suggestShifts`). Replace the file with your Shiftly logic and keep those function names and the `{ id, role, startsAt, endsAt, capacity, signedUp }` shape. The API and tests use them unchanged.

## How check-in works

```
Ticket created -> id = UUID -> code = "TKT.<id>.<HMAC signature>" -> QR image
Scan -> verify signature -> UPDATE ... WHERE checked_in_at IS NULL
        1 row changed  -> Checked in
        0 rows changed -> Already used
```

The single conditional `UPDATE` means two phones scanning the same ticket at once can't both succeed.

## API

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/events` | none | Events with tickets sold and checked-in counts |
| `POST /api/events` | PIN | Create an event |
| `POST /api/events/:id/tickets` | none | Get (or re-fetch) a ticket with its QR |
| `POST /api/checkin` | PIN | Check in a scanned code |
| `GET /api/events/:id/shifts?email=` | none | Shifts, your shifts, suggested shifts |
| `POST /api/events/:id/shifts` | PIN | Create a shift |
| `POST` / `DELETE /api/shifts/:id/signup` | none | Join or leave a shift |
| `GET /api/events/:id/roster` | PIN | Who is on each shift |

Send the PIN in the `x-admin-pin` header.

## Known limits

- Anyone who knows an attendee's email can re-fetch that attendee's ticket, and volunteer sign-ups are not verified. Fine for a campus event, but add email verification before using it for anything high-stakes.
- One shared organizer PIN, not per-person accounts.
- Tickets are free. There is no payment flow.
