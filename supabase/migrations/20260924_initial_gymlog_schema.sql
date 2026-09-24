-- ==========================================
-- GYMLOG INITIAL SCHEMA
-- ==========================================

-- Enable the pgcrypto extension for UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- 1. WORKOUT DAYS
-- ==========================================
CREATE TABLE workout_days (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at DATE NOT NULL DEFAULT CURRENT_DATE,
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE(id, user_id) -- Required for strict child ownership composite foreign keys
);
CREATE INDEX idx_workout_days_user_id ON workout_days(user_id);
CREATE INDEX idx_workout_days_position ON workout_days(position);

-- ==========================================
-- 2. EXERCISES
-- ==========================================
CREATE TABLE exercises (
    id TEXT PRIMARY KEY,
    day_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    
    FOREIGN KEY (day_id, user_id) REFERENCES workout_days(id, user_id) ON DELETE CASCADE,
    UNIQUE(id, user_id) -- Required for strict child ownership composite foreign keys
);
CREATE INDEX idx_exercises_day_user ON exercises(day_id, user_id);
CREATE INDEX idx_exercises_user_id ON exercises(user_id);
CREATE INDEX idx_exercises_position ON exercises(position);

-- ==========================================
-- 3. ACTIVE SETS
-- ==========================================
CREATE TABLE active_sets (
    id TEXT PRIMARY KEY,
    exercise_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    set_number INTEGER NOT NULL CHECK (set_number > 0),
    reps INTEGER NOT NULL CHECK (reps > 0),
    weight NUMERIC NOT NULL CHECK (weight >= 0),
    
    FOREIGN KEY (exercise_id, user_id) REFERENCES exercises(id, user_id) ON DELETE CASCADE
);
CREATE INDEX idx_active_sets_exercise_user ON active_sets(exercise_id, user_id);
CREATE INDEX idx_active_sets_user_id ON active_sets(user_id);
CREATE INDEX idx_active_sets_set_number ON active_sets(set_number);

-- ==========================================
-- 4. WORKOUT HISTORY
-- ==========================================
CREATE TABLE workout_history (
    id TEXT PRIMARY KEY,
    exercise_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    log_date DATE NOT NULL,
    
    FOREIGN KEY (exercise_id, user_id) REFERENCES exercises(id, user_id) ON DELETE CASCADE,
    UNIQUE(id, user_id) -- Required for strict child ownership composite foreign keys
);
CREATE INDEX idx_workout_history_exercise_user ON workout_history(exercise_id, user_id);
CREATE INDEX idx_workout_history_user_id ON workout_history(user_id);
CREATE INDEX idx_workout_history_log_date ON workout_history(log_date);

-- ==========================================
-- 5. WORKOUT HISTORY SETS
-- ==========================================
CREATE TABLE workout_history_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    history_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    set_number INTEGER NOT NULL CHECK (set_number > 0),
    reps INTEGER NOT NULL CHECK (reps > 0),
    weight NUMERIC NOT NULL CHECK (weight >= 0),
    
    FOREIGN KEY (history_id, user_id) REFERENCES workout_history(id, user_id) ON DELETE CASCADE
);
CREATE INDEX idx_history_sets_history_user ON workout_history_sets(history_id, user_id);
CREATE INDEX idx_history_sets_user_id ON workout_history_sets(user_id);

-- ==========================================
-- 6. MEASUREMENTS
-- ==========================================
CREATE TABLE measurements (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at DATE NOT NULL DEFAULT CURRENT_DATE,
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE(id, user_id) -- Required for strict child ownership composite foreign keys
);
CREATE INDEX idx_measurements_user_id ON measurements(user_id);
CREATE INDEX idx_measurements_position ON measurements(position);

-- ==========================================
-- 7. MEASUREMENT ENTRIES
-- ==========================================
CREATE TABLE measurement_entries (
    id TEXT PRIMARY KEY,
    measurement_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    log_date DATE NOT NULL,
    value NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    
    FOREIGN KEY (measurement_id, user_id) REFERENCES measurements(id, user_id) ON DELETE CASCADE
);
CREATE INDEX idx_measurement_entries_meas_user ON measurement_entries(measurement_id, user_id);
CREATE INDEX idx_measurement_entries_user_id ON measurement_entries(user_id);
CREATE INDEX idx_measurement_entries_log_date ON measurement_entries(log_date);


-- ==========================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE workout_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_history_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurement_entries ENABLE ROW LEVEL SECURITY;

-- Create unified ownership policies
-- Due to the strict composite foreign keys linking (parent_id, user_id), 
-- these single policies guarantee that User A cannot read, insert, update, 
-- or delete User B's data, nor insert children into User B's parents.

CREATE POLICY "Users can manage their own workout_days" 
ON workout_days FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own exercises" 
ON exercises FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own active_sets" 
ON active_sets FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own workout_history" 
ON workout_history FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own workout_history_sets" 
ON workout_history_sets FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own measurements" 
ON measurements FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own measurement_entries" 
ON measurement_entries FOR ALL USING (auth.uid() = user_id);
