import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGymLogData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import { SettingsIcon } from '../components/ui/Icons';
import { fmt } from '../utils/helpers';
import LineChart from '../components/charts/LineChart';

export default function MeasurementProgress() {
  const { measId } = useParams();
  const navigate = useNavigate();
  const { data } = useGymLogData();
  const { theme, toggleTheme } = useTheme();
  const { setIsSettingsOpen } = useSettings();

  if (!data) return null;
  const measurement = data.measurements?.find(m => m.id === measId);

  if (!measurement) {
    navigate('/measurements', { replace: true });
    return null;
  }

  const entries = measurement.entries || [];

  const years = [...new Set(entries.map(e => new Date(e.date).getFullYear()))].sort((a, b) => a - b);
  const now = new Date();
  if (!years.length) years.push(now.getFullYear());

  let initialYear = now.getFullYear();
  if (!years.includes(initialYear)) initialYear = years[years.length - 1];

  const [progMonth, setProgMonth] = useState(now.getMonth());
  const [progYear, setProgYear] = useState(initialYear);

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const filtered = entries.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === progMonth && d.getFullYear() === progYear;
  });

  const labels = filtered.map(e => new Date(e.date).getDate());
  const chartData = filtered.map(e => e.value);

  return (
    <div className="page active" style={{ display: 'block' }}>


      <div className="content chart-wide">
        <div className="page-header" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
          <div className="page-header-left" style={{ width: '100%', marginBottom: '10px' }}>
            <button className="back-btn" onClick={() => navigate(-1)}>‹ Back</button>
            <div className="page-title">{measurement.name}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, marginTop: '0.25rem' }}>
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
              <div className="empty-title">No Data Yet</div>
              <p className="empty-text">Log entries to see your progress chart.</p>
            </div>
          ) : (
            <>
              <div className="chart-card">
                <div className="chart-label">{measurement.name} Progression</div>
                <div className="chart-wrap">
                  <LineChart labels={labels} data={chartData} color="#4ade80" />
                </div>
              </div>

              <div className="section-header">
                <span className="section-title">History</span>
              </div>

              {[...filtered].reverse().map(e => (
                <div className="hist-card" key={e.id}>
                  <div className="hist-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="hist-date" style={{ margin: 0 }}>{fmt(e.date)}</span>
                    <span className="hist-val" style={{ fontWeight: 'bold', color: 'var(--accent)' }}>
                      {e.value} {e.unit}
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
