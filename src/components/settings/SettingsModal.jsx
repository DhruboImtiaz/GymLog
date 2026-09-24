import React, { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useFont } from '../../context/FontContext';
import { generateBackup } from '../../utils/backup';
import { triggerFilePicker, readFileAsText } from '../../utils/helpers';
import { validateBackupFile } from '../../utils/restore';
import BackupPreviewModal from './BackupPreviewModal';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function SettingsModal() {
  const { isSettingsOpen, setIsSettingsOpen } = useSettings();
  const { fontSize, setFontSize } = useFont();
  const [pendingBackup, setPendingBackup] = useState(null);

  if (!isSettingsOpen) return null;

  const handleBackup = () => {
    try {
      generateBackup();
      alert('Backup created successfully.');
    } catch (e) {
      alert('Failed to generate backup.');
    }
  };

  const handleRestore = async () => {
    try {
      const file = await triggerFilePicker('.json');
      if (!file) return; // Cancelled

      const text = await readFileAsText(file);
      const { backup } = validateBackupFile(file, text);
      
      setPendingBackup(backup);
    } catch (error) {
      alert(error.message);
    }
  };

  const percent = Math.round((fontSize / 16) * 100);

  return (
    <>
      <div className="modal-overlay open" onClick={(e) => { if (e.target.classList.contains('modal-overlay')) setIsSettingsOpen(false); }}>
        <div className="modal-box">
          <div className="modal-header">
            <span className="modal-title">Settings</span>
            <button className="modal-close" onClick={() => setIsSettingsOpen(false)}>×</button>
          </div>
          
          <div className="section-header" style={{ marginTop: '0' }}>
            <span className="section-title">Appearance</span>
          </div>
          
          <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)' }}>Font Size</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginTop: '2px' }}>Adjust text and interface scale</div>
              </div>
              <span id="fontSizeDisplay" style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--accent)', background: 'var(--adim)', padding: '0.2rem 0.55rem', borderRadius: 'var(--r3)' }}>
                {percent}%
              </span>
            </div>

            {/* Presets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.35rem', marginBottom: '0.85rem' }}>
              <button className="btn btn-xs btn-secondary" onClick={() => setFontSize(12)}>XS</button>
              <button className="btn btn-xs btn-secondary" onClick={() => setFontSize(14)}>Small</button>
              <button className="btn btn-xs btn-secondary" onClick={() => setFontSize(16)}>Default</button>
              <button className="btn btn-xs btn-secondary" onClick={() => setFontSize(18)}>Large</button>
              <button className="btn btn-xs btn-secondary" onClick={() => setFontSize(20)}>XL</button>
            </div>

            {/* Slider Control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text3)' }}>A</span>
              <input type="range" min="12" max="22" step="1" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value, 10))} style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }} />
              <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>A</span>
            </div>
          </div>

          <div className="section-header">
            <span className="section-title">Data</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="card" style={{ marginBottom: '0', padding: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.4rem', color: 'var(--text)' }}>Backup Data</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text2)', marginBottom: '0.85rem' }}>Create a complete backup of all GymLog data.</div>
              <button className="btn btn-primary btn-full" onClick={handleBackup}>Backup</button>
            </div>
            <div className="card" style={{ marginBottom: '0', padding: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.4rem', color: 'var(--text)' }}>Restore Backup</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text2)', marginBottom: '0.85rem' }}>Restore a previously created GymLog backup.</div>
              <button className="btn btn-secondary btn-full" onClick={handleRestore}>Restore</button>
            </div>
          </div>
          
          <div className="section-header">
            <span className="section-title">Account (Cloud Sync)</span>
          </div>
          <div className="card" style={{ marginBottom: '0', padding: '1rem' }}>
            <AuthSection />
          </div>
        </div>
      </div>

      {pendingBackup && (
        <BackupPreviewModal backup={pendingBackup} onClose={() => setPendingBackup(null)} />
      )}
    </>
  );
}

// Subcomponent to handle Auth display
function AuthSection() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { setIsSettingsOpen } = useSettings();

  const handleLoginClick = () => {
    setIsSettingsOpen(false);
    navigate('/auth');
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (e) {
      alert('Failed to sign out: ' + e.message);
    }
  };

  if (user) {
    return (
      <>
        <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.4rem', color: 'var(--text)' }}>Logged in as</div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text2)', marginBottom: '0.85rem', wordBreak: 'break-all' }}>{user.email}</div>
        <button className="btn btn-secondary btn-full" onClick={handleLogout}>Log Out</button>
      </>
    );
  }

  return (
    <>
      <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.4rem', color: 'var(--text)' }}>Sync to Cloud</div>
      <div style={{ fontSize: '0.875rem', color: 'var(--text2)', marginBottom: '0.85rem' }}>Log in to access your data across devices.</div>
      <button className="btn btn-primary btn-full" onClick={handleLoginClick}>Login / Sign Up</button>
    </>
  );
}
