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
  const [inUnit, setInUnit] = useState('cm');

  const handleAdj = (amt) => {
    let current = parseFloat(inValue);
    if (isNaN(current)) current = 0;
    let next = Math.round((current + amt) * 100) / 100;
    // Note: Vanilla doesn't clamp negative measurement values since input min isn't set
    setInValue(String(next));
  };

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


      <div className="content">
        <div className="page-header">
          <div className="page-header-left">
            <button className="back-btn" onClick={() => navigate('/measurements')}>‹ Back</button>
            <div className="page-title">{measurement.name}</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/measurements/${measId}/progress`)}>Progress</button>
        </div>

        <div className="section-header">
          <span className="section-title">Entries</span>
          <span className="section-badge">
            {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
          </span>
        </div>

        <div className="sets-list">
          {sortedEntries.length === 0 ? (
            <p className="empty-text" style={{ color: 'var(--text2)', fontSize: '0.875rem', textAlign: 'center', padding: '0.75rem 0 1rem', margin: 0 }}>
              No entries yet — log one below.
            </p>
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

        <div className="add-card">
          <div className="add-title">Log a Measurement</div>

          <DateSelector offset={dateOffset} setOffset={setDateOffset} />

          <div className="add-grid">
            <div className="input-group">
              <label className="input-label">Value</label>
              <input
                type="number"
                className="num-input"
                placeholder="0"
                step="0.1"
                inputMode="decimal"
                value={inValue}
                onChange={(e) => setInValue(e.target.value)}
              />
              <div className="quick-row">
                <button className="qbtn" onClick={() => handleAdj(0.5)}>+0.5</button>
                <button className="qbtn" onClick={() => handleAdj(1.0)}>+1.0</button>
                <button className="qbtn" onClick={() => handleAdj(-0.5)}>−0.5</button>
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Unit</label>
              <select
                className="num-input"
                style={{ padding: 0 }}
                value={inUnit}
                onChange={(e) => setInUnit(e.target.value)}
              >
                <option value="cm">cm</option>
                <option value="in">inch</option>
                <option value="kg">kg</option>
                <option value="lbs">lbs</option>
                <option value="%">%</option>
              </select>
            </div>
          </div>

          <button className="btn btn-primary btn-full" onClick={handleAddEntry}>Log Entry</button>
        </div>

      </div>
    </div>
  );
}
