import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGymLogData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { SettingsIcon, EditIcon, DragHandleIcon } from '../components/ui/Icons';
import { esc } from '../utils/helpers';

export default function WorkoutDay() {
  const { dayId } = useParams();
  const navigate = useNavigate();
  const { data, addExercise, renameExercise, deleteExercise } = useGymLogData();
  const { theme, toggleTheme } = useTheme();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newExName, setNewExName] = useState('');

  const [renamingExId, setRenamingExId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  if (!data) return null;
  const day = data.days.find(d => d.id === dayId);
  if (!day) {
    navigate('/', { replace: true });
    return null;
  }

  const handleAdd = () => {
    if (newExName.trim()) {
      addExercise(dayId, newExName.trim());
      setNewExName('');
      setIsAddOpen(false);
    }
  };

  const handleRename = () => {
    if (renameValue.trim() && renamingExId) {
      renameExercise(dayId, renamingExId, renameValue.trim());
      setRenamingExId(null);
    }
  };

  const handleDelete = () => {
    if (confirmDeleteId) {
      deleteExercise(dayId, confirmDeleteId);
      setConfirmDeleteId(null);
      setRenamingExId(null);
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
            <button className="back-btn" onClick={() => navigate(-1)}>‹ Back</button>
            <div className="page-title">{day.name}</div>
          </div>
          <button className="btn btn-primary" onClick={() => setIsAddOpen(true)}>+ Exercise</button>
        </div>

        <div id="exercisesList">
          {(!day.exercises || day.exercises.length === 0) ? (
            <div className="empty">
              <div className="empty-title">No Exercises Yet</div>
              <p className="empty-text">Add exercises to this workout day.</p>
              <button className="btn btn-primary btn-lg" onClick={() => setIsAddOpen(true)}>Add First Exercise</button>
            </div>
          ) : (
            day.exercises.map(ex => (
              <div className="card" key={ex.id}>
                <div className="card-row card-clickable" onClick={() => navigate(`/day/${dayId}/exercise/${ex.id}`)}>
                  <div className="card-drag-handle" onClick={(e) => e.stopPropagation()} title="Hold and drag to move up or down">
                    <DragHandleIcon />
                  </div>
                  <div className="card-icon" style={{ background: 'var(--gdim)', color: 'var(--green)' }}>
                    {esc(ex.name.slice(0, 2).toUpperCase())}
                  </div>
                  <div className="card-body">
                    <div className="card-title">{esc(ex.name)}</div>
                    <div className="card-meta">
                      {(ex.sets || []).length} set{(ex.sets || []).length !== 1 ? 's' : ''} today · {(ex.history || []).length} session{(ex.history || []).length !== 1 ? 's' : ''} logged
                    </div>
                  </div>
                  <div className="card-right-actions">
                    <button className="card-edit-btn" onClick={(e) => {
                      e.stopPropagation();
                      setRenameValue(ex.name);
                      setRenamingExId(ex.id);
                    }} title="Edit Exercise">
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

      {/* Add Modal */}
      {isAddOpen && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target.classList.contains('modal-overlay')) setIsAddOpen(false); }}>
          <div className="modal-box">
            <div className="modal-header">
              <span className="modal-title">Add Exercise</span>
              <button className="modal-close" onClick={() => setIsAddOpen(false)}>×</button>
            </div>
            <div className="form-group">
              <label className="form-label">Exercise Name</label>
              <input type="text" className="form-input" placeholder="e.g. Bench Press, Squat..." value={newExName} onChange={(e) => setNewExName(e.target.value)} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setIsAddOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renamingExId && !confirmDeleteId && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target.classList.contains('modal-overlay')) setRenamingExId(null); }}>
          <div className="modal-box">
            <div className="modal-header">
              <span className="modal-title">Edit Exercise</span>
              <button className="modal-close" onClick={() => setRenamingExId(null)}>×</button>
            </div>
            <div className="form-group">
              <label className="form-label">Exercise Name</label>
              <input type="text" className="form-input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={() => setConfirmDeleteId(renamingExId)}>Delete</button>
              <button className="btn btn-ghost" onClick={() => setRenamingExId(null)}>Cancel</button>
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
            <p id="confirmMsg">Delete this exercise and all its sets and history?</p>
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
