const STORAGE_KEY = 'peek:ice:events';
const WINDOW_MS = 24 * 60 * 60 * 1000;
const FAILURE_THRESHOLD = 0.05;

function readEvents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeEvents(events) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {}
}

function pruneOld(events) {
  const cutoff = Date.now() - WINDOW_MS;
  return events.filter((e) => e.ts > cutoff);
}

export function recordIceEvent(state) {
  const events = pruneOld(readEvents());
  events.push({ state, ts: Date.now() });
  writeEvents(events);
}

export function getFailureRate() {
  const events = pruneOld(readEvents());
  if (!events.length) return 0;
  const failed = events.filter((e) => e.state === 'failed').length;
  return failed / events.length;
}

export function shouldWarnTurn() {
  return getFailureRate() > FAILURE_THRESHOLD;
}
