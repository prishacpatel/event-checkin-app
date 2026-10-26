import crypto from 'node:crypto';

// QR payload format: "TKT.<ticket uuid>.<signature>". The signature is an HMAC of the id, so a
// guessed or edited code is rejected without touching the database.

const secret = () => process.env.TICKET_SECRET || 'dev-only-secret';

function sign(id) {
  return crypto.createHmac('sha256', secret()).update(id).digest('base64url').slice(0, 22);
}

export function newTicketId() {
  return crypto.randomUUID();
}

export function makeCode(id) {
  return `TKT.${id}.${sign(id)}`;
}

/** Returns the ticket id if the code is genuine, otherwise null. */
export function verifyCode(code) {
  if (typeof code !== 'string') return null;
  const parts = code.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'TKT') return null;
  const [, id, sig] = parts;
  const expected = sign(id);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return id;
}

export function pinMatches(given) {
  const real = process.env.ADMIN_PIN || '';
  if (!real || typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(real);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
