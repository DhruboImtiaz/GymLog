import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { MigrationService } from '../../lib/migrationService';
import { SupabaseService } from '../../lib/repository';
import { getGymLogData } from '../../storage/storage';
import { MigrationModal } from './MigrationModal';

export function MigrationGuard({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [migrationState, setMigrationState] = useState('completed');
  const [conflictType, setConflictType] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [localDataRef, setLocalDataRef] = useState(null);
  
  // Track whether the user explicitly dismissed the modal this session
  const [dismissedThisSession, setDismissedThisSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      evaluateMigration(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setDismissedThisSession(false); // Reset on auth change
      evaluateMigration(session);
    });

    return () => subscription?.unsubscribe();
  }, []);

  const evaluateMigration = async (currentSession) => {
    if (!currentSession) {
      setLoading(false);
      return;
    }

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
        } else {
          // Needs user intervention ('LocalOnly', 'Conflict', 'CloudExtraData')
          if (!dismissedThisSession) {
             setShowModal(true);
          }
        }
      }
    } catch (e) {
      console.error('Migration evaluation failed', e);
    } finally {
      setLoading(false);
    }
  };

  const handleKeepCloud = async () => {
    // Stage 5C simply marks it completed. Cloud is authoritative.
    await MigrationService.setMigrationState('completed');
    setMigrationState('completed');
    setShowModal(false);
  };

  const handleReplaceCloud = async () => {
    const result = await MigrationService.replaceCloudData(localDataRef);
    if (result.success) {
      setMigrationState('completed');
      setShowModal(false);
    } else {
      setMigrationState('failed');
      alert(`Replacement failed: ${result.message}`);
    }
  };
  
  const handleUpload = async () => {
    const result = await MigrationService.migrateLocalData(localDataRef);
    if (result.success) {
      setMigrationState('completed');
      setShowModal(false);
    } else {
      setMigrationState('failed');
      alert(`Upload failed: ${result.message}`);
    }
  };

  const handleCancel = () => {
    setShowModal(false);
    setDismissedThisSession(true);
  };

  if (loading) return null; // Or a subtle spinner

  const needsAttention = session && (migrationState === 'pending' || migrationState === 'failed') && conflictType;

  return (
    <>
      {needsAttention && (
        <div style={{ background: '#ffcc00', color: '#333', padding: '10px', textAlign: 'center', fontWeight: 'bold' }}>
          Action Required: Cloud Data Conflict Detected. 
          <button onClick={() => setShowModal(true)} style={{ marginLeft: '10px' }}>Resolve Now</button>
        </div>
      )}
      
      {children}

      {showModal && (
        <MigrationModal 
          conflictType={conflictType} 
          migrationState={migrationState}
          onKeepCloud={handleKeepCloud}
          onReplaceCloud={handleReplaceCloud}
          onUpload={handleUpload}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
