// Integration tests: need a running Postgres.
//   DATABASE_URL=postgres://events:events@localhost:5432/events_test npm run test:api
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.TICKET_SECRET = 'test-secret';
process.env.ADMIN_PIN = '4321';
process.env.DATABASE_URL ||= 'postgres://events:events@localhost:5432/events_test';

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');

let server, base;
const PIN = { 'x-admin-pin': '4321' };
const api = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const res = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

before(async () => {
  await pool.query('TRUNCATE events RESTART IDENTITY CASCADE');
  server = createApp().listen(0);
  base = `http://localhost:${server.address().port}`;
});
after(async () => { server.close(); await pool.end(); });

let eventId;

test('organizer can create an event, others cannot', async () => {
  const payload = { name: 'Test Night', venue: 'Hall', startsAt: '2026-12-01T18:00:00Z', capacity: 2 };
  assert.equal((await api('/api/events', { method: 'POST', body: payload })).status, 401);
  const r = await api('/api/events', { method: 'POST', body: payload, headers: PIN });
  assert.equal(r.status, 201);
  eventId = r.body.id;
});

test('ticket purchase returns a QR, is idempotent per email, and enforces capacity', async () => {
  const a = await api(`/api/events/${eventId}/tickets`, { method: 'POST', body: { name: 'Asha', email: 'Asha@x.com' } });
  assert.equal(a.status, 201);
  assert.match(a.body.ticket.qr, /^data:image\/png;base64,/);
  const again = await api(`/api/events/${eventId}/tickets`, { method: 'POST', body: { name: 'Asha', email: 'asha@x.com' } });
  assert.equal(again.body.existing, true);
  assert.equal(again.body.ticket.code, a.body.ticket.code);
  await api(`/api/events/${eventId}/tickets`, { method: 'POST', body: { name: 'Ben', email: 'ben@x.com' } });
  const third = await api(`/api/events/${eventId}/tickets`, { method: 'POST', body: { name: 'Cy', email: 'cy@x.com' } });
  assert.equal(third.status, 409);
  const bad = await api(`/api/events/${eventId}/tickets`, { method: 'POST', body: { name: 'Z', email: 'nope' } });
  assert.equal(bad.status, 400);
});

test('check-in: ok, then already, forged codes invalid, PIN required', async () => {
  const t = await api(`/api/events/${eventId}/tickets`, { method: 'POST', body: { name: 'Asha', email: 'asha@x.com' } });
  const code = t.body.ticket.code;
  assert.equal((await api('/api/checkin', { method: 'POST', body: { code } })).status, 401);
  const first = await api('/api/checkin', { method: 'POST', body: { code }, headers: PIN });
  assert.equal(first.body.status, 'ok');
  assert.equal(first.body.name, 'Asha');
  const second = await api('/api/checkin', { method: 'POST', body: { code }, headers: PIN });
  assert.equal(second.body.status, 'already');
  const forged = await api('/api/checkin', { method: 'POST', body: { code: code.slice(0, -3) + 'abc' }, headers: PIN });
  assert.equal(forged.body.status, 'invalid');
  const events = await api('/api/events');
  assert.equal(events.body[0].checkedIn, 1);
});

test('volunteer shifts: signup, conflict, full, cancel, suggestions', async () => {
  const mk = (role, s, e, capacity) => api(`/api/events/${eventId}/shifts`, {
    method: 'POST', headers: PIN,
    body: { role, startsAt: `2026-12-01T${s}:00Z`, endsAt: `2026-12-01T${e}:00Z`, capacity },
  });
  const door = (await mk('Door', '17:00', '19:00', 1)).body.id;
  const food = (await mk('Food', '18:00', '20:00', 2)).body.id;
  const clean = (await mk('Cleanup', '20:00', '22:00', 2)).body.id;
  assert.equal((await mk('Bad', '20:00', '19:00', 1)).status, 400);

  const su = (id, name, email) => api(`/api/shifts/${id}/signup`, { method: 'POST', body: { name, email } });
  assert.equal((await su(door, 'Asha', 'asha@x.com')).status, 201);
  const clash = await su(food, 'Asha', 'asha@x.com');
  assert.equal(clash.status, 409);
  assert.equal(clash.body.code, 'conflict');
  assert.equal((await su(door, 'Ben', 'ben@x.com')).body.code, 'full');
  assert.equal((await su(door, 'Asha', 'asha@x.com')).body.code, 'already_signed_up');

  const view = await api(`/api/events/${eventId}/shifts?email=asha@x.com`);
  assert.deepEqual(view.body.mine, [door]);
  assert.deepEqual(view.body.suggested, [clean]);   // food clashes, door is already hers

  await api(`/api/shifts/${door}/signup`, { method: 'DELETE', body: { email: 'asha@x.com' } });
  assert.equal((await su(food, 'Asha', 'asha@x.com')).status, 201);
});

test('last spot cannot be double-booked under concurrency', async () => {
  const s = (await api(`/api/events/${eventId}/shifts`, {
    method: 'POST', headers: PIN,
    body: { role: 'Race', startsAt: '2026-12-02T10:00:00Z', endsAt: '2026-12-02T11:00:00Z', capacity: 1 },
  })).body.id;
  const results = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      api(`/api/shifts/${s}/signup`, { method: 'POST', body: { name: `P${i}`, email: `p${i}@x.com` } })));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
});

test('roster needs the PIN', async () => {
  assert.equal((await api(`/api/events/${eventId}/roster`)).status, 401);
  assert.equal((await api(`/api/events/${eventId}/roster`, { headers: PIN })).status, 200);
});
