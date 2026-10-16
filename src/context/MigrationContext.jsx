import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { MigrationService } from '../lib/migrationService';
import { SupabaseService } from '../lib/repository';
import { getGymLogData } from '../storage/storage';
import { fingerprint, prepareGymLogData } from '../lib/syncOperations';
import { useAuth } from './AuthContext';

const MigrationContext = createContext();

export function MigrationProvider({ children }) {
  const { user, loading: authLoading, identityRef, identityEpoch } = useAuth();
  const [migrationState, setMigrationState] = useState('pending');
  const [conflictType, setConflictType] = useState(null);
  const [localDataRef, setLocalDataRef] = useState(null);
  const [cloudVersion, setCloudVersion] = useState(null);
  const [migrationUserId, setMigrationUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);
  const evaluationRef = useRef(0);
  const actionRef = useRef(null);

  const evaluateMigration = useCallback(async () => {
    const { userId, epoch } = identityRef.current;
    const sequence = ++evaluationRef.current;
    const isCurrent = () => identityRef.current.userId === userId && identityRef.current.epoch === epoch && evaluationRef.current === sequence;
    setLoading(true);
    setError(null);
    setConflictType(null);
    setMigrationUserId(userId);
    if (!userId) {
      setMigrationState('none');
      setLocalDataRef(null);
      setLoading(false);
      return;
    }
    setMigrationState('pending');
    try {
      const pending = MigrationService.getPendingMigration(userId);
      const local = getGymLogData();
      if (pending) {
        // Recovery uses its validated journal even if guest data was later changed/corrupted.
        setLocalDataRef(local);
        setConflictType('Recovery');
        return;
      }
      if (!local) throw new Error('Guest data is malformed. It has been preserved; export it before repairing it.');
      const localHash = await fingerprint(prepareGymLogData(local));
      if (!isCurrent()) return;
      setLocalDataRef(local);
      if (MigrationService.getMigrationState(userId, localHash) === 'completed') {
        setMigrationState('completed');
        return;
      }
      const cloud = await SupabaseService.fetchGymLogData(userId);
      if (!isCurrent()) return;
      setCloudVersion(cloud._version);
      const conflict = await MigrationService.determineConflict(local, cloud);
      if (!isCurrent()) return;
      setConflictType(conflict);
      if (['NoData', 'CloudOnly', 'Matching'].includes(conflict)) {
        await MigrationService.acknowledgeGuest(userId, local, isCurrent);
        if (isCurrent()) setMigrationState('completed');
      }
    } catch (e) {
      if (isCurrent()) { setMigrationState('failed'); setError(e.message); }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [identityRef]);

  useEffect(() => {
    if (authLoading) return;
    actionRef.current = null;
    setBusy(false);
    setDismissedThisSession(false);
    evaluateMigration();
    return () => { evaluationRef.current++; };
  }, [user?.id, identityEpoch, authLoading, evaluateMigration]);

  useEffect(() => {
    const onStorage = event => {
      const userId = identityRef.current.userId;
      const affectsMigration = !event.key || event.key === 'gymlog_data' || event.key === `gymlog_migration_status_${userId}` || event.key === `gymlog_pending_migration_${userId}`;
      if (affectsMigration && !actionRef.current) evaluateMigration();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [evaluateMigration, identityRef]);

  const resolveMigration = useCallback(async mode => {
    if (actionRef.current) return;
    const { userId, epoch } = identityRef.current;
    if (!userId || migrationUserId !== userId) return;
    const action = { userId, epoch };
    actionRef.current = action;
    ++evaluationRef.current;
    const isCurrent = () => identityRef.current.userId === userId && identityRef.current.epoch === epoch && actionRef.current === action;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'keep') {
        if (MigrationService.getPendingMigration(userId)) throw new Error('Resume the previous migration before choosing another action.');
        await MigrationService.acknowledgeGuest(userId, localDataRef, isCurrent);
      } else {
        await MigrationService.runMigration({ localData: localDataRef, userId, expectedVersion: cloudVersion, replace: mode === 'replace', isCurrent });
      }
      if (isCurrent()) await evaluateMigration();
    } catch (e) {
      if (isCurrent()) {
        // Refresh a stale preview, while preserving an uncertain operation for replay.
        await evaluateMigration();
        if (isCurrent()) { setMigrationState('failed'); setError(e.message); }
      }
    } finally {
      if (isCurrent()) { actionRef.current = null; setBusy(false); }
    }
  }, [identityRef, migrationUserId, localDataRef, cloudVersion, evaluateMigration]);

  const value = { migrationState, migrationUserId, conflictType, localDataRef, loading, busy, error,
    dismissedThisSession, setDismissedThisSession, resolveMigration, retryEvaluation: evaluateMigration };
  return <MigrationContext.Provider value={value}>{children}</MigrationContext.Provider>;
}

export function useMigration() { return useContext(MigrationContext); }
