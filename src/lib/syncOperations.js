import { deepValidateBackup } from '../utils/restore.js';

// Canonical input is validated before any destructive request or journal write.
export function prepareGymLogData(data) {
  deepValidateBackup(data);
  const date = value => value.slice(0, 10);
  const byDateId = (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
  const sets = (values, active = false) => (values || []).map(s => ({
    ...(active ? { id: s.id } : {}), num: s.num, reps: s.reps, weight: s.weight
  })).sort((a, b) => a.num - b.num || (a.id || '').localeCompare(b.id || ''));
  return {
    days: data.days.map(day => ({
      id: day.id, name: day.name, createdAt: date(day.createdAt),
      exercises: day.exercises.map(ex => ({
        id: ex.id, name: ex.name, sets: sets(ex.sets, true),
        history: (ex.history || []).map(h => ({ id: h.id, date: date(h.date), sets: sets(h.sets) })).sort(byDateId)
      }))
    })),
    measurements: data.measurements.map(m => ({
      id: m.id, name: m.name, createdAt: date(m.createdAt),
      entries: (m.entries || []).map(e => ({ id: e.id, date: date(e.date), value: e.value, unit: e.unit })).sort(byDateId)
    }))
  };
}

export async function fingerprint(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function assertCurrentAccount(userId, isCurrent) {
  if (!userId || !isCurrent()) throw new Error('Your account changed. Please try again in the current account.');
}

export function readPendingMigration(userId) {
  const raw = localStorage.getItem(`gymlog_pending_migration_${userId}`);
  if (!raw) return null;
  const operation = JSON.parse(raw);
  if (operation.userId !== userId || !operation.id || !operation.fingerprint || !operation.expectedVersion || typeof operation.replace !== 'boolean') {
    throw new Error('The saved migration is invalid. Export your guest data before resetting migration recovery.');
  }
  prepareGymLogData(operation.payload);
  return operation;
}

export function readMigrationState(userId, guestFingerprint) {
  const raw = localStorage.getItem(`gymlog_migration_status_${userId}`);
  try {
    const record = JSON.parse(raw);
    return record?.state === 'completed' && record.fingerprint === guestFingerprint ? 'completed' : 'pending';
  } catch {
    return 'pending';
  }
}

export function writeMigrationState(userId, guestFingerprint) {
  localStorage.setItem(`gymlog_migration_status_${userId}`, JSON.stringify({ state: 'completed', fingerprint: guestFingerprint }));
}
