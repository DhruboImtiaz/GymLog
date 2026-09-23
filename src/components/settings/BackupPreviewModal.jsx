import React from 'react';
import { executeRestore } from '../../utils/restore';

export default function BackupPreviewModal({ backup, onClose }) {
  if (!backup) return null;

  const handleConfirm = () => {
    try {
      executeRestore(backup);
      onClose(); // In reality, executeRestore triggers window.location.reload() on success
    } catch (error) {
      alert(error.message);
      onClose();
    }
  };

  let dtStr = 'Unknown';
  if (backup.metadata.createdAt) {
    const d = new Date(backup.metadata.createdAt);
    if (!isNaN(d.getTime())) {
      dtStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + '\n' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
  }

  let parsedData = {};
  if (backup.data['gymlog_data']) {
    try {
      parsedData = JSON.parse(backup.data['gymlog_data']);
    } catch (e) {}
  }

  const daysCount = (parsedData.days || []).length;
  let exCount = 0;
  let histCount = 0;
  (parsedData.days || []).forEach(day => {
    exCount += (day.exercises || []).length;
    (day.exercises || []).forEach(ex => {
      histCount += (ex.history || []).length;
    });
  });

  let measCount = 0;
  (parsedData.measurements || []).forEach(m => {
    measCount += (m.entries || []).length;
  });

  const theme = backup.data['gymlog_theme'] || 'Unknown';
  const appVer = backup.metadata.appVersion || 'Unknown';
  const schemaVer = backup.metadata.schemaVersion !== undefined ? backup.metadata.schemaVersion : 'Unknown';

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target.classList.contains('modal-overlay')) onClose(); }}>
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">GymLog Backup</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text2)' }}>Created</span>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', textAlign: 'right', whiteSpace: 'pre-line' }}>{dtStr}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text2)' }}>App Version</span>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', textAlign: 'right' }}>{appVer}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text2)' }}>Schema Version</span>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', textAlign: 'right' }}>{schemaVer}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text2)' }}>Workout Days</span>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', textAlign: 'right' }}>{daysCount}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text2)' }}>Exercises</span>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', textAlign: 'right' }}>{exCount}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text2)' }}>History</span>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', textAlign: 'right' }}>{histCount} Sessions</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text2)' }}>Measurements</span>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', textAlign: 'right' }}>{measCount} Entries</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text2)' }}>Theme</span>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', textAlign: 'right' }}>{theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
          </div>
        </div>

        <div className="section-header" style={{ marginTop: '0' }}>
          <span className="section-title" style={{ color: 'var(--red)' }}>Warning</span>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
          Restoring this backup will <strong>permanently replace</strong> your current data. This action cannot be undone.
        </p>

        <div className="modal-actions" style={{ marginTop: '0' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={handleConfirm}>Confirm Restore</button>
        </div>
      </div>
    </div>
  );
}
