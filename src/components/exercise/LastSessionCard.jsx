import React from 'react';
import { fmt } from '../../utils/helpers';

export default function LastSessionCard({ history, label = 'Last Workout' }) {
  if (!history || history.length === 0) return null;

  // Since saveSession sorts the array before saving, the last element is definitively the latest.
  const lastSession = history[history.length - 1];

  return (
    <div className="last-card">
      <div className="last-header">
        <span className="last-label">{label}</span>
        <span className="last-date">{fmt(lastSession.date)}</span>
      </div>
      {(lastSession.sets || []).map((s, idx) => (
        <div className="last-row" key={idx}>
          <span className="last-num">Set {s.num}</span>
          <span className="last-val">{s.reps} reps — {s.weight} kg</span>
        </div>
      ))}
    </div>
  );
}
