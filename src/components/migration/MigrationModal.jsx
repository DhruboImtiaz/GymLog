import React from 'react';

export function MigrationModal({ conflictType, migrationState, actionError, onKeepCloud, onReplaceCloud, onUpload, onCancel }) {
  const isConflict = conflictType === 'Conflict' || conflictType === 'CloudExtraData';

  return (
    <div style={styles.overlay}>
      <div className="migration-modal">
        <h2 style={{ marginTop: 0, fontSize: '1.5rem', marginBottom: '8px', textTransform: 'uppercase' }}>Account Sync Required</h2>
        
        {migrationState === 'failed' && !actionError && (
          <div style={{ background: '#ffcccc', color: '#cc0000', padding: '10px', borderRadius: '4px', marginBottom: '15px' }}>
            <strong>Previous Migration Failed.</strong> Please try again or resolve the conflict.
          </div>
        )}

        {actionError && (
          <div style={{ background: 'var(--danger, #ff4444)', color: '#fff', padding: '10px', borderRadius: '4px', marginBottom: '15px', fontWeight: 'bold' }}>
            {actionError}
          </div>
        )}


        {conflictType === 'LocalOnly' ? (
          <>
            <p>You have local workout data that hasn't been uploaded to your new cloud account.</p>
            <div style={styles.buttonGroup}>
              <button className="btn btn-primary" onClick={onUpload}>Upload to Cloud</button>
            </div>
          </>
        ) : isConflict ? (
          <>
            <h3 style={{ marginTop: 0, color: 'var(--accent)', fontSize: '1.1rem', marginBottom: '20px', fontWeight: '600' }}>Cloud Data Conflict Detected</h3>
            <p style={{ maxWidth: '450px', margin: '0 auto 15px', lineHeight: '1.5' }}>
              We detected existing data in your cloud account that conflicts with your local data.
            </p>
            <p style={{ maxWidth: '450px', margin: '0 auto 30px', lineHeight: '1.5' }}>
              Please choose which data you want to keep.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <button className="btn btn-primary" onClick={onKeepCloud} style={{ width: '100%', padding: '16px', height: 'auto' }}>
                <div className="migration-btn-content">
                  <span className="migration-btn-title">KEEP CLOUD DATA</span>
                  <div className="migration-btn-desc">
                    Your local data will not be uploaded. Cloud is authoritative.
                  </div>
                </div>
              </button>
              
              <button 
                className="btn btn-danger" 
                onClick={() => {
                  if (window.confirm('DESTRUCTIVE ACTION: Are you absolutely sure you want to overwrite your cloud data with your local data? This cannot be undone.')) {
                    onReplaceCloud();
                  }
                }} 
                style={{ width: '100%', padding: '16px', height: 'auto', background: 'var(--danger-color)' }}
              >
                <div className="migration-btn-content">
                  <span className="migration-btn-title">REPLACE CLOUD WITH LOCAL</span>
                  <div className="migration-btn-desc">
                    Destructive — existing cloud data will be permanently overwritten.
                  </div>
                </div>
              </button>
            </div>
          </>
        ) : null}

        <div style={{ marginTop: '30px', textAlign: 'center' }}>
          <button className="btn" onClick={onCancel} style={{ background: 'transparent', color: 'var(--text2)' }}>
            Cancel for Now
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    padding: '20px'
  },
  modal: {
    background: 'var(--bg-secondary)',
    padding: '30px',
    borderRadius: '12px',
    maxWidth: '500px',
    width: '100%',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    color: 'var(--text-primary)'
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '20px'
  },
  conflictActions: {
    marginTop: '20px',
    padding: '15px',
    background: 'var(--bg-primary)',
    borderRadius: '8px'
  },
  btnSubtext: {
    fontSize: '0.8em',
    opacity: 0.8,
    marginTop: '4px',
    fontWeight: 'normal'
  }
};
