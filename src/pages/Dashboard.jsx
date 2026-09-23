import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGymLogData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { SettingsIcon, EditIcon, DragHandleIcon } from '../components/ui/Icons';
import { esc } from '../utils/helpers';

export default function Dashboard() {
  const { data, createDay, renameDay, deleteDay } = useGymLogData();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newDayName, setNewDayName] = useState('');

  const [renamingDayId, setRenamingDayId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const h = new Date().getHours();
  const greeting = (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') + ' — let\'s train';

  const handleCreate = () => {
    if (newDayName.trim()) {
      createDay(newDayName.trim());
      setNewDayName('');
      setIsCreateOpen(false);
    }
  };

  const handleRename = () => {
    if (renameValue.trim() && renamingDayId) {
      renameDay(renamingDayId, renameValue.trim());
      setRenamingDayId(null);
    }
  };

  const handleDelete = () => {
    if (confirmDeleteId) {
      deleteDay(confirmDeleteId);
      setConfirmDeleteId(null);
      setRenamingDayId(null);
    }
  };

  return (
    <div className="page active" style={{ display: 'block' }}>
      <nav className="navbar">
        <span className="nav-brand" onClick={() => navigate('/')}>GYMLOG</span>
        <div className="nav-right">
          <button className="theme-btn" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button className="settings-btn" aria-label="Settings" title="Settings">
            <SettingsIcon />
          </button>
        </div>
      </nav>

      <div className="content">
        <div className="page-header">
          <div className="page-header-left">
            <div className="page-title">My Workouts</div>
            <div className="page-sub">{greeting}</div>
          </div>
          <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>+ New Day</button>
        </div>

        <div id="daysList">
          {(!data || data.days.length === 0) ? (
            <div className="empty">
              <div className="empty-title">No Workout Days Yet</div>
              <p className="empty-text">Create your first workout day to start tracking your training.</p>
              <button className="btn btn-primary btn-lg" onClick={() => setIsCreateOpen(true)}>Create First Day</button>
            </div>
          ) : (
            data.days.map(d => (
              <div className="card" key={d.id}>
                <div className="card-row card-clickable" onClick={() => navigate(`/day/${d.id}`)}>
                  <div className="card-drag-handle" onClick={(e) => e.stopPropagation()} title="Hold and drag to move up or down">
                    <DragHandleIcon />
                  </div>
                  <div className="card-icon">{esc(d.name.slice(0, 2).toUpperCase())}</div>
                  <div className="card-body">
                    <div className="card-title">{esc(d.name)}</div>
                    <div className="card-meta">{(d.exercises || []).length} exercise{(d.exercises || []).length !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="card-right-actions">
                    <button className="card-edit-btn" onClick={(e) => {
                      e.stopPropagation();
                      setRenameValue(d.name);
                      setRenamingDayId(d.id);
                    }} title="Edit Day">
                      <EditIcon />
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

      {/* Create Modal */}
      {isCreateOpen && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target.classList.contains('modal-overlay')) setIsCreateOpen(false); }}>
          <div className="modal-box">
            <div className="modal-header">
              <span className="modal-title">New Workout Day</span>
              <button className="modal-close" onClick={() => setIsCreateOpen(false)}>×</button>
            </div>
            <div className="form-group">
              <label className="form-label">Day Name</label>
              <input type="text" className="form-input" placeholder="e.g. Push Day, Leg Day..." value={newDayName} onChange={(e) => setNewDayName(e.target.value)} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setIsCreateOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renamingDayId && !confirmDeleteId && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target.classList.contains('modal-overlay')) setRenamingDayId(null); }}>
          <div className="modal-box">
            <div className="modal-header">
              <span className="modal-title">Edit Workout Day</span>
              <button className="modal-close" onClick={() => setRenamingDayId(null)}>×</button>
            </div>
            <div className="form-group">
              <label className="form-label">Day Name</label>
              <input type="text" className="form-input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={() => setConfirmDeleteId(renamingDayId)}>Delete</button>
              <button className="btn btn-ghost" onClick={() => setRenamingDayId(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRename}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDeleteId && (
        <div id="confirmOverlay" className="open">
          <div id="confirmBox">
            <div id="confirmTitle">Are you sure?</div>
            <p id="confirmMsg">Delete this workout day and all its exercises? This cannot be undone.</p>
            <div id="confirmActions">
              <button className="btn btn-ghost" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
