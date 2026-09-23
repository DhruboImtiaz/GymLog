import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGymLogData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { SettingsIcon } from '../components/ui/Icons';
import { esc } from '../utils/helpers';
import { useSettings } from '../context/SettingsContext';
import { BottomNav } from '../components/navigation/BottomNav';
import usePointerReorder from '../hooks/usePointerReorder';

export default function Measurements() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { setIsSettingsOpen } = useSettings();
  const { data, createMeasurement, renameMeasurement, deleteMeasurement, reorderMeasurements } = useGymLogData();

  const measurements = data?.measurements || [];
  const listRef = useRef(null);
  usePointerReorder(listRef, measurements, reorderMeasurements);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addName, setAddName] = useState('');

  const [renameId, setRenameId] = useState(null);
  const [renameName, setRenameName] = useState('');

  const handleCreate = () => {
    const name = addName.trim();
    if (!name) return;
    createMeasurement(name);
    setAddName('');
    setIsAddOpen(false);
    // Mimicking vanilla toast
    alert('Measurement created');
  };

  const handleOpenRename = (e, m) => {
    e.stopPropagation();
    setRenameId(m.id);
    setRenameName(m.name);
  };

  const handleRename = () => {
    const name = renameName.trim();
    if (!name || !renameId) return;
    renameMeasurement(renameId, name);
    setRenameId(null);
    setRenameName('');
    alert('Renamed');
  };

  const handleDelete = async () => {
    if (!renameId) return;
    const ok = window.confirm('Delete this measurement and all its entries?');
    if (!ok) return;
    deleteMeasurement(renameId);
    setRenameId(null);
    alert('Deleted');
  };

  return (
    <div className="page active" style={{ display: 'block' }}>
      <nav className="navbar">
        <span className="nav-brand">GYMLOG</span>
        <div className="nav-right">
          <button className="theme-btn" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button className="settings-btn" aria-label="Settings" title="Settings" onClick={() => setIsSettingsOpen(true)}>
            <SettingsIcon />
          </button>
        </div>
      </nav>

      <div className="content">
        <div className="page-header">
          <div className="page-title">Body Measurements</div>
          <button className="btn btn-primary btn-sm" onClick={() => setIsAddOpen(true)}>+ New</button>
        </div>

        <div id="measurementsList" ref={listRef}>
          {measurements.length === 0 ? (
            <div className="empty">
              <div className="empty-title">No Measurements Yet</div>
              <p className="empty-text">Track body metrics by adding a measurement type.</p>
              <button className="btn btn-primary btn-lg" onClick={() => setIsAddOpen(true)}>Create First Measurement</button>
            </div>
          ) : (
            measurements.map(m => (
              <div className="card" key={m.id} onClick={() => navigate(`/measurements/${m.id}`)}>
                <div className="card-row card-clickable">
                  <div className="card-drag-handle" onClick={e => e.stopPropagation()} title="Hold and drag to move up or down">
                    <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor">
                      <circle cx="4" cy="3" r="1.5"/><circle cx="10" cy="3" r="1.5"/>
                      <circle cx="4" cy="9" r="1.5"/><circle cx="10" cy="9" r="1.5"/>
                      <circle cx="4" cy="15" r="1.5"/><circle cx="10" cy="15" r="1.5"/>
                    </svg>
                  </div>
                  <div className="card-icon">{esc(m.name.slice(0,2).toUpperCase())}</div>
                  <div className="card-body">
                    <div className="card-title">{esc(m.name)}</div>
                    <div className="card-meta">
                      {(m.entries || []).length} entr{(m.entries || []).length !== 1 ? 'ies' : 'y'}
                    </div>
                  </div>
                  <div className="card-right-actions">
                    <button 
                      className="card-edit-btn" 
                      onClick={(e) => handleOpenRename(e, m)} 
                      title="Edit Measurement"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                      </svg>
                      <span>Edit</span>
                    </button>
                    <div className="card-chevron">›</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <BottomNav />

      {/* Add Modal */}
      {isAddOpen && (
        <div className="modal-overlay open">
          <div className="modal-box">
            <div className="modal-title">New Measurement</div>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. Weight, Body Fat %" 
              value={addName}
              onChange={e => setAddName(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setIsAddOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameId !== null && (
        <div className="modal-overlay open">
          <div className="modal-box">
            <div className="modal-title">Rename Measurement</div>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Measurement Name" 
              value={renameName}
              onChange={e => setRenameName(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setRenameId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
              <button className="btn btn-primary" onClick={handleRename}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
