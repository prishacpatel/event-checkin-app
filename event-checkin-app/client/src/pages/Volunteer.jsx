import { useCallback, useEffect, useState } from 'react';
import { api, fmtTime, useSaved } from '../api.js';

export default function Volunteer({ event }) {
  const [getName, setSavedName] = useSaved('name');
  const [getEmail, setSavedEmail] = useSaved('email');
  const [name, setName] = useState(getName);
  const [email, setEmail] = useState(getEmail);
  const [data, setData] = useState({ shifts: [], mine: [], suggested: [] });
  const [notice, setNotice] = useState(null);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const load = useCallback(async () => {
    try {
      const q = validEmail ? `?email=${encodeURIComponent(email)}` : '';
      setData(await api(`/api/events/${event.id}/shifts${q}`));
    } catch (e) {
      setNotice({ bad: true, text: e.message });
    }
  }, [event.id, email, validEmail]);

  useEffect(() => { load(); }, [load]);

  async function act(shift, join) {
    setNotice(null);
    if (!name.trim() || !validEmail) {
      setNotice({ bad: true, text: 'Enter your name and a valid email first, so we can hold your spot.' });
      return;
    }
    try {
      await api(`/api/shifts/${shift.id}/signup`, { method: join ? 'POST' : 'DELETE', body: { name, email } });
      setSavedName(name); setSavedEmail(email);
      setNotice({ text: join ? `You are on the ${shift.role} shift.` : `You left the ${shift.role} shift.` });
    } catch (e) {
      setNotice({ bad: true, text: e.message });
    }
    load();
  }

  return (
    <section>
      <h2>Volunteer shifts</h2>
      <p className="lead">Pick as many shifts as you like. Shifts that overlap can't be combined.</p>
      <div className="row">
        <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      </div>

      {notice && <p className={notice.bad ? 'msg bad' : 'msg good'} role="status">{notice.text}</p>}
      {data.shifts.length === 0 && <p className="empty">No shifts have been posted for this event yet.</p>}

      <ul className="shifts">
        {data.shifts.map((s) => {
          const mine = data.mine.includes(s.id);
          const full = s.signedUp >= s.capacity;
          const needs = data.suggested.includes(s.id);
          return (
            <li key={s.id} className={mine ? 'shift mine' : 'shift'}>
              <div>
                <h3>{s.role}</h3>
                <p>{fmtTime(s.startsAt)} to {fmtTime(s.endsAt)}</p>
                <p className="small">{s.signedUp} of {s.capacity} filled
                  {needs && !mine && <span className="pill warn">Needs people</span>}
                </p>
                <div className="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (s.signedUp / s.capacity) * 100)}%` }} /></div>
              </div>
              {mine
                ? <button className="ghost" onClick={() => act(s, false)}>Leave shift</button>
                : <button className="primary" disabled={full} onClick={() => act(s, true)}>{full ? 'Full' : 'Sign up'}</button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
