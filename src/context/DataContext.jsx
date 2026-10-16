import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getGymLogData, saveGymLogData } from '../storage/storage';
import { uid, today, getDateOffsetIso } from '../utils/helpers';
import { useAuth } from './AuthContext';
import { useMigration } from './MigrationContext';
import { SupabaseService } from '../lib/repository';
import { prepareGymLogData } from '../lib/syncOperations';
import { prepareCloudWrite, readPendingWrites, executeCloudWrite, acknowledgeCloudWrite, forgetCloudWrite, isDefinitiveRejection } from '../lib/cloudWriteJournal';

const DataContext = createContext();

export function DataProvider({ children }) {
  const { user, identityRef, identityEpoch } = useAuth();
  const { migrationState, migrationUserId, loading: migrationLoading } = useMigration();

  const [data, setData] = useState(null);
  const [loadedEpoch, setLoadedEpoch] = useState(null);
  const [isMalformed, setIsMalformed] = useState(false);
  const [sourceMode, setSourceMode] = useState('loading');
  const [cloudStatus, setCloudStatus] = useState('idle');
  const [cloudError, setCloudError] = useState(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingWrite, setPendingWrite] = useState(null);
  const [completedWrite, setCompletedWrite] = useState(null);
  const dataRef = useRef(null);
  const modeRef = useRef('loading');
  const guestRawRef = useRef(null);
  const mutationRef = useRef(null);
  const readSequenceRef = useRef(0);
  const readFlightRef = useRef(null);
  const refreshQueuedRef = useRef(false);
  const readyRef = useRef(false);
  readyRef.current = !migrationLoading && migrationState === 'completed' && migrationUserId === user?.id ? { userId: user?.id, epoch: identityEpoch } : null;
  const clearCloudError = useCallback(() => setCloudError(null), []);

  const syncPendingWrites = useCallback(userId => {
    const pending = readPendingWrites(userId);
    setPendingWrite(pending[0] || null);
    return pending;
  }, []);

  const loadGuest = useCallback(() => {
    try {
      const loaded = getGymLogData();
      guestRawRef.current = localStorage.getItem('gymlog_data');
      setIsMalformed(loaded === null);
      dataRef.current = loaded;
      setData(loaded);
      setCloudError(null);
      setCloudStatus('idle');
      return loaded !== null;
    } catch {
      dataRef.current = null;
      setData(null);
      setCloudStatus('error');
      setCloudError('Browser storage is unavailable. Enable storage access and retry loading your data.');
      return false;
    }
  }, []);

  const fetchSnapshot = useCallback(async (preserveError = false) => {
    const { userId, epoch } = identityRef.current;
    if (!userId || modeRef.current !== 'cloud' || readyRef.current?.userId !== userId || readyRef.current?.epoch !== epoch) return false;
    const existing = readFlightRef.current;
    if (existing?.epoch === epoch && existing.sequence === readSequenceRef.current) return existing.promise;
    const sequence = ++readSequenceRef.current;
    const isCurrent = () => identityRef.current.userId === userId && identityRef.current.epoch === epoch && readSequenceRef.current === sequence && modeRef.current === 'cloud';
    setRefreshing(true);
    const promise = (async () => {
      try {
        const cloud = await SupabaseService.fetchGymLogData(userId);
        if (!isCurrent()) return false;
        if (dataRef.current?._version !== cloud._version || dataRef.current?._generation !== cloud._generation) {
          dataRef.current = cloud;
          setData(cloud);
        }
        setCloudStatus('ready');
        if (!preserveError) setCloudError(null);
        try {
          // Acknowledged writes need a fresh read, never another write attempt.
          for (const op of readPendingWrites(userId)) {
            if (op.phase === 'acknowledged') { forgetCloudWrite(op); setCompletedWrite(op); }
          }
          syncPendingWrites(userId);
        } catch (e) { setCloudError(e.message); }
        return true;
      } catch (e) {
        if (isCurrent()) {
          setCloudStatus(dataRef.current ? 'stale' : 'error');
          if (!preserveError) setCloudError(e.message || 'Could not refresh cloud data. Retry when connected.');
        }
        return false;
      } finally {
        if (isCurrent()) setRefreshing(false);
        if (readFlightRef.current?.sequence === sequence) readFlightRef.current = null;
      }
    })();
    readFlightRef.current = { epoch, sequence, promise };
    return promise;
  }, [identityRef, syncPendingWrites]);

  const refreshCloud = useCallback(() => {
    if (!identityRef.current.userId && modeRef.current === 'guest') return Promise.resolve(loadGuest());
    if (mutationRef.current) { refreshQueuedRef.current = true; return Promise.resolve(false); }
    return fetchSnapshot();
  }, [identityRef, loadGuest, fetchSnapshot]);
  const retryCloud = refreshCloud;

  useEffect(() => {
    const { epoch } = identityRef.current;
    ++readSequenceRef.current;
    readFlightRef.current = null;
    mutationRef.current = null;
    refreshQueuedRef.current = false;
    dataRef.current = null;
    setData(null);
    setLoadedEpoch(epoch);
    setCloudBusy(false);
    setRefreshing(false);
    setIsMalformed(false);
    setPendingWrite(null);
    setCompletedWrite(null);
    setCloudError(null);
    setCloudStatus('idle');
    modeRef.current = 'loading';
    setSourceMode('loading');
    if (migrationLoading) return;
    if (!user) {
      modeRef.current = 'guest'; setSourceMode('guest'); loadGuest();
    } else if (!readyRef.current) {
      modeRef.current = 'migration'; setSourceMode('migration');
    } else {
      modeRef.current = 'cloud'; setSourceMode('cloud'); setCloudStatus('loading');
      try { syncPendingWrites(user.id); } catch (e) { setCloudError(e.message); }
      fetchSnapshot();
    }
    return () => { ++readSequenceRef.current; mutationRef.current = null; modeRef.current = 'loading'; };
  }, [user?.id, identityEpoch, identityRef, migrationUserId, migrationState, migrationLoading, loadGuest, syncPendingWrites, fetchSnapshot]);

  useEffect(() => {
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const refresh = () => { if (visible() && (typeof navigator === 'undefined' || navigator.onLine !== false)) refreshCloud(); };
    const onStorage = event => {
      if (modeRef.current === 'guest' && (!event.key || event.key === 'gymlog_data')) loadGuest();
      const userId = identityRef.current.userId;
      if (userId && (!event.key || event.key.startsWith(`gymlog_pending_write_${userId}_`))) {
        try { syncPendingWrites(userId); } catch (e) { setCloudError(e.message); }
        refresh();
      }
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('storage', onStorage);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(() => { if (modeRef.current === 'cloud') refresh(); }, 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('storage', onStorage);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', refresh);
    };
  }, [identityRef, refreshCloud, loadGuest, syncPendingWrites]);

  const saveAndSetData = useCallback(newData => {
    if (isMalformed || identityRef.current.userId || modeRef.current !== 'guest') return false;
    if (dataRef.current !== data) { setCloudError('Guest data changed. Review the refreshed data and try again.'); return false; }
    try {
      if (localStorage.getItem('gymlog_data') !== guestRawRef.current) {
        loadGuest();
        setCloudError('Guest data changed in another tab. Review the refreshed data and try again.');
        return false;
      }
      saveGymLogData(newData);
      guestRawRef.current = localStorage.getItem('gymlog_data');
      dataRef.current = newData;
      setData(newData);
      return true;
    } catch {
      setCloudError('Browser storage could not save this change. Free some storage and try again.');
      return false;
    }
  }, [isMalformed, identityRef, loadGuest, data]);

  const performCloudMutation = useCallback(async (descriptor, retryOperation = null) => {
    const { userId, epoch } = identityRef.current;
    if (!userId || modeRef.current !== 'cloud' || readyRef.current?.userId !== userId || readyRef.current?.epoch !== epoch || mutationRef.current) return false;
    const token = { userId, epoch };
    mutationRef.current = token;
    ++readSequenceRef.current; // Ignore reads begun before this write.
    setRefreshing(false);
    const isCurrent = () => identityRef.current.userId === userId && identityRef.current.epoch === epoch && mutationRef.current === token;
    setCloudBusy(true); setCloudError(null);
    let operation = retryOperation;
    try {
      const pending = syncPendingWrites(userId);
      if (!operation && pending.length) throw new Error('A previous change needs recovery. Retry that saved change before starting another.');
      if (!operation) operation = await prepareCloudWrite(descriptor, userId, descriptor.expectedVersion ?? dataRef.current?._version, isCurrent);
      if (!isCurrent()) return false;
      setPendingWrite(operation);
      await executeCloudWrite(operation, isCurrent);
      if (!isCurrent()) return false;
      setCompletedWrite(operation);
      try { acknowledgeCloudWrite(operation); setPendingWrite({ ...operation, phase: 'acknowledged' }); } catch { setCloudError('Change saved, but its recovery record could not be updated. Retry recovery when storage is available.'); }
      // A confirmed receipt is success even if the following read is temporarily unavailable.
      const refreshed = await fetchSnapshot();
      if (!isCurrent()) return false;
      if (refreshed) {
        try { forgetCloudWrite(operation); syncPendingWrites(userId); } catch { setCloudError('Change saved, but its recovery record could not be cleared. Retry recovery.'); }
      }
      return true;
    } catch (e) {
      if (!isCurrent()) return false;
      if (operation && isDefinitiveRejection(e)) {
        try { forgetCloudWrite(operation); } catch { /* Preserve and retry cleanup if storage is unavailable. */ }
      }
      try { syncPendingWrites(userId); } catch { /* Surface the original error; never send a new write. */ }
      await fetchSnapshot(true);
      if (isCurrent()) setCloudError(e.message || 'The outcome is uncertain. Retry the saved change safely.');
      return false;
    } finally {
      if (isCurrent()) {
        mutationRef.current = null;
        setCloudBusy(false);
        if (refreshQueuedRef.current) { refreshQueuedRef.current = false; refreshCloud(); }
      }
    }
  }, [identityRef, syncPendingWrites, fetchSnapshot, refreshCloud]);

  const retryPendingWrite = useCallback(() => {
    try {
      const operation = readPendingWrites(identityRef.current.userId)[0];
      return operation ? performCloudMutation(null, operation) : refreshCloud();
    } catch (e) { setCloudError(e.message); return Promise.resolve(false); }
  }, [identityRef, performCloudMutation, refreshCloud]);

  const performCloudRestore = useCallback(async (migratedDataModel, expectedVersion) => {
    const payload = prepareGymLogData(migratedDataModel['gymlog_data']);
    return performCloudMutation({ action: 'restore', payload, expectedVersion });
  }, [performCloudMutation]);

  // Workout Days Operations
  const createDay = useCallback((name) => {
    if (!name || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      const newId = uid();
      return performCloudMutation({ action: 'create_day', payload: { id: newId, name, createdAt: today() } });
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

  const renameDay = useCallback((id, newName, expectedVersion) => {
    if (!newName || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      return performCloudMutation({ action: 'rename_day', expectedVersion, payload: { id, name: newName } });
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
      return performCloudMutation({ action: 'delete_day', payload: { id } });
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
      const newId = uid();
      return performCloudMutation({ action: 'add_exercise', payload: { id: newId, dayId, name } });
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

  const renameExercise = useCallback((dayId, exId, newName, expectedVersion) => {
    if (!newName || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      return performCloudMutation({ action: 'rename_exercise', expectedVersion, payload: { id: exId, name: newName } });
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
      return performCloudMutation({ action: 'delete_exercise', payload: { id: exId } });
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
      const newId = uid();
      return performCloudMutation({ action: 'add_set', payload: { id: newId, exerciseId: exId, reps, weight } });
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

  const updateSet = useCallback((dayId, exId, setId, reps, weight, expectedVersion) => {
    if (!reps || isNaN(weight) || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      return performCloudMutation({ action: 'update_set', expectedVersion, payload: { id: setId, reps, weight } });
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
      return performCloudMutation({ action: 'delete_set', payload: { id: setId } });
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

      return performCloudMutation({ action: 'save_session', payload: { exerciseId: exId, logDate, sets: mappedSets, datasetGeneration: data._generation } });
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
      return performCloudMutation({ action: 'create_measurement', payload: { id: newId, name, createdAt: today() } });
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

  const renameMeasurement = useCallback((id, newName, expectedVersion) => {
    if (!newName || !data || sourceMode === 'loading' || sourceMode === 'migration') return;

    if (sourceMode === 'cloud') {
      return performCloudMutation({ action: 'rename_measurement', expectedVersion, payload: { id, name: newName } });
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
      return performCloudMutation({ action: 'delete_measurement', payload: { id } });
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
      return performCloudMutation({ action: 'add_measurement_entry', payload: { id: newId, measurementId: measId, value, unit, logDate } });
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
      return performCloudMutation({ action: 'delete_measurement_entry', payload: { id: entryId } });
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
      return performCloudMutation({ action: 'reorder_days', expectedVersion: data._version, payload: { ids: newDays.map(d => d.id) } });
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
      return performCloudMutation({ action: 'reorder_exercises', expectedVersion: data._version, payload: { dayId, ids: newExercises.map(e => e.id) } });
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
      return performCloudMutation({ action: 'reorder_measurements', expectedVersion: data._version, payload: { ids: newMeasurements.map(m => m.id) } });
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
    refreshing,
    pendingWrite,
    completedWrite,
    retryPendingWrite,
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
