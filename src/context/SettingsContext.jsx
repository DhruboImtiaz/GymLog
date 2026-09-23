import React, { createContext, useContext, useState } from 'react';

const SettingsContext = createContext();

export function useSettings() {
  return useContext(SettingsContext);
}

export function SettingsProvider({ children }) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <SettingsContext.Provider value={{ isSettingsOpen, setIsSettingsOpen }}>
      {children}
    </SettingsContext.Provider>
  );
}
