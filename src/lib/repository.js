import { supabase } from './supabaseClient.js';

export class RepositoryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RepositoryError';
  }
}

/**
 * Gets the authenticated user ID.
 * Throws an error if the user is not authenticated.
 */
async function getUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new RepositoryError('User not authenticated.');
  }
  return user.id;
}

/**
 * SupabaseService encapsulates all GymLog relational database operations,
 * exposing domain-friendly methods and returning the exact domain model structure
 * expected by the application.
 */
export const SupabaseService = {
  /**
   * Reconstructs the complete { days, measurements } nested tree 
   * preserving all deterministic ordering.
   */
  fetchGymLogData: async () => {
    const userId = await getUserId();

    // 1. Fetch Days (and nested exercises/active_sets)
    const { data: daysData, error: daysError } = await supabase
      .from('workout_days')
      .select(`
        id, name, created_at, position,
        exercises (
          id, name, position,
          active_sets (
            id, set_number, reps, weight
          ),
          workout_history (
            id, log_date,
            workout_history_sets (
              id, set_number, reps, weight
            )
          )
        )
      `)
      .eq('user_id', userId)
      .order('position', { ascending: true })
      .order('position', { foreignTable: 'exercises', ascending: true })
      .order('set_number', { foreignTable: 'exercises.active_sets', ascending: true })
      .order('log_date', { foreignTable: 'exercises.workout_history', ascending: true })
      .order('set_number', { foreignTable: 'exercises.workout_history.workout_history_sets', ascending: true });

    if (daysError) throw new RepositoryError(daysError.message);

    // 2. Fetch Measurements (and nested entries)
    const { data: measData, error: measError } = await supabase
      .from('measurements')
      .select(`
        id, name, created_at, position,
        measurement_entries (
          id, log_date, value, unit
        )
      `)
      .eq('user_id', userId)
      .order('position', { ascending: true })
      .order('log_date', { foreignTable: 'measurement_entries', ascending: true });

    if (measError) throw new RepositoryError(measError.message);

    // Reconstruct Days Domain Model
    const days = (daysData || []).map(day => ({
      id: day.id,
      name: day.name,
      createdAt: day.created_at,
      exercises: (day.exercises || []).map(ex => ({
        id: ex.id,
        name: ex.name,
        sets: (ex.active_sets || []).map(set => ({
          id: set.id,
          num: set.set_number,
          reps: set.reps,
          weight: Number(set.weight)
        })),
        history: (ex.workout_history || []).map(hist => ({
          id: hist.id,
          date: hist.log_date,
          sets: (hist.workout_history_sets || []).map(hSet => ({
            num: hSet.set_number,
            reps: hSet.reps,
            weight: Number(hSet.weight)
          }))
        }))
      }))
    }));

    // Reconstruct Measurements Domain Model
    const measurements = (measData || []).map(meas => ({
      id: meas.id,
      name: meas.name,
      createdAt: meas.created_at,
      entries: (meas.measurement_entries || []).map(entry => ({
        id: entry.id,
        date: entry.log_date,
        value: Number(entry.value),
        unit: entry.unit
      }))
    }));

    return { days, measurements };
  },

  // --- DAYS ---
  createDay: async (id, name, createdAt, position) => {
    const userId = await getUserId();
    const { error } = await supabase.from('workout_days').insert({
      id, user_id: userId, name, created_at: createdAt, position
    });
    if (error) throw new RepositoryError(error.message);
  },

  renameDay: async (id, newName) => {
    const userId = await getUserId();
    const { error } = await supabase.from('workout_days').update({ name: newName }).eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message);
  },

  deleteDay: async (id) => {
    const userId = await getUserId();
    const { error } = await supabase.from('workout_days').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message);
  },

  // --- EXERCISES ---
  addExercise: async (dayId, id, name, position) => {
    const userId = await getUserId();
    const { error } = await supabase.from('exercises').insert({
      id, day_id: dayId, user_id: userId, name, position
    });
    if (error) throw new RepositoryError(error.message);
  },

  renameExercise: async (id, newName) => {
    const userId = await getUserId();
    const { error } = await supabase.from('exercises').update({ name: newName }).eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message);
  },

  deleteExercise: async (id) => {
    const userId = await getUserId();
    const { error } = await supabase.from('exercises').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message);
  },

  // --- SETS ---
  addSet: async (exerciseId, id, setNumber, reps, weight) => {
    const userId = await getUserId();
    const { error } = await supabase.from('active_sets').insert({
      id, exercise_id: exerciseId, user_id: userId, set_number: setNumber, reps, weight
    });
    if (error) throw new RepositoryError(error.message);
  },

  updateSet: async (id, reps, weight) => {
    const userId = await getUserId();
    const { error } = await supabase.from('active_sets').update({ reps, weight }).eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message);
  },

  /**
   * deleteSet deletes the set and optionally batch-updates the set_numbers of remaining sets.
   * Note: This is NOT a transactional guarantee in Supabase JS REST APIs, and could partially fail.
   */
  deleteSet: async (id, remainingSetsUpdates = []) => {
    const userId = await getUserId();
    const { error: delError } = await supabase.from('active_sets').delete().eq('id', id).eq('user_id', userId);
    if (delError) throw new RepositoryError(delError.message);

    // If remaining sets need numbering updates, perform an upsert batch
    if (remainingSetsUpdates.length > 0) {
      const payload = remainingSetsUpdates.map(s => ({
        id: s.id,
        exercise_id: s.exerciseId, // Requires exercise_id to satisfy NOT NULL constraints
        user_id: userId,
        set_number: s.newSetNumber,
        reps: s.reps,
        weight: s.weight
      }));
      const { error: updError } = await supabase.from('active_sets').upsert(payload, { onConflict: 'id' });
      if (updError) throw new RepositoryError(`Partial failure: Set deleted, but renumbering failed: ${updError.message}`);
    }
  },

  // --- HISTORY ---
  /**
   * saveSession inserts a workout_history record and its associated sets.
   * It also clears the active sets for that exercise.
   * Note: These are multiple REST calls and are NOT transactional. A partial failure could occur.
   */
  saveSession: async (exerciseId, historyId, logDate, sets) => {
    const userId = await getUserId();
    
    // 1. Insert history parent
    const { error: histError } = await supabase.from('workout_history').insert({
      id: historyId, exercise_id: exerciseId, user_id: userId, log_date: logDate
    });
    if (histError) throw new RepositoryError(histError.message);

    // 2. Insert history sets
    if (sets.length > 0) {
      const setsPayload = sets.map(s => ({
        history_id: historyId,
        user_id: userId,
        set_number: s.num,
        reps: s.reps,
        weight: s.weight
      }));
      const { error: setsError } = await supabase.from('workout_history_sets').insert(setsPayload);
      if (setsError) throw new RepositoryError(`Partial failure: History created, but sets failed: ${setsError.message}`);
    }

    // 3. Clear active sets for the exercise
    const { error: clearError } = await supabase.from('active_sets').delete().eq('exercise_id', exerciseId).eq('user_id', userId);
    if (clearError) throw new RepositoryError(`Partial failure: Session saved, but active sets not cleared: ${clearError.message}`);
  },

  // --- MEASUREMENTS ---
  createMeasurement: async (id, name, createdAt, position) => {
    const userId = await getUserId();
    const { error } = await supabase.from('measurements').insert({
      id, user_id: userId, name, created_at: createdAt, position
    });
    if (error) throw new RepositoryError(error.message);
  },

  renameMeasurement: async (id, newName) => {
    const userId = await getUserId();
    const { error } = await supabase.from('measurements').update({ name: newName }).eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message);
  },

  deleteMeasurement: async (id) => {
    const userId = await getUserId();
    const { error } = await supabase.from('measurements').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message);
  },

  addMeasurementEntry: async (measurementId, id, value, unit, logDate) => {
    const userId = await getUserId();
    const { error } = await supabase.from('measurement_entries').insert({
      id, measurement_id: measurementId, user_id: userId, value, unit, log_date: logDate
    });
    if (error) throw new RepositoryError(error.message);
  },

  deleteMeasurementEntry: async (id) => {
    const userId = await getUserId();
    const { error } = await supabase.from('measurement_entries').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message);
  },

  // --- REORDERING ---
  /**
   * Reorders items by performing sequential UPDATEs of positions.
   * Note: This is NOT a transactional guarantee in Supabase JS REST APIs, and could partially fail.
   */
  reorderDays: async (days) => {
    const userId = await getUserId();
    for (const day of days) {
      const { error } = await supabase.from('workout_days').update({ position: day.position }).eq('id', day.id).eq('user_id', userId);
      if (error) throw new RepositoryError(`Partial failure reordering day ${day.id}: ${error.message}`);
    }
  },

  reorderExercises: async (exercises) => {
    const userId = await getUserId();
    for (const ex of exercises) {
      const { error } = await supabase.from('exercises').update({ position: ex.position }).eq('id', ex.id).eq('user_id', userId);
      if (error) throw new RepositoryError(`Partial failure reordering exercise ${ex.id}: ${error.message}`);
    }
  },

  reorderMeasurements: async (measurements) => {
    const userId = await getUserId();
    for (const meas of measurements) {
      const { error } = await supabase.from('measurements').update({ position: meas.position }).eq('id', meas.id).eq('user_id', userId);
      if (error) throw new RepositoryError(`Partial failure reordering measurement ${meas.id}: ${error.message}`);
    }
  },

  // ==========================================
  // MIGRATION BATCH METHODS (NON-TRANSACTIONAL)
  // ==========================================
  
  upsertDaysBatch: async (days) => {
    if (!days || days.length === 0) return;
    const userId = await getUserId();
    const payload = days.map(day => ({
      id: day.id,
      user_id: userId,
      name: day.name,
      created_at: day.createdAt,
      position: day.position
    }));
    const { error } = await supabase.from('workout_days').upsert(payload, { onConflict: 'id, user_id' });
    if (error) throw new RepositoryError(`Batch upsert days failed: ${error.message}`);
  },

  upsertExercisesBatch: async (exercises) => {
    if (!exercises || exercises.length === 0) return;
    const userId = await getUserId();
    const payload = exercises.map(ex => ({
      id: ex.id,
      day_id: ex.dayId,
      user_id: userId,
      name: ex.name,
      position: ex.position
    }));
    const { error } = await supabase.from('exercises').upsert(payload, { onConflict: 'id, user_id' });
    if (error) throw new RepositoryError(`Batch upsert exercises failed: ${error.message}`);
  },

  upsertActiveSetsBatch: async (sets) => {
    if (!sets || sets.length === 0) return;
    const userId = await getUserId();
    const payload = sets.map(s => ({
      id: s.id,
      exercise_id: s.exerciseId,
      user_id: userId,
      set_number: s.num,
      reps: s.reps,
      weight: s.weight
    }));
    // No composite constraint on active_sets, rely on id
    const { error } = await supabase.from('active_sets').upsert(payload, { onConflict: 'id' });
    if (error) throw new RepositoryError(`Batch upsert active sets failed: ${error.message}`);
  },

  upsertHistoryBatch: async (histories) => {
    if (!histories || histories.length === 0) return;
    const userId = await getUserId();
    const payload = histories.map(h => ({
      id: h.id,
      exercise_id: h.exerciseId,
      user_id: userId,
      log_date: h.date
    }));
    const { error } = await supabase.from('workout_history').upsert(payload, { onConflict: 'id, user_id' });
    if (error) throw new RepositoryError(`Batch upsert history failed: ${error.message}`);
  },

  upsertHistorySetsBatch: async (historySets) => {
    if (!historySets || historySets.length === 0) return;
    const userId = await getUserId();
    const payload = historySets.map(hs => ({
      history_id: hs.historyId,
      user_id: userId,
      set_number: hs.num,
      reps: hs.reps,
      weight: hs.weight
    }));
    // Legacy historical sets have no IDs, so we rely on the composite unique constraint
    const { error } = await supabase.from('workout_history_sets').upsert(payload, { onConflict: 'history_id, set_number' });
    if (error) throw new RepositoryError(`Batch upsert history sets failed: ${error.message}`);
  },

  upsertMeasurementsBatch: async (measurements) => {
    if (!measurements || measurements.length === 0) return;
    const userId = await getUserId();
    const payload = measurements.map(m => ({
      id: m.id,
      user_id: userId,
      name: m.name,
      created_at: m.createdAt,
      position: m.position
    }));
    const { error } = await supabase.from('measurements').upsert(payload, { onConflict: 'id, user_id' });
    if (error) throw new RepositoryError(`Batch upsert measurements failed: ${error.message}`);
  },

  upsertMeasurementEntriesBatch: async (entries) => {
    if (!entries || entries.length === 0) return;
    const userId = await getUserId();
    const payload = entries.map(e => ({
      id: e.id,
      measurement_id: e.measurementId,
      user_id: userId,
      log_date: e.date,
      value: e.value,
      unit: e.unit
    }));
    // No composite constraint on measurement_entries, rely on id
    const { error } = await supabase.from('measurement_entries').upsert(payload, { onConflict: 'id' });
    if (error) throw new RepositoryError(`Batch upsert measurement entries failed: ${error.message}`);
  }
};
