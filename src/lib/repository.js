import { supabase } from './supabaseClient.js';
import { fingerprint, prepareGymLogData } from './syncOperations.js';

export class RepositoryError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = 'RepositoryError';
  }
}

/**
 * Gets the authenticated user ID.
 * Throws an error if the user is not authenticated.
 */
async function getUserId(expectedUserId) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new RepositoryError('User not authenticated.');
  }
  if (!expectedUserId || user.id !== expectedUserId) throw new RepositoryError('Your account changed. Please try again.', '42501');
  return user.id;
}

/**
 * SupabaseService encapsulates all GymLog relational database operations,
 * exposing domain-friendly methods and returning the exact domain model structure
 * expected by the application.
 */
export const SupabaseService = {
  fetchGymLogData: async (expectedUserId) => {
    await getUserId(expectedUserId);
    const { data, error } = await supabase.rpc('get_gymlog_snapshot', { expected_user_id: expectedUserId });
    if (error) throw new RepositoryError(error.message, error.code);
    return data;
  },

  applyMigration: async (operation, expectedUserId) => {
    await getUserId(expectedUserId);
    const { data, error } = await supabase.rpc('apply_gymlog_migration', {
      expected_user_id: expectedUserId, operation_id: operation.id,
      expected_version: operation.expectedVersion, payload: prepareGymLogData(operation.payload),
      replace_existing: operation.replace
    });
    if (error) throw new RepositoryError(error.message, error.code);
    return data;
  },

  // --- DAYS ---
  createDay: async (id, name, createdAt, position, expectedUserId) => {
    const userId = await getUserId(expectedUserId);
    const { error } = await supabase.from('workout_days').insert({
      id, user_id: userId, name, created_at: createdAt, position
    });
    if (error) throw new RepositoryError(error.message, error.code);
  },

  renameDay: async (id, newName, expectedUserId) => {
    const userId = await getUserId(expectedUserId);
    const { error } = await supabase.from('workout_days').update({ name: newName }).eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message, error.code);
  },

  deleteDay: async (id, expectedUserId) => {
    const userId = await getUserId(expectedUserId);
    const { error } = await supabase.from('workout_days').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message, error.code);
  },

  // --- EXERCISES ---
  addExercise: async (dayId, id, name, position, expectedUserId) => {
    const userId = await getUserId(expectedUserId);
    const { error } = await supabase.from('exercises').insert({
      id, day_id: dayId, user_id: userId, name, position
    });
    if (error) throw new RepositoryError(error.message, error.code);
  },

  renameExercise: async (id, newName, expectedUserId) => {
    const userId = await getUserId(expectedUserId);
    const { error } = await supabase.from('exercises').update({ name: newName }).eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message, error.code);
  },

  deleteExercise: async (id, expectedUserId) => {
    const userId = await getUserId(expectedUserId);
    const { error } = await supabase.from('exercises').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message, error.code);
  },

  // Set numbering and session writes run under the same account transaction lock.
  addSet: async (exerciseId, id, setNumber, reps, weight, expectedUserId) => {
    await getUserId(expectedUserId);
    const { error } = await supabase.rpc('add_gymlog_set', {
      expected_user_id: expectedUserId, exercise_id: exerciseId, set_id: id, reps, weight
    });
    if (error) throw new RepositoryError(error.message, error.code);
  },

  updateSet: async (id, reps, weight, expectedUserId) => {
    const userId = await getUserId(expectedUserId);
    const { error } = await supabase.from('active_sets').update({ reps, weight }).eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message, error.code);
  },

  deleteSet: async (id, expectedUserId) => {
    await getUserId(expectedUserId);
    const { error } = await supabase.rpc('delete_gymlog_set', { expected_user_id: expectedUserId, set_id: id });
    if (error) throw new RepositoryError(error.message, error.code);
  },

  saveSession: async (exerciseId, logDate, sets, expectedUserId, datasetGeneration) => {
    // Identical active-set snapshots share an operation ID across retries/devices.
    const orderedSets = sets.map(s => ({ id: s.id, num: s.num, reps: s.reps, weight: s.weight }))
      .sort((a, b) => a.num - b.num || a.id.localeCompare(b.id));
    const operationId = 'session-' + await fingerprint({ exerciseId, logDate, sets: orderedSets, datasetGeneration });
    await getUserId(expectedUserId);
    const { data, error } = await supabase.rpc('save_gymlog_session', {
      expected_user_id: expectedUserId, operation_id: operationId,
      exercise_id: exerciseId, log_date: logDate, sets: orderedSets, dataset_generation: datasetGeneration
    });
    if (error) throw new RepositoryError(error.message, error.code);
    return data;
  },

  // --- MEASUREMENTS ---
  createMeasurement: async (id, name, createdAt, position, expectedUserId) => {
    const userId = await getUserId(expectedUserId);
    const { error } = await supabase.from('measurements').insert({
      id, user_id: userId, name, created_at: createdAt, position
    });
    if (error) throw new RepositoryError(error.message, error.code);
  },

  renameMeasurement: async (id, newName, expectedUserId) => {
    const userId = await getUserId(expectedUserId);
    const { error } = await supabase.from('measurements').update({ name: newName }).eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message, error.code);
  },

  deleteMeasurement: async (id, expectedUserId) => {
    const userId = await getUserId(expectedUserId);
    const { error } = await supabase.from('measurements').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message, error.code);
  },

  addMeasurementEntry: async (measurementId, id, value, unit, logDate, expectedUserId) => {
    const userId = await getUserId(expectedUserId);
    const { error } = await supabase.from('measurement_entries').insert({
      id, measurement_id: measurementId, user_id: userId, value, unit, log_date: logDate
    });
    if (error) throw new RepositoryError(error.message, error.code);
  },

  deleteMeasurementEntry: async (id, expectedUserId) => {
    const userId = await getUserId(expectedUserId);
    const { error } = await supabase.from('measurement_entries').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new RepositoryError(error.message, error.code);
  },

  // --- REORDERING ---
  /**
   * Reorders items by performing sequential UPDATEs of positions.
   * Note: This is NOT a transactional guarantee in Supabase JS REST APIs, and could partially fail.
   */
  reorderDays: async (days, expectedUserId) => {
    const userId = await getUserId(expectedUserId);
    for (const day of days) {
      const { error } = await supabase.from('workout_days').update({ position: day.position }).eq('id', day.id).eq('user_id', userId);
      if (error) throw new RepositoryError(`Partial failure reordering day ${day.id}: ${error.message}`);
    }
  },

  reorderExercises: async (exercises, expectedUserId) => {
    const userId = await getUserId(expectedUserId);
    for (const ex of exercises) {
      const { error } = await supabase.from('exercises').update({ position: ex.position }).eq('id', ex.id).eq('user_id', userId);
      if (error) throw new RepositoryError(`Partial failure reordering exercise ${ex.id}: ${error.message}`);
    }
  },

  reorderMeasurements: async (measurements, expectedUserId) => {
    const userId = await getUserId(expectedUserId);
    for (const meas of measurements) {
      const { error } = await supabase.from('measurements').update({ position: meas.position }).eq('id', meas.id).eq('user_id', userId);
      if (error) throw new RepositoryError(`Partial failure reordering measurement ${meas.id}: ${error.message}`);
    }
  },

  replaceGymLogData: async (payload, expectedUserId, expectedVersion, operationId) => {
    return SupabaseService.applyMigration({ id: operationId, payload, expectedVersion, replace: true }, expectedUserId);
  }
};
