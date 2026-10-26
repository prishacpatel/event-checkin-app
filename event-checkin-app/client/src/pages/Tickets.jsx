import { useState } from 'react';
import { api, fmtDateTime, useSaved } from '../api.js';

export default function Tickets({ event, onChange }) {
  const [getName, setSavedName] = useSaved('name');
  const [getEmail, setSavedEmail] = useSaved('email');
  const [name, setName] = useState(getName);
  const [email, setEmail] = useState(getEmail);
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const left = event.capacity - event.sold;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api(`/api/events/${event.id}/tickets`, { method: 'POST', body: { name, email } });
      setSavedName(name); setSavedEmail(email);
      setTicket(r.ticket);
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (ticket && ticket.eventId === event.id) {
    return (
      <section>
        <article className="ticket" aria-label="Your ticket">
          <div className="ticket-main">
            <h2>{event.name}</h2>
            <p>{fmtDateTime(event.startsAt)}</p>
            <p>{event.venue}</p>
            <p className="who">{ticket.name}</p>
          </div>
          <div className="ticket-stub">
            <img src={ticket.qr} alt={`QR code for ${ticket.name}`} width="180" height="180" />
            <p className="small">{ticket.checkedInAt ? 'Already checked in' : 'Show this at the door'}</p>
          </div>
        </article>
        <p className="hint">Screenshot this ticket or come back to this page with the same email to see it again.</p>
        <button className="ghost" onClick={() => setTicket(null)}>Get a ticket for someone else</button>
      </section>
    );
  }

  return (
    <section className="split">
      <div>
        <h2>{event.name}</h2>
        <p className="lead">{fmtDateTime(event.startsAt)} at {event.venue}</p>
        <p className={left <= 10 ? 'pill warn' : 'pill'}>{left > 0 ? `${left} tickets left` : 'Sold out'}</p>
      </div>
      <form onSubmit={submit}>
        <label>Full name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
        <label>Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        {error && <p className="msg bad" role="alert">{error}</p>}
        <button className="primary" disabled={busy || left <= 0}>{busy ? 'Getting ticket' : 'Get my ticket'}</button>
        <p className="hint">We use your email only to show you your ticket again.</p>
      </form>
    </section>
  );
}
