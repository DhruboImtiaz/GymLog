import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGymLogData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { SettingsIcon } from '../components/ui/Icons';
import DateSelector from '../components/exercise/DateSelector';
import LastSessionCard from '../components/exercise/LastSessionCard';
import SetRow from '../components/exercise/SetRow';
import AddSetForm from '../components/exercise/AddSetForm';

export default function ExerciseDetail() {
  const { dayId, exerciseId } = useParams();
  const navigate = useNavigate();
  const { data, addSet, updateSet, deleteSet, saveSession } = useGymLogData();
  const { theme, toggleTheme } = useTheme();

  const [dateOffset, setDateOffset] = useState(0);

  if (!data) return null;
  const day = data.days.find(d => d.id === dayId);
  const exercise = day?.exercises?.find(e => e.id === exerciseId);

  if (!day || !exercise) {
    navigate('/', { replace: true });
    return null;
  }

  const handleAddSet = (reps, weight) => {
    addSet(dayId, exerciseId, reps, weight);
  };

  const handleUpdateSet = (setId, reps, weight) => {
    updateSet(dayId, exerciseId, setId, reps, weight);
  };

  const handleDeleteSet = (setId) => {
    const ok = window.confirm('Delete this set?');
    if (!ok) return;
    deleteSet(dayId, exerciseId, setId);
  };

  const handleSaveSession = () => {
    saveSession(dayId, exerciseId, dateOffset);
    setDateOffset(0);
    const dateLbl = dateOffset === 0 ? 'Today' : dateOffset === 1 ? 'Yesterday' : '2 days ago';
    // Using simple alert here to replace the original imperative toast
    alert(`Workout saved for ${dateLbl}!`);
  };

  const sets = exercise.sets || [];
  
  // Date title string
  const dateTitle = dateOffset === 0 ? "Today's Sets" : dateOffset === 1 ? "Yesterday's Sets" : "Sets for 2 Days Ago";
  const saveBtnLbl = dateOffset === 0 ? "Today" : dateOffset === 1 ? "Yesterday" : "2 Days Ago";

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
            <button className="back-btn" onClick={() => navigate(-1)}>‹ {day.name}</button>
            <div className="page-title" id="exTitle">{exercise.name}</div>
          </div>
          <button className="btn btn-secondary btn-sm" disabled>Progress (Later)</button>
        </div>

        <DateSelector offset={dateOffset} setOffset={setDateOffset} />
        
        <LastSessionCard history={exercise.history} />

        <div className="section-title">
          <span id="exSetsTitle">{dateTitle}</span>
          <span className="badge" id="setBadge">{sets.length} set{sets.length !== 1 ? 's' : ''}</span>
        </div>

        <div id="setsList">
          {sets.length === 0 ? (
            <div className="empty" id="noSets">
              <div className="empty-title">No sets logged</div>
              <p className="empty-text" style={{ marginBottom: 0 }}>Add a set below to start this exercise.</p>
            </div>
          ) : (
            sets.map(s => (
              <SetRow 
                key={s.id} 
                setItem={s} 
                onUpdate={handleUpdateSet} 
                onDelete={handleDeleteSet} 
              />
            ))
          )}
        </div>

        <AddSetForm onAdd={handleAddSet} />

        {sets.length > 0 && (
          <div id="saveSection" style={{ marginTop: '20px' }}>
            <button 
              className="btn btn-primary btn-lg" 
              style={{ width: '100%', marginBottom: '15px' }} 
              onClick={handleSaveSession}
            >
              Save {saveBtnLbl}'s Workout to History
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
