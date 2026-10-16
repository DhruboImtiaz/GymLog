import { SupabaseService } from './repository.js';
import { getGymLogData } from '../storage/storage.js';
import { assertCurrentAccount, fingerprint, prepareGymLogData, readMigrationState, readPendingMigration, writeMigrationState } from './syncOperations.js';

export const MigrationService = {
  getMigrationState: readMigrationState,
  getPendingMigration: readPendingMigration,

  acknowledgeGuest: async (userId, localData, isCurrent) => {
    const hash = await fingerprint(prepareGymLogData(localData));
    assertCurrentAccount(userId, isCurrent);
    writeMigrationState(userId, hash);
  },

  determineConflict: async (localData, cloudData) => {
    const local = prepareGymLogData(localData);
    const cloud = prepareGymLogData(cloudData);
    const localHasData = local.days.length || local.measurements.length;
    const cloudHasData = cloud.days.length || cloud.measurements.length;
    if (!localHasData) return cloudHasData ? 'CloudOnly' : 'NoData';
    if (!cloudHasData) return 'LocalOnly';
    return await fingerprint(local) === await fingerprint(cloud) ? 'Matching' : 'Conflict';
  },

  verifyMigration: async (localData, cloudData) => {
    if (await fingerprint(prepareGymLogData(localData)) !== await fingerprint(prepareGymLogData(cloudData))) {
      throw new Error('Cloud data changed while verification was running. Refresh before trying again.');
    }
  },

  runMigration: async ({ localData, userId, expectedVersion, replace = false, isCurrent }) => {
    assertCurrentAccount(userId, isCurrent);
    const key = `gymlog_pending_migration_${userId}`;
    let operation = readPendingMigration(userId);
    const removeOwnPending = () => {
      if (readPendingMigration(userId)?.id === operation.id) localStorage.removeItem(key);
    };
    if (!operation) {
      const payload = prepareGymLogData(localData);
      operation = { id: crypto.randomUUID(), userId, expectedVersion, replace, payload, fingerprint: await fingerprint(payload) };
      assertCurrentAccount(userId, isCurrent);
      // Persist BEFORE sending. A lost response or reload replays the same operation.
      localStorage.setItem(key, JSON.stringify(operation));
    }
    if (await fingerprint(prepareGymLogData(operation.payload)) !== operation.fingerprint) {
      throw new Error('The saved migration failed its integrity check. Your guest data has been preserved.');
    }
    assertCurrentAccount(userId, isCurrent);
    try {
      await SupabaseService.applyMigration(operation, userId);
    } catch (error) {
      // These rejections are definitive: the transaction wrote nothing.
      if (isCurrent() && ['PT409', '40001', '22023', '23505', '23514'].includes(error.code)) removeOwnPending();
      throw error;
    }
    assertCurrentAccount(userId, isCurrent);
    // A transactional receipt proves the write; a later device edit is not upload failure.
    writeMigrationState(userId, operation.fingerprint);
    const guestRaw = localStorage.getItem('gymlog_data');
    const currentGuest = getGymLogData();
    let unchanged = false;
    try { unchanged = await fingerprint(prepareGymLogData(currentGuest)) === operation.fingerprint; } catch { /* Preserve malformed or newly edited guest data. */ }
    assertCurrentAccount(userId, isCurrent);
    if (unchanged && localStorage.getItem('gymlog_data') === guestRaw) localStorage.removeItem('gymlog_data');
    removeOwnPending();
    return { success: true };
  }
};
