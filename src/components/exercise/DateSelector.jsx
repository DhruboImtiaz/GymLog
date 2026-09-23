import React from 'react';

export default function DateSelector({ offset, setOffset }) {
  // 0 = Today, 1 = Yesterday, 2 = 2 Days Ago
  return (
    <div className="date-selector">
      <button 
        type="button" 
        className={offset === 0 ? 'date-btn active' : 'date-btn'} 
        onClick={() => setOffset(0)}
      >
        Today
      </button>
      <button 
        type="button" 
        className={offset === 1 ? 'date-btn active' : 'date-btn'} 
        onClick={() => setOffset(1)}
      >
        Yesterday
      </button>
      <button 
        type="button" 
        className={offset === 2 ? 'date-btn active' : 'date-btn'} 
        onClick={() => setOffset(2)}
      >
        2 Days Ago
      </button>
    </div>
  );
}
