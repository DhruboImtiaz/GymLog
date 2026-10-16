import React from 'react';
import { MigrationModal } from './MigrationModal';
import { useMigration } from '../../context/MigrationContext';
import { useAuth } from '../../context/AuthContext';

export function MigrationGuard({ children }) {
  const { session } = useAuth();
  const { migrationState, conflictType, loading, busy, error, dismissedThisSession,
    setDismissedThisSession, resolveMigration, retryEvaluation } = useMigration();
  if (loading) return null;
  const needsAttention = session && migrationState !== 'completed';
  return <>
    {needsAttention && dismissedThisSession && <div role="status" style={{ background: '#ffcc00', color: '#333', padding: '10px', textAlign: 'center' }}>
      Account sync needs attention. <button onClick={() => setDismissedThisSession(false)}>Resolve Now</button>
    </div>}
    {children}
    {needsAttention && !dismissedThisSession && <MigrationModal
      conflictType={conflictType} migrationState={migrationState} actionError={error} busy={busy}
      onKeepCloud={() => resolveMigration('keep')} onReplaceCloud={() => resolveMigration('replace')}
      onUpload={() => resolveMigration('upload')} onRetry={retryEvaluation}
      onCancel={() => setDismissedThisSession(true)} />}
  </>;
}
