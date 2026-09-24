import { supabase } from './supabaseClient';
import { SupabaseService, RepositoryError } from './repository';

class IntegrityError extends Error {
  constructor(message, mismatchType = 'LocalCloudValueMismatch') {
    super(message);
    this.name = 'IntegrityError';
    this.mismatchType = mismatchType;
  }
}

async function getUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthenticated user in MigrationService');
  return user.id;
}

export const MigrationService = {
  getMigrationState: async () => {
    try {
      const userId = await getUserId();
      return localStorage.getItem(`gymlog_migration_status_${userId}`) || 'pending';
    } catch (e) {
      return 'pending';
    }
  },

  setMigrationState: async (state) => {
    try {
      const userId = await getUserId();
      localStorage.setItem(`gymlog_migration_status_${userId}`, state);
    } catch (e) {
      console.warn('Failed to set migration state', e);
    }
  },

  migrateLocalData: async (localData) => {
    await MigrationService.setMigrationState('in_progress');
    
    try {
      // 1. Extract flat arrays from nested domain object
      const flatDays = [];
      const flatExercises = [];
      const flatActiveSets = [];
      const flatHistory = [];
      const flatHistorySets = [];
      const flatMeasurements = [];
      const flatMeasurementEntries = [];

      (localData.days || []).forEach((day, dayIndex) => {
        flatDays.push({ ...day, position: dayIndex });
        (day.exercises || []).forEach((ex, exIndex) => {
          flatExercises.push({ ...ex, dayId: day.id, position: exIndex });
          (ex.sets || []).forEach(s => {
            flatActiveSets.push({ ...s, exerciseId: ex.id });
          });
          (ex.history || []).forEach(h => {
            flatHistory.push({ ...h, exerciseId: ex.id });
            (h.sets || []).forEach(hs => {
              flatHistorySets.push({ ...hs, historyId: h.id });
            });
          });
        });
      });

      (localData.measurements || []).forEach((meas, measIndex) => {
        flatMeasurements.push({ ...meas, position: measIndex });
        (meas.entries || []).forEach(entry => {
          flatMeasurementEntries.push({ ...entry, measurementId: meas.id });
        });
      });

      // 2. Perform sequential batch upserts respecting foreign keys
      await SupabaseService.upsertDaysBatch(flatDays);
      await SupabaseService.upsertExercisesBatch(flatExercises);
      await SupabaseService.upsertActiveSetsBatch(flatActiveSets);
      await SupabaseService.upsertHistoryBatch(flatHistory);
      await SupabaseService.upsertHistorySetsBatch(flatHistorySets);
      await SupabaseService.upsertMeasurementsBatch(flatMeasurements);
      await SupabaseService.upsertMeasurementEntriesBatch(flatMeasurementEntries);
      
      // Upload succeeded, but DO NOT set completed yet. Must verify.
      await MigrationService.verifyMigration(localData);
      
      await MigrationService.setMigrationState('completed');
      return { success: true };
      
    } catch (error) {
      await MigrationService.setMigrationState('failed');
      if (error instanceof IntegrityError) {
        return { success: false, reason: error.mismatchType, message: error.message };
      }
      return { success: false, reason: 'MigrationFailure', message: error.message };
    }
  },

  verifyMigration: async (localData, cloudDataOverride = null) => {
    // Reconstruct full cloud domain
    const cloudData = cloudDataOverride || await SupabaseService.fetchGymLogData();
    
    // Arrays for easy matching
    const localDays = localData.days || [];
    const cloudDays = cloudData.days || [];
    
    // Detect CloudExtraDataMismatch at root level
    if (cloudDays.length > localDays.length) throw new IntegrityError(`Cloud has ${cloudDays.length} days but local has ${localDays.length}`, 'CloudExtraDataMismatch');
    if (cloudDays.length < localDays.length) throw new IntegrityError('Missing days in cloud');

    for (let i = 0; i < localDays.length; i++) {
      const ld = localDays[i];
      const cd = cloudDays[i];
      
      if (ld.id !== cd.id || ld.name !== cd.name || ld.createdAt !== cd.createdAt) {
        throw new IntegrityError(`Day mismatch at position ${i}`);
      }
      
      const localExs = ld.exercises || [];
      const cloudExs = cd.exercises || [];
      if (cloudExs.length > localExs.length) throw new IntegrityError(`Extra exercises in cloud for day ${ld.id}`, 'CloudExtraDataMismatch');
      if (cloudExs.length < localExs.length) throw new IntegrityError(`Missing exercises in cloud for day ${ld.id}`);

      for (let j = 0; j < localExs.length; j++) {
        const le = localExs[j];
        const ce = cloudExs[j];
        
        if (le.id !== ce.id || le.name !== ce.name) throw new IntegrityError(`Exercise mismatch at day ${ld.id} pos ${j}`);
        
        // Active sets
        const localSets = le.sets || [];
        const cloudSets = ce.sets || [];
        if (cloudSets.length > localSets.length) throw new IntegrityError(`Extra active sets in cloud for ex ${le.id}`, 'CloudExtraDataMismatch');
        if (cloudSets.length < localSets.length) throw new IntegrityError(`Missing active sets in cloud for ex ${le.id}`);
        for (let k = 0; k < localSets.length; k++) {
          const ls = localSets[k];
          const cs = cloudSets[k];
          if (ls.id !== cs.id || ls.num !== cs.num || ls.reps !== cs.reps || Number(ls.weight) !== Number(cs.weight)) {
            throw new IntegrityError(`Active set mismatch at ex ${le.id} pos ${k}`);
          }
        }
        
        // History
        const localHist = le.history || [];
        const cloudHist = ce.history || [];
        if (cloudHist.length > localHist.length) throw new IntegrityError(`Extra history in cloud for ex ${le.id}`, 'CloudExtraDataMismatch');
        if (cloudHist.length < localHist.length) throw new IntegrityError(`Missing history in cloud for ex ${le.id}`);
        for (let k = 0; k < localHist.length; k++) {
          const lh = localHist[k];
          const ch = cloudHist[k];
          if (lh.id !== ch.id || lh.date !== ch.date) throw new IntegrityError(`History mismatch at ex ${le.id} pos ${k}`);
          
          const lhSets = lh.sets || [];
          const chSets = ch.sets || [];
          if (chSets.length > lhSets.length) throw new IntegrityError(`Extra historical sets in cloud for hist ${lh.id}`, 'CloudExtraDataMismatch');
          if (chSets.length < lhSets.length) throw new IntegrityError(`Missing historical sets in cloud for hist ${lh.id}`);
          for (let l = 0; l < lhSets.length; l++) {
             const lhs = lhSets[l];
             const chs = chSets[l];
             if (lhs.num !== chs.num || lhs.reps !== chs.reps || Number(lhs.weight) !== Number(chs.weight)) {
                throw new IntegrityError(`History set mismatch at hist ${lh.id} pos ${l}`);
             }
          }
        }
      }
    }

    const localMeas = localData.measurements || [];
    const cloudMeas = cloudData.measurements || [];
    if (cloudMeas.length > localMeas.length) throw new IntegrityError(`Cloud has extra measurements`, 'CloudExtraDataMismatch');
    if (cloudMeas.length < localMeas.length) throw new IntegrityError('Missing measurements in cloud');
    
    for (let i = 0; i < localMeas.length; i++) {
      const lm = localMeas[i];
      const cm = cloudMeas[i];
      if (lm.id !== cm.id || lm.name !== cm.name || lm.createdAt !== cm.createdAt) throw new IntegrityError(`Measurement mismatch at pos ${i}`);
      
      const localEnt = lm.entries || [];
      const cloudEnt = cm.entries || [];
      if (cloudEnt.length > localEnt.length) throw new IntegrityError(`Extra measurement entries in cloud for meas ${lm.id}`, 'CloudExtraDataMismatch');
      if (cloudEnt.length < localEnt.length) throw new IntegrityError(`Missing measurement entries in cloud for meas ${lm.id}`);
      
      for (let j = 0; j < localEnt.length; j++) {
        const le = localEnt[j];
        const ce = cloudEnt[j];
        if (le.id !== ce.id || le.date !== ce.date || Number(le.value) !== Number(ce.value) || le.unit !== ce.unit) {
          throw new IntegrityError(`Measurement entry mismatch at meas ${lm.id} pos ${j}`);
        }
      }
    }
  },

  determineConflict: async (localData, cloudData) => {
    const localHasData = (localData?.days?.length > 0) || (localData?.measurements?.length > 0);
    const cloudHasData = (cloudData?.days?.length > 0) || (cloudData?.measurements?.length > 0);

    if (!localHasData && !cloudHasData) return 'NoData';
    if (!localHasData && cloudHasData) return 'CloudOnly';
    if (localHasData && !cloudHasData) return 'LocalOnly';

    try {
      await MigrationService.verifyMigration(localData, cloudData);
      return 'Matching';
    } catch (e) {
      if (e instanceof IntegrityError && e.mismatchType === 'CloudExtraDataMismatch') {
         return 'CloudExtraData';
      }
      return 'Conflict';
    }
  },

  replaceCloudData: async (localData) => {
    await MigrationService.setMigrationState('in_progress');
    try {
      const { error } = await supabase.rpc('replace_gymlog_data', { payload: localData });
      if (error) throw new Error(error.message);

      // Verify success directly against the canonical localData
      await MigrationService.verifyMigration(localData);

      await MigrationService.setMigrationState('completed');
      return { success: true };
    } catch (error) {
      await MigrationService.setMigrationState('failed');
      return { success: false, reason: 'MigrationFailure', message: error.message };
    }
  }
};
