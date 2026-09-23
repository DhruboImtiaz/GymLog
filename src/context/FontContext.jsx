import React, { createContext, useContext, useState, useEffect } from 'react';
import { getFontSize, saveFontSize } from '../storage/storage';

const FontContext = createContext();

export function FontProvider({ children }) {
  const [fontSize, setFontSizeState] = useState(16);

  useEffect(() => {
    const loadedSize = getFontSize();
    setFontSizeState(loadedSize);
  }, []);

  useEffect(() => {
    // Apply font size to html tag, matching vanilla behavior
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  const setFontSize = (size) => {
    const px = Math.min(24, Math.max(12, parseInt(size, 10) || 16));
    setFontSizeState(px);
    saveFontSize(px);
  };

  return (
    <FontContext.Provider value={{ fontSize, setFontSize }}>
      {children}
    </FontContext.Provider>
  );
}

export function useFont() {
  return useContext(FontContext);
}
