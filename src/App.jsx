import React from 'react';
import { useGymLogData } from './context/DataContext';
import { useTheme } from './context/ThemeContext';
import { useFont } from './context/FontContext';

function App() {
  const { data, isMalformed } = useGymLogData();
  const { theme, toggleTheme } = useTheme();
  const { fontSize, setFontSize } = useFont();

  if (isMalformed) {
    return (
      <div className="content empty">
        <h1 className="empty-title">Data Error</h1>
        <p className="empty-text">Your GymLog data is malformed and cannot be loaded. It has been preserved safely in storage.</p>
      </div>
    );
  }

  if (!data) {
    return <div className="content">Loading...</div>;
  }

  const daysCount = data.days?.length || 0;
  const measurementsCount = data.measurements?.length || 0;

  return (
    <div className="page active" style={{ display: 'block' }}>
      <nav className="navbar">
        <span className="nav-brand">GYMLOG (REACT SHELL)</span>
        <div className="nav-right">
          <button className="theme-btn" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </nav>

      <div className="content">
        <div className="page-header">
          <div className="page-header-left">
            <div className="page-title">Foundation Test</div>
            <div className="page-sub">React + Vite successfully integrated</div>
          </div>
        </div>

        <div className="card">
          <div className="card-row">
            <div className="card-body">
              <div className="card-title">Data Overview</div>
              <div className="card-meta">
                Workout Days: {daysCount} <br/>
                Measurements: {measurementsCount}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-row">
            <div className="card-body">
              <div className="card-title">Font Size Control</div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setFontSize(fontSize - 2)}>-2px</button>
                <span style={{ margin: 'auto 0' }}>{fontSize}px</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setFontSize(fontSize + 2)}>+2px</button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
