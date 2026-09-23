import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGymLogData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { SettingsIcon } from '../components/ui/Icons';
import { fmt } from '../utils/helpers';
import LineChart from '../components/charts/LineChart';

export default function ExerciseProgress() {
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

  const hist = exercise.history || [];

  // Build year options from all history
  const years = [...new Set(hist.map(h => new Date(h.date).getFullYear()))].sort((a, b) => a - b);
  const now = new Date();
  if (!years.length) years.push(now.getFullYear());
  
  // Default year clamping
  let initialYear = now.getFullYear();
  if (!years.includes(initialYear)) initialYear = years[years.length - 1];

  const [progMonth, setProgMonth] = useState(now.getMonth());
  const [progYear, setProgYear] = useState(initialYear);

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // Filter by selected month/year
  const filtered = hist.filter(h => {
    const d = new Date(h.date);
    return d.getMonth() === progMonth && d.getFullYear() === progYear;
  });

  // Calculate metrics exactly as vanilla
  // X-axis: day number only
  const labels = filtered.map(h => new Date(h.date).getDate());
  
  const mw = filtered.map(h => Math.max(...(h.sets || [{ weight: 0 }]).map(s => s.weight)));
  
  const mrAtMw = filtered.map(h => {
    const sets = h.sets || [];
    if (!sets.length) return 0;
    const maxW = Math.max(...sets.map(s => s.weight));
    return Math.max(...sets.filter(s => s.weight === maxW).map(s => s.reps));
  });
  
  const mr = filtered.map(h => Math.max(...(h.sets || [{ reps: 0 }]).map(s => s.reps)));

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
        <div className="page-header" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
          <div className="page-header-left" style={{ width: '100%', marginBottom: '10px' }}>
            <button className="back-btn" onClick={() => navigate(-1)}>‹ Back</button>
            <div className="page-title">{exercise.name}</div>
          </div>
          <div id="progSelectors" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, marginTop: '0.25rem' }}>
            <select 
              value={progMonth} 
              onChange={e => setProgMonth(parseInt(e.target.value))}
              style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r3)', color: 'var(--text)', padding: '0 0.5rem', height: '34px', fontSize: '0.8rem', fontFamily: 'var(--fb)', outline: 'none', cursor: 'pointer' }}
            >
              {monthNames.map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
            <select 
              value={progYear} 
              onChange={e => setProgYear(parseInt(e.target.value))}
              style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r3)', color: 'var(--text)', padding: '0 0.5rem', height: '34px', fontSize: '0.8rem', fontFamily: 'var(--fb)', outline: 'none', cursor: 'pointer' }}
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          {!filtered.length ? (
            <div className="empty">
              <div className="empty-title">No History Yet</div>
              <p className="empty-text">Save a workout session to start seeing progress charts.</p>
            </div>
          ) : (
            <>
              <div className="chart-card">
                <div className="chart-label">Max Weight per Session (kg)</div>
                <div className="chart-wrap">
                  <LineChart labels={labels} data={mw} color="#ff6b35" />
                </div>
              </div>
              <div className="chart-card">
                <div className="chart-label">Max Reps at Max Weight</div>
                <div className="chart-wrap">
                  <LineChart labels={labels} data={mrAtMw} color="#4ade80" />
                </div>
              </div>
              <div className="chart-card">
                <div className="chart-label">Max Reps per Session</div>
                <div className="chart-wrap">
                  <LineChart labels={labels} data={mr} color="#60a5fa" />
                </div>
              </div>
              
              <div className="section-header">
                <span className="section-title">Workout History</span>
              </div>
              
              {[...filtered].reverse().map(h => (
                <div className="hist-card" key={h.id}>
                  <div className="hist-date">{fmt(h.date)}</div>
                  {(h.sets || []).map((s, i) => (
                    <div className="hist-row" key={i}>
                      <span className="hist-num">Set {s.num}</span>
                      <span className="hist-val">{s.reps} reps — {s.weight} kg</span>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
