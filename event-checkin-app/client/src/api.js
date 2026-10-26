export async function api(path, { method = 'GET', body, pin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (pin) headers['x-admin-pin'] = pin;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Try again.');
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function useSaved(key, initial = '') {
  const read = () => { try { return localStorage.getItem(key) ?? initial; } catch { return initial; } };
  return [read, (v) => { try { localStorage.setItem(key, v); } catch { /* private mode */ } }];
}
