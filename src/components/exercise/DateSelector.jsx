import React from 'react';

export default function DateSelector({ offset, setOffset }) {
  // 0 = Today, 1 = Yesterday, 2 = 2 Days Ago
  return (
    <div className="date-sel">
      <div 
        className={`date-sel-item ${offset === 0 ? 'active' : ''}`} 
        onClick={() => setOffset(0)}
      >
        Today
      </div>
      <div 
        className={`date-sel-item ${offset === 1 ? 'active' : ''}`} 
        onClick={() => setOffset(1)}
      >
        Yesterday
      </div>
      <div 
        className={`date-sel-item ${offset === 2 ? 'active' : ''}`} 
        onClick={() => setOffset(2)}
      >
        2d Ago
      </div>
    </div>
  );
}
