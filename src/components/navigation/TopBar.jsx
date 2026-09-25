import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { SettingsIcon } from '../ui/Icons';

export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const { setIsSettingsOpen } = useSettings();
  const navigate = useNavigate();

  return (
    <nav className="navbar">
      <span className="nav-brand topbar-brand" onClick={() => navigate('/')}>GYMLOG</span>
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
