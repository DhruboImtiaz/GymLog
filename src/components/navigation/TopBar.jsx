import React from 'react';
import { useNavigate, NavLink, useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { SettingsIcon } from '../ui/Icons';

export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const { setIsSettingsOpen } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  const isWorkoutsActive = location.pathname === '/' || location.pathname.startsWith('/day');
  const isMeasurementsActive = location.pathname.startsWith('/measurements');

  return (
    <nav className="navbar">
      <div className="nav-left">
        <span className="nav-brand" onClick={() => navigate('/')}>GYMLOG</span>
        <div className="desktop-nav-links">
          <NavLink
            to="/"
            className={`dnav-item ${isWorkoutsActive ? 'active' : ''}`}
          >
            WORKOUTS
          </NavLink>
          <NavLink
            to="/measurements"
            className={`dnav-item ${isMeasurementsActive ? 'active' : ''}`}
          >
            MEASUREMENTS
          </NavLink>
        </div>
      </div>
      <div className="nav-right">
        <button className="theme-btn" onClick={toggleTheme}>
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
        <button className="settings-btn" aria-label="Settings" title="Settings" onClick={() => setIsSettingsOpen(true)}>
          <SettingsIcon />
        </button>
      </div>
    </nav>
  );
}
