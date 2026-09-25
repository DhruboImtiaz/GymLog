-- ==========================================
-- ARCHITECTURAL FIX: MAKE ENTITY IDENTITY USER-SCOPED
-- ==========================================
-- This migration converts standard global primary keys into composite
-- (id, user_id) primary keys to allow local client-generated IDs 
-- to be safely replicated across different accounts.

-- 1. Temporarily drop the dependent composite foreign keys
ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_day_id_user_id_fkey;
ALTER TABLE active_sets DROP CONSTRAINT IF EXISTS active_sets_exercise_id_user_id_fkey;
ALTER TABLE workout_history DROP CONSTRAINT IF EXISTS workout_history_exercise_id_user_id_fkey;
ALTER TABLE workout_history_sets DROP CONSTRAINT IF EXISTS workout_history_sets_history_id_user_id_fkey;
ALTER TABLE measurement_entries DROP CONSTRAINT IF EXISTS measurement_entries_measurement_id_user_id_fkey;

-- 2. Drop the singular primary keys and now-redundant unique constraints
ALTER TABLE workout_days 
  DROP CONSTRAINT IF EXISTS workout_days_pkey,
  DROP CONSTRAINT IF EXISTS workout_days_id_user_id_key;

ALTER TABLE exercises 
  DROP CONSTRAINT IF EXISTS exercises_pkey,
  DROP CONSTRAINT IF EXISTS exercises_id_user_id_key;

ALTER TABLE active_sets 
  DROP CONSTRAINT IF EXISTS active_sets_pkey;

ALTER TABLE workout_history 
  DROP CONSTRAINT IF EXISTS workout_history_pkey,
  DROP CONSTRAINT IF EXISTS workout_history_id_user_id_key;

ALTER TABLE measurements 
  DROP CONSTRAINT IF EXISTS measurements_pkey,
  DROP CONSTRAINT IF EXISTS measurements_id_user_id_key;

ALTER TABLE measurement_entries 
  DROP CONSTRAINT IF EXISTS measurement_entries_pkey;

-- 3. Create composite primary keys
ALTER TABLE workout_days ADD PRIMARY KEY (id, user_id);
ALTER TABLE exercises ADD PRIMARY KEY (id, user_id);
ALTER TABLE active_sets ADD PRIMARY KEY (id, user_id);
ALTER TABLE workout_history ADD PRIMARY KEY (id, user_id);
ALTER TABLE measurements ADD PRIMARY KEY (id, user_id);
ALTER TABLE measurement_entries ADD PRIMARY KEY (id, user_id);

-- 4. Recreate the composite foreign keys (exact same definitions)
ALTER TABLE exercises 
  ADD CONSTRAINT exercises_day_id_user_id_fkey 
  FOREIGN KEY (day_id, user_id) REFERENCES workout_days(id, user_id) ON DELETE CASCADE;

ALTER TABLE active_sets 
  ADD CONSTRAINT active_sets_exercise_id_user_id_fkey 
  FOREIGN KEY (exercise_id, user_id) REFERENCES exercises(id, user_id) ON DELETE CASCADE;

ALTER TABLE workout_history 
  ADD CONSTRAINT workout_history_exercise_id_user_id_fkey 
  FOREIGN KEY (exercise_id, user_id) REFERENCES exercises(id, user_id) ON DELETE CASCADE;

ALTER TABLE workout_history_sets 
  ADD CONSTRAINT workout_history_sets_history_id_user_id_fkey 
  FOREIGN KEY (history_id, user_id) REFERENCES workout_history(id, user_id) ON DELETE CASCADE;

ALTER TABLE measurement_entries 
  ADD CONSTRAINT measurement_entries_measurement_id_user_id_fkey 
  FOREIGN KEY (measurement_id, user_id) REFERENCES measurements(id, user_id) ON DELETE CASCADE;
