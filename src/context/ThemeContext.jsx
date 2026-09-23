import React, { createContext, useContext, useState, useEffect } from 'react';
import { getTheme, saveTheme } from '../storage/storage';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const loadedTheme = getTheme();
    setTheme(loadedTheme);
  }, []);

  useEffect(() => {
    // Apply theme to the document element, matching vanilla behavior
    document.documentElement.setAttribute('data-theme', theme);
    const themeColorMeta = document.getElementById('themeColor');
    if (themeColorMeta) {
      themeColorMeta.content = theme === 'dark' ? '#0a0a0a' : '#f2f2f2';
    }
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    saveTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
