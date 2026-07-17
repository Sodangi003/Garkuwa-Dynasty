// Simple in-memory brute-force guard. Good enough for a single-instance
// family site. If you ever run multiple server instances behind a load
// balancer, move this to a shared store (Redis, etc.) so lockouts are
// consistent across instances.

const attempts = new Map(); // username -> { count, lockedUntil }
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes

function isLocked(username) {
  const rec = attempts.get(username);
  if (!rec || !rec.lockedUntil) return false;
  if (rec.lockedUntil > Date.now()) return true;
  attempts.delete(username); // lock has expired
  return false;
}

function msUntilUnlock(username) {
  const rec = attempts.get(username);
  if (!rec || !rec.lockedUntil) return 0;
  return Math.max(0, rec.lockedUntil - Date.now());
}

function recordFailure(username) {
  const rec = attempts.get(username) || { count: 0 };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCK_MS;
  }
  attempts.set(username, rec);
}

function recordSuccess(username) {
  attempts.delete(username);
}

module.exports = { isLocked, msUntilUnlock, recordFailure, recordSuccess };
