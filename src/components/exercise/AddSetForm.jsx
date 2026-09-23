import React, { useState } from 'react';
import NumberInput from './NumberInput';

export default function AddSetForm({ onAdd }) {
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

  return (
    <div className="card">
      <div className="card-body">
        <div className="card-title">Add Set</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' }}>
          
          <div className="form-group">
            <label className="form-label">Weight (kg)</label>
            <NumberInput 
              value={weight} 
              onChange={setWeight} 
              min={0} 
              step={2.5} 
              inputMode="decimal" 
              placeholder="0.0" 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Reps</label>
            <NumberInput 
              value={reps} 
              onChange={setReps} 
              min={1} 
              step={1} 
              inputMode="numeric" 
              placeholder="0" 
            />
          </div>

          <button className="btn btn-primary" onClick={handleAdd}>Add Set</button>
        </div>
      </div>
    </div>
  );
}
