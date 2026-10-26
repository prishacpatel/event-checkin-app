// Scheduling rules for volunteer shifts. Pure functions, no database, so they are easy to test
// and easy to swap for your own Shiftly logic: keep the same function names and signatures.
//
// A shift looks like: { id, role, startsAt, endsAt, capacity, signedUp }
// where startsAt/endsAt are Date objects or ISO strings.

const t = (x) => new Date(x).getTime();

/** True if two shifts overlap in time. Back-to-back shifts (one ends when the next starts) do not. */
export function overlaps(a, b) {
  return t(a.startsAt) < t(b.endsAt) && t(b.startsAt) < t(a.endsAt);
}

/** Shifts in `mine` that clash with `candidate` (ignoring candidate itself). */
export function findConflicts(candidate, mine) {
  return mine.filter((s) => s.id !== candidate.id && overlaps(candidate, s));
}

export function spotsLeft(shift) {
  return Math.max(0, shift.capacity - shift.signedUp);
}

export function isFull(shift) {
  return spotsLeft(shift) === 0;
}

/**
 * Decide whether a volunteer may take a shift.
 * Returns { ok: true } or { ok: false, reason, code }.
 */
export function canSignUp(candidate, mine) {
  if (mine.some((s) => s.id === candidate.id)) {
    return { ok: false, code: 'already_signed_up', reason: 'You are already signed up for this shift.' };
  }
  if (isFull(candidate)) {
    return { ok: false, code: 'full', reason: 'This shift is full.' };
  }
  const clash = findConflicts(candidate, mine)[0];
  if (clash) {
    return { ok: false, code: 'conflict', reason: `This overlaps with your "${clash.role}" shift.` };
  }
  return { ok: true };
}

/**
 * Shifts to nudge a volunteer toward: open, no clash, emptiest first (by fill ratio),
 * ties broken by earliest start.
 */
export function suggestShifts(all, mine, limit = 3) {
  return all
    .filter((s) => canSignUp(s, mine).ok)
    .sort((a, b) => a.signedUp / a.capacity - b.signedUp / b.capacity || t(a.startsAt) - t(b.startsAt))
    .slice(0, limit);
}
