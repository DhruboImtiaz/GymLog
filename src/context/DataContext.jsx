import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getGymLogData, saveGymLogData } from '../storage/storage';
import { uid, today, getDateOffsetIso } from '../utils/helpers';
import { useAuth } from './AuthContext';
import { useMigration } from './MigrationContext';
import { SupabaseService } from '../lib/repository';
import { MigrationService } from '../lib/migrationService';
import { deepValidateBackup } from '../utils/restore';

const DataContext = createContext();

export function DataProvider({ children }) {
  const { user } = useAuth();
  const { migrationState, loading: migrationLoading } = useMigration();

  const [data, setData] = useState(null);
  const [isMalformed, setIsMalformed] = useState(false);
  const [sourceMode, setSourceMode] = useState('loading'); // 'guest' | 'migration' | 'cloud' | 'loading'
  const [cloudStatus, setCloudStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [cloudError, setCloudError] = useState(null);

  const clearCloudError = useCallback(() => setCloudError(null), []);

  const currentUserIdRef = useRef(user?.id);
  currentUserIdRef.current = user?.id; // Synchronize explicitly during render

  useEffect(() => {
    let active = true;
    const requestId = user?.id;

    // Immediately clear data on transition
    setData(null);
    setSourceMode('loading');
    setCloudError(null);
    setCloudStatus('idle');

    if (migrationLoading) return;

    if (!user) {
      setSourceMode('guest');
      const loadedData = getGymLogData();
      if (loadedData === null) {
        setIsMalformed(true);
      } else {
        setData(loadedData);
      }
      return;
    }

    if (migrationState !== 'completed') {
      setSourceMode('migration');
      // Load local data just for display purposes during conflict resolution
      const loadedData = getGymLogData() || { days: [], measurements: [] };
      setData(loadedData);
      return;
    }

    // Cloud Mode
    setSourceMode('cloud');
    setCloudStatus('loading');

    async function fetchCloud() {
      try {
        const cloudData = await SupabaseService.fetchGymLogData();
        if (!active) return;
        if (currentUserIdRef.current !== requestId) return;
        setData(cloudData);
        setCloudStatus('ready');
      } catch (err) {
        if (!active) return;
        if (currentUserIdRef.current !== requestId) return;
        console.error('Failed to load cloud data', err);
        setCloudStatus('error');
      }
    }

    fetchCloud();

    return () => {
      active = false;
    };
  }, [user?.id, migrationState, migrationLoading]);

  const saveAndSetData = useCallback((newData) => {
    if (isMalformed) return;
    setData(newData);
    saveGymLogData(newData);
  }, [isMalformed]);

  // Wrapper for cloud mutations to keep React state and Supabase in sync
  const performCloudMutation = useCallback(async (mutationFn) => {
    const requestId = currentUserIdRef.current;
    if (!requestId || sourceMode !== 'cloud') return;

    setCloudError(null);

    try {
      await mutationFn();

      // Protect against identity switch during the mutation itself
      if (currentUserIdRef.current !== requestId) return;

      // Fetch authoritative state after mutation
      const newCloudData = await SupabaseService.fetchGymLogData();

      // Protect against identity switch during the refetch
      if (currentUserIdRef.current === requestId) {
        setData(newCloudData);
      }
    } catch (err) {
      // Protect against identity switch before setting error
      if (currentUserIdRef.current !== requestId) return;

      console.error('Cloud mutation failed:', err);
      setCloudError(err.message || 'Failed to sync with cloud.');
    }
  }, [sourceMode]);

  const performCloudRestore = useCallback(async (migratedDataModel) => {
    const requestId = currentUserIdRef.current;
    if (!requestId || sourceMode !== 'cloud') return;

    setCloudError(null);

    try {
      // 0. Pre-replacement validation
      const domainModel = migratedDataModel['gymlog_data'] || { days: [], measurements: [] };
      deepValidateBackup(domainModel);

      // Deterministic seam to allow pre-RPC event loop interleaving for testing
      await Promise.resolve();

      // Guard immediately before the destructive operation
      if (currentUserIdRef.current !== requestId || sourceMode !== 'cloud') return;

      // 1. the destructive operation
      await SupabaseService.replaceGymLogData(migratedDataModel['gymlog_data']);

      if (currentUserIdRef.current !== requestId) return;

      // 2. Authoritative refetch
      const newCloudData = await SupabaseService.fetchGymLogData();

      if (currentUserIdRef.current !== requestId) return;

      // 3. Post-restore verification (authoritative)
      const verificationModel = { days: [], measurements: [], ...domainModel };
      await MigrationService.verifyMigration(verificationModel, newCloudData);

      if (currentUserIdRef.current === requestId) {
        setData(newCloudData);
      }
    } catch (err) {
      if (currentUserIdRef.current !== requestId) return;
      console.error('Cloud restore failed:', err);
      setCloudError(err.message || 'Failed to restore cloud data.');
    }
  }, [sourceMode]);

  // Workout Days Operations
  const createDay = useCallback((name) => {
    if (!name || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      const newId = uid();
      const newPosition = data.days.length;
      performCloudMutation(() => SupabaseService.createDay(newId, name, today(), newPosition));
    } else {
      const newData = {
        ...data,
        days: [
          ...data.days,
          { id: uid(), name, createdAt: today(), exercises: [] }
        ]
      };
      saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const renameDay = useCallback((id, newName) => {
    if (!newName || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      performCloudMutation(() => SupabaseService.renameDay(id, newName));
    } else {
      const newData = {
        ...data,
        days: data.days.map(day => day.id === id ? { ...day, name: newName } : day)
      };
      saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const deleteDay = useCallback((id) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      performCloudMutation(() => SupabaseService.deleteDay(id));
    } else {
      const newData = {
        ...data,
        days: data.days.filter(day => day.id !== id)
      };
      saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  // Exercises Operations
  const addExercise = useCallback((dayId, name) => {
    if (!name || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      const day = data.days.find(d => d.id === dayId);
      const newPosition = day ? (day.exercises || []).length : 0;
      const newId = uid();
      performCloudMutation(() => SupabaseService.addExercise(dayId, newId, name, newPosition));
    } else {
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
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const renameExercise = useCallback((dayId, exId, newName) => {
    if (!newName || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      performCloudMutation(() => SupabaseService.renameExercise(exId, newName));
    } else {
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
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const deleteExercise = useCallback((dayId, exId) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      performCloudMutation(() => SupabaseService.deleteExercise(exId));
    } else {
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
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  // Set Operations
  const addSet = useCallback((dayId, exId, reps, weight) => {
    if (!reps || reps < 1 || isNaN(weight) || weight < 0 || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      const day = data.days.find(d => d.id === dayId);
      const ex = day ? (day.exercises || []).find(e => e.id === exId) : null;
      const newNum = ex ? (ex.sets || []).length + 1 : 1;
      const newId = uid();
      performCloudMutation(() => SupabaseService.addSet(exId, newId, newNum, reps, weight));
    } else {
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
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const updateSet = useCallback((dayId, exId, setId, reps, weight) => {
    if (!reps || isNaN(weight) || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      performCloudMutation(() => SupabaseService.updateSet(setId, reps, weight));
    } else {
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
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const deleteSet = useCallback((dayId, exId, setId) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      const day = data.days.find(d => d.id === dayId);
      const ex = day ? (day.exercises || []).find(e => e.id === exId) : null;
      let remainingSetsUpdates = [];
      if (ex && ex.sets) {
        remainingSetsUpdates = ex.sets
          .filter(s => s.id !== setId)
          .map((s, index) => ({ id: s.id, exerciseId: ex.id, newSetNumber: index + 1, reps: s.reps, weight: s.weight }));
      }
      performCloudMutation(() => SupabaseService.deleteSet(setId, remainingSetsUpdates));
    } else {
      const newData = {
        ...data,
        days: data.days.map(day => {
          if (day.id !== dayId) return day;
          return {
            ...day,
            exercises: (day.exercises || []).map(ex => {
              if (ex.id !== exId) return ex;

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
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const saveSession = useCallback((dayId, exId, dateOffset) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    const logDate = getDateOffsetIso(dateOffset);

    if (sourceMode === 'cloud') {
      const day = data.days.find(d => d.id === dayId);
      const ex = day ? (day.exercises || []).find(e => e.id === exId) : null;
      if (!ex || !ex.sets || ex.sets.length === 0) return;

      const historyId = uid();
      const mappedSets = ex.sets.map(s => ({
        num: s.num,
        reps: s.reps,
        weight: s.weight
      }));

      performCloudMutation(() => SupabaseService.saveSession(exId, historyId, logDate, mappedSets));
    } else {
      const day = data.days.find(d => d.id === dayId);
      if (!day) return;
      const ex = (day.exercises || []).find(e => e.id === exId);
      if (!ex || !ex.sets || ex.sets.length === 0) return;

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

              const newHistory = [...(e.history || []), sessionObj].sort((a, b) =>
                a.date.localeCompare(b.date)
              );

              return {
                ...e,
                history: newHistory,
                sets: []
              };
            })
          };
        })
      };
      saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  // Measurement Operations
  const createMeasurement = useCallback((name) => {
    if (!name || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      const newId = uid();
      const newPosition = data.measurements.length;
      performCloudMutation(() => SupabaseService.createMeasurement(newId, name, today(), newPosition));
    } else {
      const newData = {
        ...data,
        measurements: [
          ...(data.measurements || []),
          { id: uid(), name, createdAt: today(), entries: [] }
        ]
      };
      saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const renameMeasurement = useCallback((id, newName) => {
    if (!newName || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      performCloudMutation(() => SupabaseService.renameMeasurement(id, newName));
    } else {
      const newData = {
        ...data,
        measurements: (data.measurements || []).map(m =>
          m.id === id ? { ...m, name: newName } : m
        )
      };
      saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const deleteMeasurement = useCallback((id) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      performCloudMutation(() => SupabaseService.deleteMeasurement(id));
    } else {
      const newData = {
        ...data,
        measurements: (data.measurements || []).filter(m => m.id !== id)
      };
      saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const addMeasurementEntry = useCallback((measId, value, unit, dateOffset) => {
    if (isNaN(value) || !data || sourceMode === 'loading' || sourceMode === 'migration') return;
    const logDate = getDateOffsetIso(dateOffset);

    if (sourceMode === 'cloud') {
      const newId = uid();
      performCloudMutation(() => SupabaseService.addMeasurementEntry(measId, newId, value, unit, logDate));
    } else {
      const newEntry = { id: uid(), date: logDate, value, unit };

      const newData = {
        ...data,
        measurements: (data.measurements || []).map(m => {
          if (m.id !== measId) return m;
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
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const deleteMeasurementEntry = useCallback((measId, entryId) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      performCloudMutation(() => SupabaseService.deleteMeasurementEntry(entryId));
    } else {
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
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  // Reorder Operations
  const reorderDays = useCallback((newDays) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      const payload = newDays.map((d, index) => ({ id: d.id, position: index }));
      performCloudMutation(() => SupabaseService.reorderDays(payload));
    } else {
      const newData = {
        ...data,
        days: newDays
      };
      saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const reorderExercises = useCallback((dayId, newExercises) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      const payload = newExercises.map((e, index) => ({ id: e.id, position: index }));
      performCloudMutation(() => SupabaseService.reorderExercises(payload));
    } else {
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
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const reorderMeasurements = useCallback((newMeasurements) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      const payload = newMeasurements.map((m, index) => ({ id: m.id, position: index }));
      performCloudMutation(() => SupabaseService.reorderMeasurements(payload));
    } else {
      const newData = {
        ...data,
        measurements: newMeasurements
      };
      saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);


  const value = {
    data,
    isMalformed,
    sourceMode,
    cloudStatus,
    cloudError,
    clearCloudError,
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
    reorderMeasurements,
    performCloudRestore
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useGymLogData() {
  return useContext(DataContext);
}
