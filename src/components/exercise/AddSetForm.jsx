import React, { useState } from 'react';
import DateSelector from './DateSelector';

export default function AddSetForm({ onAdd, dateOffset, setDateOffset }) {
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');

  const handleAdd = () => {
    const r = parseFloat(reps);
    const w = parseFloat(weight);
    if (!r || r < 1) {
      alert('Enter reps');
      return;
    }
    if (isNaN(w) || w < 0) {
      alert('Enter weight');
      return;
    }
    
    onAdd(r, w);
    
    // Clear inputs after successful add
    setReps('');
    setWeight('');
  };

  const adj = (field, amt) => {
    if (field === 'reps') {
      let current = parseFloat(reps);
      if (isNaN(current)) current = 0;
      let next = Math.round((current + amt) * 100) / 100;
      if (next < 1) next = 1;
      if (next > 999) next = 999;
      setReps(String(next));
    } else {
      let current = parseFloat(weight);
      if (isNaN(current)) current = 0;
      let next = Math.round((current + amt) * 100) / 100;
      if (next < 0) next = 0;
      if (next > 9999) next = 9999;
      setWeight(String(next));
    }
  };

  return (
    <div className="add-card">
      <div className="add-title">Log a Set</div>
      
      <DateSelector offset={dateOffset} setOffset={setDateOffset} />
      
      <div className="add-grid">
        <div className="input-group">
          <label className="input-label">Reps</label>
          <input 
            type="number" 
            className="num-input" 
            placeholder="10" 
            min="1" 
            max="999" 
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
          />
          <div className="quick-row">
            <button className="qbtn" onClick={() => adj('reps', 1)}>+1</button>
            <button className="qbtn" onClick={() => adj('reps', -1)}>−1</button>
          </div>
        </div>
        
        <div className="input-group">
          <label className="input-label">Weight (kg)</label>
          <input 
            type="number" 
            className="num-input" 
            placeholder="50" 
            min="0" 
            max="9999" 
            step="0.5" 
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
          <div className="quick-row">
            <button className="qbtn" onClick={() => adj('weight', 2.5)}>+2.5</button>
            <button className="qbtn" onClick={() => adj('weight', 5)}>+5</button>
            <button className="qbtn" onClick={() => adj('weight', -2.5)}>−2.5</button>
          </div>
        </div>
      </div>
      
      <button className="btn btn-primary btn-full" onClick={handleAdd}>Log Set</button>
    </div>
  );
}
