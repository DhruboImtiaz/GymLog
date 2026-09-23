import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getGymLogData, saveGymLogData } from '../storage/storage';
import { uid, today, getDateOffsetIso } from '../utils/helpers';

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

  // Set Operations
  const addSet = useCallback((dayId, exId, reps, weight) => {
    if (!reps || reps < 1 || isNaN(weight) || weight < 0 || !data) return;
    const newData = {
      ...data,
      days: data.days.map(day => {
        if (day.id !== dayId) return day;
        return {
          ...day,
          exercises: (day.exercises || []).map(ex => {
            if (ex.id !== exId) return ex;
            const currentSets = ex.sets || [];
            return {
              ...ex,
              sets: [
                ...currentSets,
                { id: uid(), num: currentSets.length + 1, reps, weight }
              ]
            };
          })
        };
      })
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  const updateSet = useCallback((dayId, exId, setId, reps, weight) => {
    if (!reps || isNaN(weight) || !data) return;
    const newData = {
      ...data,
      days: data.days.map(day => {
        if (day.id !== dayId) return day;
        return {
          ...day,
          exercises: (day.exercises || []).map(ex => {
            if (ex.id !== exId) return ex;
            return {
              ...ex,
              sets: (ex.sets || []).map(s => 
                s.id === setId ? { ...s, reps, weight } : s
              )
            };
          })
        };
      })
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  const deleteSet = useCallback((dayId, exId, setId) => {
    if (!data) return;
    const newData = {
      ...data,
      days: data.days.map(day => {
        if (day.id !== dayId) return day;
        return {
          ...day,
          exercises: (day.exercises || []).map(ex => {
            if (ex.id !== exId) return ex;
            
            // Filter out the deleted set and renumber remaining sequentially
            const newSets = (ex.sets || [])
              .filter(s => s.id !== setId)
              .map((s, index) => ({ ...s, num: index + 1 }));

            return {
              ...ex,
              sets: newSets
            };
          })
        };
      })
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  const saveSession = useCallback((dayId, exId, dateOffset) => {
    if (!data) return;
    
    const day = data.days.find(d => d.id === dayId);
    if (!day) return;
    
    const ex = (day.exercises || []).find(e => e.id === exId);
    if (!ex || !ex.sets || ex.sets.length === 0) return;

    const logDate = getDateOffsetIso(dateOffset);
    
    // Map existing sets and remove the ID property to strictly match vanilla behavior
    const historySets = ex.sets.map(s => ({
      num: s.num,
      reps: s.reps,
      weight: s.weight
    }));

    const sessionObj = {
      id: uid(),
      date: logDate,
      sets: historySets
    };

    const newData = {
      ...data,
      days: data.days.map(d => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          exercises: (d.exercises || []).map(e => {
            if (e.id !== exId) return e;
            
            // Push new history and sort chronologically
            const newHistory = [...(e.history || []), sessionObj].sort((a, b) => 
              a.date.localeCompare(b.date)
            );

            return {
              ...e,
              history: newHistory,
              sets: [] // Clear active sets
            };
          })
        };
      })
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  // Measurement Operations
  const createMeasurement = useCallback((name) => {
    if (!name || !data) return;
    const newData = {
      ...data,
      measurements: [
        ...(data.measurements || []),
        { id: uid(), name, createdAt: today(), entries: [] }
      ]
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  const renameMeasurement = useCallback((id, newName) => {
    if (!newName || !data) return;
    const newData = {
      ...data,
      measurements: (data.measurements || []).map(m => 
        m.id === id ? { ...m, name: newName } : m
      )
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  const deleteMeasurement = useCallback((id) => {
    if (!data) return;
    const newData = {
      ...data,
      measurements: (data.measurements || []).filter(m => m.id !== id)
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  const addMeasurementEntry = useCallback((measId, value, unit, dateOffset) => {
    if (isNaN(value) || !data) return;
    const logDate = getDateOffsetIso(dateOffset);
    const newEntry = { id: uid(), date: logDate, value, unit };

    const newData = {
      ...data,
      measurements: (data.measurements || []).map(m => {
        if (m.id !== measId) return m;
        // Add entry and sort chronologically ascending exactly like vanilla
        const newEntries = [...(m.entries || []), newEntry].sort((a, b) => 
          a.date.localeCompare(b.date)
        );
        return {
          ...m,
          entries: newEntries
        };
      })
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  const deleteMeasurementEntry = useCallback((measId, entryId) => {
    if (!data) return;
    const newData = {
      ...data,
      measurements: (data.measurements || []).map(m => {
        if (m.id !== measId) return m;
        return {
          ...m,
          entries: (m.entries || []).filter(e => e.id !== entryId)
        };
      })
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  // Reorder Operations
  const reorderDays = useCallback((newDays) => {
    if (!data) return;
    const newData = {
      ...data,
      days: newDays
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  const reorderExercises = useCallback((dayId, newExercises) => {
    if (!data) return;
    const newData = {
      ...data,
      days: data.days.map(day => {
        if (day.id === dayId) {
          return {
            ...day,
            exercises: newExercises
          };
        }
        return day;
      })
    };
    saveAndSetData(newData);
  }, [data, saveAndSetData]);

  const reorderMeasurements = useCallback((newMeasurements) => {
    if (!data) return;
    const newData = {
      ...data,
      measurements: newMeasurements
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
    deleteExercise,
    addSet,
    updateSet,
    deleteSet,
    saveSession,
    createMeasurement,
    renameMeasurement,
    deleteMeasurement,
    addMeasurementEntry,
    deleteMeasurementEntry,
    reorderDays,
    reorderExercises,
    reorderMeasurements
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useGymLogData() {
  return useContext(DataContext);
}
