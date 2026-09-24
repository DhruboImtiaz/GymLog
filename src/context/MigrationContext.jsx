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

  const evaluateMigration = useCallback(async (currentSession) => {
    if (!currentSession) {
      setMigrationState('pending');
      setConflictType(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const state = await MigrationService.getMigrationState();
      setMigrationState(state);

      if (state === 'pending' || state === 'failed') {
        const localData = getGymLogData() || { days: [], measurements: [] };
        setLocalDataRef(localData);
        const cloudData = await SupabaseService.fetchGymLogData();
        
        const conflict = await MigrationService.determineConflict(localData, cloudData);
        setConflictType(conflict);

        if (conflict === 'NoData' || conflict === 'CloudOnly' || conflict === 'Matching') {
          // Auto-resolve safe scenarios
          await MigrationService.setMigrationState('completed');
          setMigrationState('completed');
        }
      }
    } catch (e) {
      console.error('Migration evaluation failed', e);
    } finally {
      setLoading(false);
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
