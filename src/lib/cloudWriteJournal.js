import { assertCurrentAccount, fingerprint } from './syncOperations.js';
import { SupabaseService } from './repository.js';

const prefix = userId => `gymlog_pending_write_${userId}_`;
const keyFor = operation => prefix(operation.userId) + operation.id;

export function readPendingWrites(userId) {
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix(userId))) continue;
    const value = JSON.parse(localStorage.getItem(key));
    if (value?.userId !== userId || !value.id || keyFor(value) !== key || !value.action || !value.payload || !value.expectedVersion || !value.fingerprint || !['prepared', 'acknowledged'].includes(value.phase)) {
      throw new Error('A saved change is invalid. Export your data before repairing browser storage.');
    }
    entries.push(value);
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

export async function prepareCloudWrite(descriptor, userId, expectedVersion, isCurrent) {
  if (!expectedVersion) throw new Error('Refresh your cloud data before saving.');
  const operation = { id: crypto.randomUUID(), userId, expectedVersion, action: descriptor.action, payload: descriptor.payload, phase: 'prepared' };
  operation.fingerprint = await fingerprint({ action: operation.action, payload: operation.payload, expectedVersion });
  assertCurrentAccount(userId, isCurrent);
  // Separate keys ensure two tabs cannot overwrite each other's recovery record.
  localStorage.setItem(keyFor(operation), JSON.stringify(operation));
  return operation;
}

export function forgetCloudWrite(operation) { localStorage.removeItem(keyFor(operation)); }
export function acknowledgeCloudWrite(operation) {
  localStorage.setItem(keyFor(operation), JSON.stringify({ ...operation, phase: 'acknowledged' }));
}

export async function executeCloudWrite(operation, isCurrent) {
  const hash = await fingerprint({ action: operation.action, payload: operation.payload, expectedVersion: operation.expectedVersion });
  if (hash !== operation.fingerprint) throw new Error('The saved change failed its integrity check. It has been preserved.');
  assertCurrentAccount(operation.userId, isCurrent);
  if (operation.phase === 'acknowledged') return;
  const p = operation.payload;
  if (operation.action === 'save_session') {
    return SupabaseService.saveSession(p.exerciseId, p.logDate, p.sets, operation.userId, p.datasetGeneration);
  }
  if (operation.action === 'restore') {
    return SupabaseService.replaceGymLogData(p, operation.userId, operation.expectedVersion, operation.id);
  }
  return SupabaseService.mutateGymLogData(operation, operation.userId);
}

export function isDefinitiveRejection(error) {
  // Network/transport failures have no SQLSTATE. Never discard their retry identity.
  return error.code === 'PT409' || (typeof error.code === 'string' && /^(22|23|40|42)[A-Z0-9]{3}$/.test(error.code));
}
