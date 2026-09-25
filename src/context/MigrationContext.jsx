import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { MigrationService } from '../lib/migrationService';
import { SupabaseService } from '../lib/repository';
import { getGymLogData } from '../storage/storage';

const MigrationContext = createContext();

export function MigrationProvider({ children }) {
  const [migrationState, setMigrationState] = useState('pending');
  const [conflictType, setConflictType] = useState(null);
  const [localDataRef, setLocalDataRef] = useState(null);
  const [loading, setLoading] = useState(true);

  // Expose this so MigrationGuard can hide itself if dismissed
  const [dismissedThisSession, setDismissedThisSession] = useState(false);

  const currentSessionUserIdRef = React.useRef(null);

  const evaluateMigration = useCallback(async (currentSession) => {
    currentSessionUserIdRef.current = currentSession?.user?.id || null;
    const requestId = currentSessionUserIdRef.current;

    if (!currentSession) {
      setMigrationState('none');
      setConflictType(null);
      setLocalDataRef(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const state = await MigrationService.getMigrationState();
      if (currentSessionUserIdRef.current !== requestId) return;

      setMigrationState(state);

      if (state === 'pending' || state === 'failed') {
        const localData = getGymLogData() || { days: [], measurements: [] };
        if (currentSessionUserIdRef.current !== requestId) return;
        setLocalDataRef(localData);

        const cloudData = await SupabaseService.fetchGymLogData();
        if (currentSessionUserIdRef.current !== requestId) return;

        const conflict = await MigrationService.determineConflict(localData, cloudData);
        if (currentSessionUserIdRef.current !== requestId) return;

        setConflictType(conflict);

        if (conflict === 'NoData' || conflict === 'CloudOnly' || conflict === 'Matching') {
          // Auto-resolve safe scenarios
          await MigrationService.setMigrationState('completed');
          if (currentSessionUserIdRef.current !== requestId) return;
          setMigrationState('completed');
        }
      }
    } catch (e) {
      if (currentSessionUserIdRef.current !== requestId) return;
      console.error('Migration evaluation failed', e);
    } finally {
      if (currentSessionUserIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      evaluateMigration(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setDismissedThisSession(false);
      evaluateMigration(session);
    });

    return () => subscription?.unsubscribe();
  }, [evaluateMigration]);

  const value = {
    migrationState,
    setMigrationState,
    conflictType,
    localDataRef,
    loading,
    dismissedThisSession,
    setDismissedThisSession
  };

  return <MigrationContext.Provider value={value}>{children}</MigrationContext.Provider>;
}

export function useMigration() {
  return useContext(MigrationContext);
}
