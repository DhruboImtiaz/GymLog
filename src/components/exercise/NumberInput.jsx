import React, { useState, useEffect } from 'react';

export default function NumberInput({ value, onChange, min, max, step, inputMode, placeholder, id }) {
  // We keep a local string state so users can freely type empty strings or decimals
  // before the parent processes it.
  const [localVal, setLocalVal] = useState(value != null ? String(value) : '');

  // Sync down if parent changes directly
  useEffect(() => {
    setLocalVal(value != null ? String(value) : '');
  }, [value]);

  const handleAdjust = (amt) => {
    let current = parseFloat(localVal) || 0;
    let next = Math.round((current + amt) * 100) / 100;
    if (min !== undefined && min !== null && next < min) {
      next = min;
    }
    if (max !== undefined && max !== null && next > max) {
      next = max;
    }
    setLocalVal(String(next));
    onChange(next);
  };

  const handleChange = (e) => {
    setLocalVal(e.target.value);
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) {
      // Don't clamp strictly on change to allow typing, but pass up valid numbers
      onChange(parsed);
    } else {
      onChange('');
    }
  };

  const handleBlur = () => {
    // Clamp on blur to enforce boundaries mimicking vanilla adj()
    let current = parseFloat(localVal);
    if (isNaN(current)) current = 0;
    
    if (min !== undefined && min !== null && current < min) current = min;
    if (max !== undefined && max !== null && current > max) current = max;

    setLocalVal(String(current));
    onChange(current);
  };

  return (
    <div className="adj-group">
      <button className="adj-btn" onClick={() => handleAdjust(step ? -parseFloat(step) : -1)}>-</button>
      <input 
        id={id}
        type="number" 
        className="form-input" 
        style={{ textAlign: 'center' }} 
        value={localVal} 
        onChange={handleChange}
        onBlur={handleBlur}
        min={min} 
        max={max} 
        step={step} 
        inputMode={inputMode} 
        placeholder={placeholder} 
      />
      <button className="adj-btn" onClick={() => handleAdjust(step ? parseFloat(step) : 1)}>+</button>
    </div>
  );
}
