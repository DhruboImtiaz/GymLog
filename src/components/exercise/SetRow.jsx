import React, { useState } from 'react';
import { useGymLogData } from '../../context/DataContext';
import useWriteCompletion from '../../hooks/useWriteCompletion';

export default function SetRow({ setItem, onUpdate, onDelete }) {
  const { data } = useGymLogData();
  const [editVersion, setEditVersion] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editReps, setEditReps] = useState(setItem.reps);
  const [editWeight, setEditWeight] = useState(setItem.weight);

  useWriteCompletion('update_set', p => { if (p.id === setItem.id && p.reps === Number(editReps) && p.weight === Number(editWeight)) setIsEditing(false); });

  const handleSave = async () => {
    const r = parseFloat(editReps);
    const w = parseFloat(editWeight);
    if (!r || isNaN(w)) {
      alert('Invalid values'); // Replicating basic validation feedback if they somehow bypass input clamping
      return;
    }
    if (!await onUpdate(setItem.id, r, w, editVersion)) return;
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditReps(setItem.reps);
    setEditWeight(setItem.weight);
    setIsEditing(false);
  };

  return (
    <div className="set-row">
      <div className="set-badge">{setItem.num}</div>
      
      {!isEditing ? (
        <>
          <div className="set-info" style={{ display: 'flex' }}>
            <span className="set-reps">{setItem.reps} reps</span>
            <span className="set-sep">—</span>
            <span className="set-weight">{setItem.weight} kg</span>
          </div>
          <div className="set-act" style={{ display: 'flex' }}>
            <button className="icon-btn edit" onClick={() => { setEditReps(setItem.reps); setEditWeight(setItem.weight); setEditVersion(data?._version); setIsEditing(true); }}>Edit</button>
            <button className="icon-btn del" onClick={() => onDelete(setItem.id)}>Del</button>
          </div>
        </>
      ) : (
        <div className="set-edit open">
          <input 
            type="number" 
            value={editReps} 
            onChange={(e) => setEditReps(e.target.value)} 
            min="1" 
            max="999" 
            inputMode="numeric" 
          />
          <span>reps</span>
          <input 
            type="number" 
            value={editWeight} 
            onChange={(e) => setEditWeight(e.target.value)} 
            min="0" 
            step="0.5" 
            inputMode="decimal" 
          />
          <span>kg</span>
          <button className="btn btn-xs btn-primary" onClick={handleSave}>Save</button>
          <button className="btn btn-xs btn-ghost" onClick={handleCancel}>Cancel</button>
        </div>
      )}
    </div>
  );
}
