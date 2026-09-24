import React from 'react';

export function MigrationModal({ conflictType, migrationState, onKeepCloud, onReplaceCloud, onUpload, onCancel }) {
  const isConflict = conflictType === 'Conflict' || conflictType === 'CloudExtraData';

  return (
    <div style={styles.overlay}>
      <div style={styles.modal} className="content">
        <h2 style={{ marginTop: 0 }}>Account Sync Required</h2>
        
        {migrationState === 'failed' && (
          <div style={{ background: '#ffcccc', color: '#cc0000', padding: '10px', borderRadius: '4px', marginBottom: '15px' }}>
            <strong>Previous Migration Failed.</strong> Please try again or resolve the conflict.
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
            <p><strong>Cloud Data Conflict Detected</strong></p>
            <p>We detected existing data in your cloud account that conflicts with your local data.</p>
            <p>Please choose which data you want to keep. Stage 5D will use your choice as the authoritative source of truth.</p>
            
            <div style={styles.conflictActions}>
              <button className="btn btn-primary" onClick={onKeepCloud} style={{ width: '100%', marginBottom: '10px' }}>
                Keep Cloud Data
                <div style={styles.btnSubtext}>(Your local data will not be uploaded, cloud is authoritative)</div>
              </button>
              
              <button 
                className="btn btn-danger" 
                onClick={() => {
                  if (window.confirm('DESTRUCTIVE ACTION: Are you absolutely sure you want to overwrite your cloud data with your local data? This cannot be undone.')) {
                    onReplaceCloud();
                  }
                }} 
                style={{ width: '100%', marginBottom: '10px', background: 'var(--danger-color)' }}
              >
                Replace Cloud With Local
                <div style={styles.btnSubtext}>(DESTRUCTIVE: Existing cloud data will be permanently overwritten)</div>
              </button>
            </div>
          </>
        ) : null}

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button className="btn" onClick={onCancel} style={{ background: 'transparent', color: 'var(--text-secondary)' }}>
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
