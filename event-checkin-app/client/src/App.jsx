import { useCallback, useEffect, useState } from 'react';
import { api, fmtDateTime } from './api.js';
import Tickets from './pages/Tickets.jsx';
import Volunteer from './pages/Volunteer.jsx';
import Staff from './pages/Staff.jsx';

const TABS = [
  { id: 'tickets', label: 'Get a ticket' },
  { id: 'volunteer', label: 'Volunteer' },
  { id: 'staff', label: 'Staff' },
];

export default function App() {
  const [tab, setTab] = useState('tickets');
  const [events, setEvents] = useState(null);
  const [eventId, setEventId] = useState(null);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const list = await api('/api/events');
      setEvents(list);
      setEventId((cur) => cur ?? list[0]?.id ?? null);
      setLoadError('');
    } catch (e) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const event = events?.find((e) => e.id === eventId);

  return (
    <div className="app">
      <header className="top">
        <h1>Door &amp; Duty</h1>
        <nav aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'tab on' : 'tab'} aria-current={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {loadError && <p className="msg bad" role="alert">{loadError} <button className="link" onClick={refresh}>Try again</button></p>}
      {events && events.length === 0 && tab !== 'staff' && (
        <p className="empty">No events yet. Staff can add the first one from the Staff tab.</p>
      )}

      {events && events.length > 1 && (
        <label className="picker">
          Event
          <select value={eventId ?? ''} onChange={(e) => setEventId(Number(e.target.value))}>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}, {fmtDateTime(e.startsAt)}</option>)}
          </select>
        </label>
      )}

      <main>
        {tab === 'tickets' && event && <Tickets event={event} onChange={refresh} />}
        {tab === 'volunteer' && event && <Volunteer event={event} />}
        {tab === 'staff' && <Staff events={events || []} event={event} onChange={refresh} onPick={setEventId} />}
      </main>
    </div>
  );
}
