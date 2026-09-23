import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getGymLogData, saveGymLogData } from '../storage/storage';
import { uid, today } from '../utils/helpers';

const DataContext = createContext();

export function DataProvider({ children }) {
  const [data, setData] = useState(null);
  const [isMalformed, setIsMalformed] = useState(false);

  useEffect(() => {
    const loadedData = getGymLogData();
    if (loadedData === null) {
      setIsMalformed(true);
    } else {
      setData(loadedData);
    }
  }, []);

  const saveAndSetData = useCallback((newData) => {
    if (isMalformed) return;
    setData(newData);
    saveGymLogData(newData);
  }, [isMalformed]);

  // Workout Days Operations
  const createDay = useCallback((name) => {
    if (!name || !data) return;
    const newData = {
      ...data,
      days: [
        ...data.days,
        { id: uid(), name, createdAt: today(), exercises: [] }
      ]
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  const renameDay = useCallback((id, newName) => {
    if (!newName || !data) return;
    const newData = {
      ...data,
      days: data.days.map(day => day.id === id ? { ...day, name: newName } : day)
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  const deleteDay = useCallback((id) => {
    if (!data) return;
    const newData = {
      ...data,
      days: data.days.filter(day => day.id !== id)
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  // Exercises Operations
  const addExercise = useCallback((dayId, name) => {
    if (!name || !data) return;
    const newData = {
      ...data,
      days: data.days.map(day => {
        if (day.id === dayId) {
          return {
            ...day,
            exercises: [
              ...(day.exercises || []),
              { id: uid(), name, sets: [], history: [] }
            ]
          };
        }
        return day;
      })
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  const renameExercise = useCallback((dayId, exId, newName) => {
    if (!newName || !data) return;
    const newData = {
      ...data,
      days: data.days.map(day => {
        if (day.id === dayId) {
          return {
            ...day,
            exercises: (day.exercises || []).map(ex => ex.id === exId ? { ...ex, name: newName } : ex)
          };
        }
        return day;
      })
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  const deleteExercise = useCallback((dayId, exId) => {
    if (!data) return;
    const newData = {
      ...data,
      days: data.days.map(day => {
        if (day.id === dayId) {
          return {
            ...day,
            exercises: (day.exercises || []).filter(ex => ex.id !== exId)
          };
        }
        return day;
      })
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  const value = {
    data,
    isMalformed,
    createDay,
    renameDay,
    deleteDay,
    addExercise,
    renameExercise,
    deleteExercise
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useGymLogData() {
  return useContext(DataContext);
}
