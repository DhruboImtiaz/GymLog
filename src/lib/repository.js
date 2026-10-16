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

  mutateGymLogData: async (operation, expectedUserId) => {
    await getUserId(expectedUserId);
    const { data, error } = await supabase.rpc('mutate_gymlog_data', {
      expected_user_id: expectedUserId, operation_id: operation.id,
      expected_version: operation.expectedVersion, action: operation.action, payload: operation.payload
    });
    if (error) throw new RepositoryError(error.message, error.code);
    return data;
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

  replaceGymLogData: async (payload, expectedUserId, expectedVersion, operationId) => {
    return SupabaseService.applyMigration({ id: operationId, payload, expectedVersion, replace: true }, expectedUserId);
  }
};
