import React, { createContext, useContext, useState, useEffect } from 'react';
import { getGymLogData, saveGymLogData } from '../storage/storage';

const DataContext = createContext();

export function DataProvider({ children }) {
  const [data, setData] = useState(null);
  const [isMalformed, setIsMalformed] = useState(false);

  useEffect(() => {
    // Load data on mount
    const loadedData = getGymLogData();
    if (loadedData === null) {
      // It's malformed
      setIsMalformed(true);
    } else {
      setData(loadedData);
    }
  }, []);

  const saveAndSetData = (newData) => {
    // Protect against saving over malformed data
    if (isMalformed) return;
    
    setData(newData);
    saveGymLogData(newData);
  };

  const value = {
    data,
    isMalformed,
    // Future mutation methods will be added here
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useGymLogData() {
  return useContext(DataContext);
}
