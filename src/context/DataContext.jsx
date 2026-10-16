import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getGymLogData, saveGymLogData } from '../storage/storage';
import { uid, today, getDateOffsetIso } from '../utils/helpers';
import { useAuth } from './AuthContext';
import { useMigration } from './MigrationContext';
import { SupabaseService } from '../lib/repository';
import { prepareGymLogData } from '../lib/syncOperations';

const DataContext = createContext();

export function DataProvider({ children }) {
  const { user, identityRef, identityEpoch } = useAuth();
  const { migrationState, migrationUserId, loading: migrationLoading } = useMigration();

  const [data, setData] = useState(null);
  const [loadedEpoch, setLoadedEpoch] = useState(null);
  const [isMalformed, setIsMalformed] = useState(false);
  const [sourceMode, setSourceMode] = useState('loading'); // 'guest' | 'migration' | 'cloud' | 'loading'
  const [cloudStatus, setCloudStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [cloudError, setCloudError] = useState(null);

  const [cloudBusy, setCloudBusy] = useState(false);
  const mutationRef = useRef(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const retryCloud = useCallback(() => setRefreshNonce(n => n + 1), []);

  const clearCloudError = useCallback(() => setCloudError(null), []);

  const currentUserIdRef = useRef(user?.id);
  currentUserIdRef.current = user?.id; // Synchronize explicitly during render

  useEffect(() => {
    let active = true;
    const requestId = user?.id;
    const epoch = identityRef.current.epoch;
    setLoadedEpoch(epoch);
    mutationRef.current = null;
    setCloudBusy(false);
    setIsMalformed(false);

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

    if (migrationState !== 'completed' || migrationUserId !== requestId) {
      setSourceMode('migration');
      setData(null);
      return;
    }

    // Cloud Mode
    setSourceMode('cloud');
    setCloudStatus('loading');

    async function fetchCloud() {
      try {
        const cloudData = await SupabaseService.fetchGymLogData(requestId);
        if (!active) return;
        if (currentUserIdRef.current !== requestId || identityRef.current.epoch !== epoch) return;
        setData(cloudData);
        setCloudStatus('ready');
      } catch (err) {
        if (!active) return;
        if (currentUserIdRef.current !== requestId || identityRef.current.epoch !== epoch) return;
        console.error('Failed to load cloud data', err);
        setCloudStatus('error');
      }
    }

    fetchCloud();

    return () => {
      active = false;
    };
  }, [user?.id, identityEpoch, identityRef, migrationUserId, migrationState, migrationLoading, refreshNonce]);

  const saveAndSetData = useCallback((newData) => {
    if (isMalformed || identityRef.current.userId) return false;
    try {
      saveGymLogData(newData);
      setData(newData);
      return true;
    } catch {
      setCloudError('Browser storage could not save this change. Free some storage and try again.');
      return false;
    }
  }, [isMalformed, identityRef]);

  // Serialize local writes; server transactions handle cross-device concurrency.
  const performCloudMutation = useCallback(async mutationFn => {
    const { userId: requestId, epoch } = identityRef.current;
    if (!requestId || sourceMode !== 'cloud' || migrationUserId !== requestId || mutationRef.current) return false;
    const operation = { requestId, epoch };
    mutationRef.current = operation;
    const isCurrent = () => identityRef.current.userId === requestId && identityRef.current.epoch === epoch && mutationRef.current === operation;
    setCloudBusy(true);
    setCloudError(null);
    try {
      await mutationFn(requestId);
      if (!isCurrent()) return false;
      const newCloudData = await SupabaseService.fetchGymLogData(requestId);
      if (!isCurrent()) return false;
      setData(newCloudData);
      return true;
    } catch (err) {
      if (!isCurrent()) return false;
      // Reconcile uncertain outcomes before exposing another write attempt.
      try {
        const latest = await SupabaseService.fetchGymLogData(requestId);
        if (isCurrent()) setData(latest);
      } catch {
        if (isCurrent()) setCloudStatus('error');
      }
      if (isCurrent()) setCloudError(err.message || 'Sync failed. Refresh before trying again.');
      return false;
    } finally {
      if (isCurrent()) { mutationRef.current = null; setCloudBusy(false); }
    }
  }, [sourceMode, identityRef, migrationUserId]);

  const performCloudRestore = useCallback(async migratedDataModel => {
    const domainModel = prepareGymLogData(migratedDataModel['gymlog_data']);
    const expectedVersion = data?._version;
    const operationId = crypto.randomUUID();
    return performCloudMutation(userId => SupabaseService.replaceGymLogData(domainModel, userId, expectedVersion, operationId));
  }, [data, performCloudMutation]);

  // Workout Days Operations
  const createDay = useCallback((name) => {
    if (!name || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      const newId = uid();
      const newPosition = data.days.length;
      return performCloudMutation(userId => SupabaseService.createDay(newId, name, today(), newPosition, userId));
    } else {
      const newData = {
        ...data,
        days: [
          ...data.days,
          { id: uid(), name, createdAt: today(), exercises: [] }
        ]
      };
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const renameDay = useCallback((id, newName) => {
    if (!newName || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      return performCloudMutation(userId => SupabaseService.renameDay(id, newName, userId));
    } else {
      const newData = {
        ...data,
        days: data.days.map(day => day.id === id ? { ...day, name: newName } : day)
      };
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const deleteDay = useCallback((id) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      return performCloudMutation(userId => SupabaseService.deleteDay(id, userId));
    } else {
      const newData = {
        ...data,
        days: data.days.filter(day => day.id !== id)
      };
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  // Exercises Operations
  const addExercise = useCallback((dayId, name) => {
    if (!name || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      const day = data.days.find(d => d.id === dayId);
      const newPosition = day ? (day.exercises || []).length : 0;
      const newId = uid();
      return performCloudMutation(userId => SupabaseService.addExercise(dayId, newId, name, newPosition, userId));
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
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const renameExercise = useCallback((dayId, exId, newName) => {
    if (!newName || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      return performCloudMutation(userId => SupabaseService.renameExercise(exId, newName, userId));
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
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const deleteExercise = useCallback((dayId, exId) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      return performCloudMutation(userId => SupabaseService.deleteExercise(exId, userId));
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
      return saveAndSetData(newData);
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
      return performCloudMutation(userId => SupabaseService.addSet(exId, newId, newNum, reps, weight, userId));
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
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const updateSet = useCallback((dayId, exId, setId, reps, weight) => {
    if (!reps || isNaN(weight) || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      return performCloudMutation(userId => SupabaseService.updateSet(setId, reps, weight, userId));
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
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const deleteSet = useCallback((dayId, exId, setId) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      return performCloudMutation(userId => SupabaseService.deleteSet(setId, userId));
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
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const saveSession = useCallback((dayId, exId, dateOffset) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    const logDate = getDateOffsetIso(dateOffset);

    if (sourceMode === 'cloud') {
      const day = data.days.find(d => d.id === dayId);
      const ex = day ? (day.exercises || []).find(e => e.id === exId) : null;
      if (!ex || !ex.sets || ex.sets.length === 0) return;

      const mappedSets = ex.sets.map(s => ({
        id: s.id,
        num: s.num,
        reps: s.reps,
        weight: s.weight
      }));

      return performCloudMutation(userId => SupabaseService.saveSession(exId, logDate, mappedSets, userId));
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
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  // Measurement Operations
  const createMeasurement = useCallback((name) => {
    if (!name || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      const newId = uid();
      const newPosition = data.measurements.length;
      return performCloudMutation(userId => SupabaseService.createMeasurement(newId, name, today(), newPosition, userId));
    } else {
      const newData = {
        ...data,
        measurements: [
          ...(data.measurements || []),
          { id: uid(), name, createdAt: today(), entries: [] }
        ]
      };
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const renameMeasurement = useCallback((id, newName) => {
    if (!newName || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      return performCloudMutation(userId => SupabaseService.renameMeasurement(id, newName, userId));
    } else {
      const newData = {
        ...data,
        measurements: (data.measurements || []).map(m =>
          m.id === id ? { ...m, name: newName } : m
        )
      };
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const deleteMeasurement = useCallback((id) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      return performCloudMutation(userId => SupabaseService.deleteMeasurement(id, userId));
    } else {
      const newData = {
        ...data,
        measurements: (data.measurements || []).filter(m => m.id !== id)
      };
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const addMeasurementEntry = useCallback((measId, value, unit, dateOffset) => {
    if (isNaN(value) || !data || sourceMode === 'loading' || sourceMode === 'migration') return;
    const logDate = getDateOffsetIso(dateOffset);

    if (sourceMode === 'cloud') {
      const newId = uid();
      return performCloudMutation(userId => SupabaseService.addMeasurementEntry(measId, newId, value, unit, logDate, userId));
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
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const deleteMeasurementEntry = useCallback((measId, entryId) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      return performCloudMutation(userId => SupabaseService.deleteMeasurementEntry(entryId, userId));
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
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  // Reorder Operations
  const reorderDays = useCallback((newDays) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      const payload = newDays.map((d, index) => ({ id: d.id, position: index }));
      return performCloudMutation(userId => SupabaseService.reorderDays(payload, userId));
    } else {
      const newData = {
        ...data,
        days: newDays
      };
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const reorderExercises = useCallback((dayId, newExercises) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      const payload = newExercises.map((e, index) => ({ id: e.id, position: index }));
      return performCloudMutation(userId => SupabaseService.reorderExercises(payload, userId));
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
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);

  const reorderMeasurements = useCallback((newMeasurements) => {
    if (!data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      const payload = newMeasurements.map((m, index) => ({ id: m.id, position: index }));
      return performCloudMutation(userId => SupabaseService.reorderMeasurements(payload, userId));
    } else {
      const newData = {
        ...data,
        measurements: newMeasurements
      };
      return saveAndSetData(newData);
    }
  }, [data, saveAndSetData, sourceMode, performCloudMutation]);


  const sameIdentity = loadedEpoch === identityRef.current.epoch;
  const value = {
    data: sameIdentity ? data : null,
    isMalformed: sameIdentity && isMalformed,
    sourceMode: sameIdentity ? sourceMode : 'loading',
    cloudStatus,
    cloudBusy,
    retryCloud,
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
