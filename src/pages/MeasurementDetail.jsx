import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGymLogData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import { SettingsIcon } from '../components/ui/Icons';
import { fmt } from '../utils/helpers';
import DateSelector from '../components/exercise/DateSelector';

export default function MeasurementDetail() {
  const { measId } = useParams();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { setIsSettingsOpen } = useSettings();
  const { data, addMeasurementEntry, deleteMeasurementEntry } = useGymLogData();

  const [dateOffset, setDateOffset] = useState(0);
  const [inValue, setInValue] = useState('');
  const [inUnit, setInUnit] = useState('kg');

  if (!data) return null;
  const measurement = data.measurements?.find(m => m.id === measId);

  if (!measurement) {
    navigate('/measurements', { replace: true });
    return null;
  }

  const handleAddEntry = () => {
    const val = parseFloat(inValue);
    if (isNaN(val)) {
      alert('Enter valid value');
      return;
    }
    addMeasurementEntry(measId, val, inUnit, dateOffset);
    setInValue('');
    const dateLbl = dateOffset === 0 ? 'Today' : dateOffset === 1 ? 'Yesterday' : '2 days ago';
    alert(`Entry logged for ${dateLbl}!`);
  };

  const handleDeleteEntry = (entryId) => {
    const ok = window.confirm('Delete this entry?');
    if (!ok) return;
    deleteMeasurementEntry(measId, entryId);
    alert('Entry deleted');
  };

  const entries = measurement.entries || [];
  // Vanilla app displays entries sorted chronologically but reversed to show newest first.
  const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date)).reverse();

  return (
    <div className="page active" style={{ display: 'block' }}>
      <nav className="navbar">
        <span className="nav-brand" onClick={() => navigate('/')}>GYMLOG</span>
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
          <div className="page-header-left">
            <button className="back-btn" onClick={() => navigate('/measurements')}>‹ Back</button>
            <div className="page-title">{measurement.name}</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/measurements/${measId}/progress`)}>Progress</button>
        </div>

        <DateSelector offset={dateOffset} setOffset={setDateOffset} />

        <div className="section-title">
          <span>Entries</span>
          <span className="badge">
            {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
          </span>
        </div>

        <div>
          {sortedEntries.length === 0 ? (
            <div className="empty">
              <div className="empty-title">No entries logged yet</div>
              <p className="empty-text" style={{ marginBottom: 0 }}>Add an entry below to start tracking.</p>
            </div>
          ) : (
            sortedEntries.map(e => {
              const dateFmt = fmt(e.date);
              const dateSplit = dateFmt.split(' ');
              const displayDate = `${dateSplit[0]} ${dateSplit[1]?.replace(',', '')}`;
              return (
                <div className="set-row" key={e.id}>
                  <div className="set-badge" style={{ width: 'auto', padding: '0 0.5rem', borderRadius: 'var(--r3)', background: 'var(--adim)', color: 'var(--accent)', fontWeight: 700, fontSize: '0.8rem' }}>
                    {displayDate}
                  </div>
                  <div className="set-info">
                    <span className="set-weight">{e.value} {e.unit}</span>
                  </div>
                  <div className="set-act">
                    <button className="icon-btn del" onClick={() => handleDeleteEntry(e.id)}>Del</button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="card" style={{ marginTop: '20px' }}>
          <div className="card-body">
            <div className="card-title">Log Entry</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' }}>
              
              <div className="form-group">
                <label className="form-label">Value</label>
                <input 
                  type="number" 
                  className="form-input" 
                  placeholder="0.0" 
                  inputMode="decimal" 
                  step="any"
                  value={inValue}
                  onChange={(e) => setInValue(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Unit</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. kg, %, cm" 
                  value={inUnit}
                  onChange={(e) => setInUnit(e.target.value)}
                />
              </div>

              <button className="btn btn-primary" onClick={handleAddEntry}>Save Entry</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
