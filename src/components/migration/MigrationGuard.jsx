import React from 'react';
import { MigrationService } from '../../lib/migrationService';
import { MigrationModal } from './MigrationModal';
import { useMigration } from '../../context/MigrationContext';
import { useAuth } from '../../context/AuthContext';

export function MigrationGuard({ children }) {
  const { session } = useAuth();
  const {
    migrationState,
    setMigrationState,
    conflictType,
    localDataRef,
    loading,
    dismissedThisSession,
    setDismissedThisSession
  } = useMigration();

  const handleKeepCloud = async () => {
    await MigrationService.setMigrationState('completed');
    setMigrationState('completed');
  };

  const handleReplaceCloud = async () => {
    const result = await MigrationService.replaceCloudData(localDataRef);
    if (result.success) {
      setMigrationState('completed');
    } else {
      setMigrationState('failed');
      alert(`Replacement failed: ${result.message}`);
    }
  };
  
  const handleUpload = async () => {
    const result = await MigrationService.migrateLocalData(localDataRef);
    if (result.success) {
      setMigrationState('completed');
    } else {
      setMigrationState('failed');
      alert(`Upload failed: ${result.message}`);
    }
  };

  const handleCancel = () => {
    setDismissedThisSession(true);
  };

  if (loading) return null;

  const needsAttention = session && (migrationState === 'pending' || migrationState === 'failed') && conflictType;
  const showModal = needsAttention && !dismissedThisSession;

  return (
    <>
      {needsAttention && dismissedThisSession && (
        <div style={{ background: '#ffcc00', color: '#333', padding: '10px', textAlign: 'center', fontWeight: 'bold' }}>
          Action Required: Cloud Data Conflict Detected. 
          <button onClick={() => setDismissedThisSession(false)} style={{ marginLeft: '10px' }}>Resolve Now</button>
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
