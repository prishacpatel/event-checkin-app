import test from 'node:test';
import assert from 'node:assert/strict';
import { overlaps, findConflicts, canSignUp, suggestShifts, spotsLeft } from '../src/scheduling.js';

const shift = (id, start, end, capacity = 2, signedUp = 0, role = `Role ${id}`) =>
  ({ id, role, startsAt: `2026-11-01T${start}:00Z`, endsAt: `2026-11-01T${end}:00Z`, capacity, signedUp });

test('overlap detection', () => {
  assert.ok(overlaps(shift(1, '10:00', '12:00'), shift(2, '11:00', '13:00')));
  assert.ok(overlaps(shift(1, '10:00', '14:00'), shift(2, '11:00', '12:00')));   // contained
  assert.ok(!overlaps(shift(1, '10:00', '12:00'), shift(2, '12:00', '14:00')));  // back to back is fine
  assert.ok(!overlaps(shift(1, '10:00', '11:00'), shift(2, '12:00', '13:00')));
});

test('findConflicts ignores the candidate itself', () => {
  const a = shift(1, '10:00', '12:00');
  assert.deepEqual(findConflicts(a, [a]), []);
});

test('canSignUp: ok, full, conflict, duplicate', () => {
  const open = shift(1, '10:00', '12:00', 2, 1);
  assert.deepEqual(canSignUp(open, []), { ok: true });
  assert.equal(canSignUp(shift(2, '10:00', '12:00', 2, 2), []).code, 'full');
  assert.equal(canSignUp(open, [shift(3, '11:00', '13:00')]).code, 'conflict');
  assert.equal(canSignUp(open, [open]).code, 'already_signed_up');
});

test('spotsLeft never goes negative', () => {
  assert.equal(spotsLeft(shift(1, '10:00', '11:00', 2, 5)), 0);
});

test('suggestShifts prefers emptiest open shifts and skips clashes and full shifts', () => {
  const mine = [shift(9, '10:00', '12:00')];
  const all = [
    shift(1, '11:00', '13:00', 4, 0),   // clashes with mine
    shift(2, '12:00', '14:00', 4, 3),   // 75% full
    shift(3, '12:00', '14:00', 4, 1),   // 25% full
    shift(4, '15:00', '16:00', 2, 2),   // full
    shift(5, '15:00', '16:00', 4, 2),   // 50% full
  ];
  assert.deepEqual(suggestShifts(all, mine).map((s) => s.id), [3, 5, 2]);
});
