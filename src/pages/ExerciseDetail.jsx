import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGymLogData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { SettingsIcon } from '../components/ui/Icons';

export default function ExerciseDetail() {
  const { dayId, exerciseId } = useParams();
  const navigate = useNavigate();
  const { data } = useGymLogData();
  const { theme, toggleTheme } = useTheme();

  if (!data) return null;
  const day = data.days.find(d => d.id === dayId);
  const exercise = day?.exercises?.find(e => e.id === exerciseId);

  if (!day || !exercise) {
    navigate('/', { replace: true });
    return null;
  }

  const setsCount = (exercise.sets || []).length;
  const historyCount = (exercise.history || []).length;

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
            <div className="page-title">{exercise.name}</div>
          </div>
          <button className="btn btn-secondary btn-sm" disabled>Progress (Later)</button>
        </div>

        <div className="card">
          <div className="card-row">
            <div className="card-body">
              <div className="card-title">Exercise Detail Placeholder</div>
              <div className="card-meta">
                Active Sets: {setsCount} <br/>
                History Sessions: {historyCount}
              </div>
              <p style={{ marginTop: '1rem', color: 'var(--text2)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                This is a placeholder for the Exercise Detail view. Logging sets and chart functionality will be implemented in future stages without destroying existing historical data.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
