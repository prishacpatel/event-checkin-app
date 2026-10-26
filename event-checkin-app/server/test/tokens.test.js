import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCode, verifyCode, newTicketId, pinMatches } from '../src/tokens.js';

process.env.TICKET_SECRET = 'test-secret';
process.env.ADMIN_PIN = '1234';

test('a genuine code verifies and returns the id', () => {
  const id = newTicketId();
  assert.equal(verifyCode(makeCode(id)), id);
});

test('edited or malformed codes are rejected', () => {
  const id = newTicketId();
  const code = makeCode(id);
  assert.equal(verifyCode(code.slice(0, -2) + 'xx'), null);
  assert.equal(verifyCode(`TKT.${newTicketId()}.${code.split('.')[2]}`), null);
  assert.equal(verifyCode('hello'), null);
  assert.equal(verifyCode(undefined), null);
});

test('pin check', () => {
  assert.ok(pinMatches('1234'));
  assert.ok(!pinMatches('12345'));
  assert.ok(!pinMatches(undefined));
});
