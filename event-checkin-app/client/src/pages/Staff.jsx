import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api, fmtTime } from '../api.js';

const RESULT_LABEL = { ok: 'Checked in', already: 'Already used', invalid: 'Not valid' };

export default function Staff({ events, event, onChange, onPick }) {
  const [pin, setPin] = useState(() => { try { return sessionStorage.getItem('pin') || ''; } catch { return ''; } });
  const [authed, setAuthed] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');

  const verify = useCallback(async (candidate) => {
    if (!event) { setError('Add an event first.'); return; }
    try {
      await api(`/api/events/${event.id}/roster`, { pin: candidate });
      setPin(candidate); setAuthed(true); setError('');
      try { sessionStorage.setItem('pin', candidate); } catch { /* ignore */ }
    } catch (e) {
      setAuthed(false);
      setError(e.status === 401 ? 'That PIN is not right.' : e.message);
    }
  }, [event]);

  useEffect(() => { if (pin && event && !authed) verify(pin); }, [pin, event, authed, verify]);

  if (!authed) {
    return (
      <section className="narrow">
        <h2>Staff sign-in</h2>
        <p className="lead">Enter the organizer PIN to check people in and manage events.</p>
        <form onSubmit={(e) => { e.preventDefault(); verify(pinInput); }}>
          <label>Organizer PIN<input type="password" value={pinInput} onChange={(e) => setPinInput(e.target.value)} autoComplete="off" /></label>
          {error && <p className="msg bad" role="alert">{error}</p>}
          <button className="primary">Sign in</button>
        </form>
        {!event && <p className="hint">No events exist yet. Run the seed file, or create one through the API with your PIN.</p>}
      </section>
    );
  }

  return (
    <div className="stack">
      <CheckIn event={event} pin={pin} onChange={onChange} />
      <Roster event={event} pin={pin} />
      <Organize events={events} event={event} pin={pin} onChange={onChange} onPick={onPick} />
    </div>
  );
}

function CheckIn({ event, pin, onChange }) {
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState('');
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState('');
  const scanner = useRef(null);
  const last = useRef({ code: '', at: 0 });

  const submit = useCallback(async (code) => {
    const now = Date.now();
    if (code === last.current.code && now - last.current.at < 3000) return;   // same QR still in view
    last.current = { code, at: now };
    try {
      const r = await api('/api/checkin', { method: 'POST', body: { code }, pin });
      setResult(r);
      if (navigator.vibrate) navigator.vibrate(r.status === 'ok' ? 80 : [60, 60, 60]);
      onChange();
    } catch (e) {
      setResult({ status: 'invalid', message: e.message });
    }
  }, [pin, onChange]);

  async function start() {
    setCamError('');
    try {
      scanner.current = new Html5Qrcode('qr-reader');
      await scanner.current.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, (text) => submit(text), () => {});
      setScanning(true);
    } catch {
      setCamError('Camera access was blocked. Allow the camera in your browser settings, or type the code below.');
    }
  }
  async function stop() {
    try { await scanner.current?.stop(); scanner.current?.clear(); } catch { /* already stopped */ }
    setScanning(false);
  }
  useEffect(() => () => { scanner.current?.isScanning && scanner.current.stop().catch(() => {}); }, []);

  return (
    <section>
      <h2>Door check-in</h2>
      <p className="lead">{event.checkedIn} of {event.sold} ticket holders are in.
        <span className="bar wide" aria-hidden="true"><i style={{ width: `${event.sold ? (event.checkedIn / event.sold) * 100 : 0}%` }} /></span>
      </p>
      <div className="scan">
        <div id="qr-reader" className={scanning ? 'on' : ''} />
        {scanning
          ? <button className="ghost" onClick={stop}>Stop camera</button>
          : <button className="primary" onClick={start}>Start camera</button>}
      </div>
      {camError && <p className="msg bad" role="alert">{camError}</p>}

      {result && (
        <div className={`result ${result.status}`} role="status" aria-live="assertive">
          <strong>{RESULT_LABEL[result.status]}</strong>
          {result.name && <span className="who">{result.name}</span>}
          {result.status !== 'ok' && <span>{result.message}</span>}
          {result.status === 'already' && result.checkedInAt && <span>First scanned at {fmtTime(result.checkedInAt)}</span>}
        </div>
      )}

      <form className="inline" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { submit(manual.trim()); setManual(''); } }}>
        <label>Type a ticket code<input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="TKT...." autoComplete="off" /></label>
        <button className="ghost">Check in</button>
      </form>
    </section>
  );
}

function Roster({ event, pin }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api(`/api/events/${event.id}/roster`, { pin }).then(setRows).catch(() => setRows([]));
  }, [event.id, pin]);
  const byShift = rows.reduce((m, r) => ((m[r.shift_id] ||= { role: r.role, people: [] }), r.name && m[r.shift_id].people.push(r.name), m), {});
  const groups = Object.values(byShift);
  return (
    <section>
      <h2>Volunteer roster</h2>
      {groups.length === 0 && <p className="empty">No shifts yet.</p>}
      <ul className="roster">
        {groups.map((g) => (
          <li key={g.role}><strong>{g.role}</strong>{g.people.length ? `: ${g.people.join(', ')}` : ': nobody yet'}</li>
        ))}
      </ul>
    </section>
  );
}

function Organize({ events, event, pin, onChange, onPick }) {
  const [msg, setMsg] = useState(null);
  const iso = (v) => new Date(v).toISOString();

  async function createEvent(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await api('/api/events', { method: 'POST', pin, body: {
        name: f.get('name'), venue: f.get('venue'), startsAt: iso(f.get('startsAt')), capacity: Number(f.get('capacity')) } });
      e.target.reset(); await onChange(); onPick(r.id);
      setMsg({ text: 'Event created.' });
    } catch (err) { setMsg({ bad: true, text: err.message }); }
  }

  async function createShift(e) {
    e.preventDefault();
    if (!event) return;
    const f = new FormData(e.target);
    try {
      await api(`/api/events/${event.id}/shifts`, { method: 'POST', pin, body: {
        role: f.get('role'), startsAt: iso(f.get('startsAt')), endsAt: iso(f.get('endsAt')), capacity: Number(f.get('capacity')) } });
      e.target.reset();
      setMsg({ text: 'Shift added.' });
    } catch (err) { setMsg({ bad: true, text: err.message }); }
  }

  return (
    <section>
      <h2>Organize</h2>
      {events.length > 1 && (
        <label className="picker">Working on
          <select value={event?.id ?? ''} onChange={(e) => onPick(Number(e.target.value))}>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </label>
      )}
      {msg && <p className={msg.bad ? 'msg bad' : 'msg good'} role="status">{msg.text}</p>}
      <div className="forms">
        <form onSubmit={createEvent}>
          <h3>New event</h3>
          <label>Name<input name="name" required /></label>
          <label>Venue<input name="venue" required /></label>
          <label>Starts<input name="startsAt" type="datetime-local" required /></label>
          <label>Capacity<input name="capacity" type="number" min="1" required /></label>
          <button className="primary">Create event</button>
        </form>
        <form onSubmit={createShift}>
          <h3>New volunteer shift</h3>
          <label>Role<input name="role" required /></label>
          <label>Starts<input name="startsAt" type="datetime-local" required /></label>
          <label>Ends<input name="endsAt" type="datetime-local" required /></label>
          <label>Volunteers needed<input name="capacity" type="number" min="1" required /></label>
          <button className="primary" disabled={!event}>Add shift</button>
        </form>
      </div>
    </section>
  );
}
