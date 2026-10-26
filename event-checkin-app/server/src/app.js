import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import QRCode from 'qrcode';
import { pool } from './db.js';
import { makeCode, newTicketId, pinMatches, verifyCode } from './tokens.js';
import { canSignUp, suggestShifts } from './scheduling.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (s, max = 120) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

function requireAdmin(req, res, next) {
  if (!pinMatches(req.get('x-admin-pin'))) return res.status(401).json({ error: 'Wrong organizer PIN.' });
  next();
}

const rowToShift = (r) => ({
  id: r.id,
  eventId: r.event_id,
  role: r.role,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  capacity: r.capacity,
  signedUp: Number(r.signed_up ?? 0),
});

async function ticketPayload(row) {
  const code = makeCode(row.id);
  const qr = await QRCode.toDataURL(code, { margin: 1, width: 360, errorCorrectionLevel: 'M' });
  return {
    id: row.id, eventId: row.event_id, name: row.name, email: row.email,
    checkedInAt: row.checked_in_at, code, qr,
  };
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '50kb' }));

  // ---------- events ----------
  app.get('/api/events', wrap(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT e.*, (SELECT count(*) FROM tickets t WHERE t.event_id = e.id) AS sold,
             (SELECT count(*) FROM tickets t WHERE t.event_id = e.id AND t.checked_in_at IS NOT NULL) AS checked_in
      FROM events e ORDER BY e.starts_at`);
    res.json(rows.map((r) => ({
      id: r.id, name: r.name, venue: r.venue, startsAt: r.starts_at, capacity: r.capacity,
      sold: Number(r.sold), checkedIn: Number(r.checked_in),
    })));
  }));

  app.post('/api/events', requireAdmin, wrap(async (req, res) => {
    const name = clean(req.body.name), venue = clean(req.body.venue);
    const capacity = Number(req.body.capacity), startsAt = new Date(req.body.startsAt);
    if (!name || !venue || !Number.isInteger(capacity) || capacity < 1 || Number.isNaN(startsAt.getTime())) {
      return res.status(400).json({ error: 'Give the event a name, venue, start time and capacity.' });
    }
    const { rows } = await pool.query(
      'INSERT INTO events (name, venue, starts_at, capacity) VALUES ($1,$2,$3,$4) RETURNING id',
      [name, venue, startsAt, capacity]);
    res.status(201).json({ id: rows[0].id });
  }));

  // ---------- tickets ----------
  app.post('/api/events/:id/tickets', wrap(async (req, res) => {
    const eventId = Number(req.params.id);
    const name = clean(req.body.name), email = clean(req.body.email, 200).toLowerCase();
    if (!name) return res.status(400).json({ error: 'Enter your name.' });
    if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ev = await client.query('SELECT capacity FROM events WHERE id = $1 FOR UPDATE', [eventId]);
      if (!ev.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Event not found.' }); }

      const existing = await client.query('SELECT * FROM tickets WHERE event_id = $1 AND email = $2', [eventId, email]);
      if (existing.rowCount) {
        await client.query('COMMIT');
        return res.json({ ticket: await ticketPayload(existing.rows[0]), existing: true });
      }
      const sold = await client.query('SELECT count(*)::int AS n FROM tickets WHERE event_id = $1', [eventId]);
      if (sold.rows[0].n >= ev.rows[0].capacity) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This event is sold out.' });
      }
      const ins = await client.query(
        'INSERT INTO tickets (id, event_id, name, email) VALUES ($1,$2,$3,$4) RETURNING *',
        [newTicketId(), eventId, name, email]);
      await client.query('COMMIT');
      res.status(201).json({ ticket: await ticketPayload(ins.rows[0]), existing: false });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }));

  // ---------- door check-in ----------
  app.post('/api/checkin', requireAdmin, wrap(async (req, res) => {
    const id = verifyCode(req.body.code);
    if (!id) return res.json({ status: 'invalid', message: 'Not a valid ticket code.' });

    const upd = await pool.query(
      `UPDATE tickets SET checked_in_at = now()
       WHERE id = $1 AND checked_in_at IS NULL RETURNING name, event_id, checked_in_at`, [id]);
    if (upd.rowCount) {
      return res.json({ status: 'ok', message: 'Checked in.', name: upd.rows[0].name, eventId: upd.rows[0].event_id });
    }
    const found = await pool.query('SELECT name, event_id, checked_in_at FROM tickets WHERE id = $1', [id]);
    if (!found.rowCount) return res.json({ status: 'invalid', message: 'Ticket not found.' });
    res.json({
      status: 'already', message: 'This ticket was already used.',
      name: found.rows[0].name, eventId: found.rows[0].event_id, checkedInAt: found.rows[0].checked_in_at,
    });
  }));

  // ---------- volunteer shifts ----------
  const shiftsFor = async (eventId) => {
    const { rows } = await pool.query(`
      SELECT s.*, (SELECT count(*) FROM shift_signups x WHERE x.shift_id = s.id) AS signed_up
      FROM shifts s WHERE s.event_id = $1 ORDER BY s.starts_at, s.id`, [eventId]);
    return rows.map(rowToShift);
  };

  const myShifts = async (eventId, email, client = pool) => {
    const { rows } = await client.query(`
      SELECT s.*, (SELECT count(*) FROM shift_signups x WHERE x.shift_id = s.id) AS signed_up
      FROM shifts s JOIN shift_signups m ON m.shift_id = s.id
      WHERE s.event_id = $1 AND m.email = $2`, [eventId, email]);
    return rows.map(rowToShift);
  };

  app.get('/api/events/:id/shifts', wrap(async (req, res) => {
    const eventId = Number(req.params.id);
    const email = clean(req.query.email || '', 200).toLowerCase();
    const all = await shiftsFor(eventId);
    if (!email) return res.json({ shifts: all, mine: [], suggested: [] });
    const mine = await myShifts(eventId, email);
    res.json({
      shifts: all,
      mine: mine.map((s) => s.id),
      suggested: suggestShifts(all, mine).map((s) => s.id),
    });
  }));

  app.post('/api/events/:id/shifts', requireAdmin, wrap(async (req, res) => {
    const eventId = Number(req.params.id);
    const role = clean(req.body.role), capacity = Number(req.body.capacity);
    const startsAt = new Date(req.body.startsAt), endsAt = new Date(req.body.endsAt);
    if (!role || !Number.isInteger(capacity) || capacity < 1 || Number.isNaN(startsAt.getTime())
        || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      return res.status(400).json({ error: 'Give the shift a role, capacity, and a start time before its end time.' });
    }
    const { rows } = await pool.query(
      'INSERT INTO shifts (event_id, role, starts_at, ends_at, capacity) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [eventId, role, startsAt, endsAt, capacity]);
    res.status(201).json({ id: rows[0].id });
  }));

  app.post('/api/shifts/:id/signup', wrap(async (req, res) => {
    const shiftId = Number(req.params.id);
    const name = clean(req.body.name), email = clean(req.body.email, 200).toLowerCase();
    if (!name) return res.status(400).json({ error: 'Enter your name.' });
    if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock the shift row so two people cannot take the last spot at the same time.
      const lock = await client.query('SELECT * FROM shifts WHERE id = $1 FOR UPDATE', [shiftId]);
      if (!lock.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Shift not found.' }); }
      const count = await client.query('SELECT count(*)::int AS n FROM shift_signups WHERE shift_id = $1', [shiftId]);
      const candidate = rowToShift({ ...lock.rows[0], signed_up: count.rows[0].n });
      const mine = await myShifts(candidate.eventId, email, client);

      const verdict = canSignUp(candidate, mine);
      if (!verdict.ok) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: verdict.reason, code: verdict.code });
      }
      await client.query('INSERT INTO shift_signups (shift_id, name, email) VALUES ($1,$2,$3)', [shiftId, name, email]);
      await client.query('COMMIT');
      res.status(201).json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }));

  app.delete('/api/shifts/:id/signup', wrap(async (req, res) => {
    const email = clean(req.body.email, 200).toLowerCase();
    await pool.query('DELETE FROM shift_signups WHERE shift_id = $1 AND email = $2', [Number(req.params.id), email]);
    res.json({ ok: true });
  }));

  // Organizers: who is on each shift
  app.get('/api/events/:id/roster', requireAdmin, wrap(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT s.id AS shift_id, s.role, m.name, m.email FROM shifts s
      LEFT JOIN shift_signups m ON m.shift_id = s.id
      WHERE s.event_id = $1 ORDER BY s.starts_at, s.id, m.created_at`, [Number(req.params.id)]);
    res.json(rows);
  }));

  // ---------- serve the built React app in production ----------
  const dist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side. Try again.' });
  });
  return app;
}
