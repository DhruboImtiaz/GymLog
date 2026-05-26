-- ============================================================
-- GymLog 2.0 — Supabase Database Setup
-- Run this entire script in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── TABLES ───────────────────────────────────────────────────

-- profiles: extended user information
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- workout_days: top-level workout categories per user
CREATE TABLE IF NOT EXISTS workout_days (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- exercises: individual exercises within a workout day
CREATE TABLE IF NOT EXISTS exercises (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id     UUID NOT NULL REFERENCES workout_days(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- workout_sessions: a saved workout session for an exercise (history entry)
CREATE TABLE IF NOT EXISTS workout_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id  UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- workout_sets: individual sets within a saved workout session
CREATE TABLE IF NOT EXISTS workout_sets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  set_number INT NOT NULL CHECK (set_number > 0),
  reps       NUMERIC(6,1) NOT NULL CHECK (reps > 0),
  weight     NUMERIC(7,2) NOT NULL CHECK (weight >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- measurements: body metric categories per user
CREATE TABLE IF NOT EXISTS measurements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- measurement_entries: individual logged values for a measurement
CREATE TABLE IF NOT EXISTS measurement_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_id UUID NOT NULL REFERENCES measurements(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value          NUMERIC(10,3) NOT NULL,
  unit           TEXT NOT NULL CHECK (char_length(trim(unit)) > 0),
  entry_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
-- Each user can only access their own rows. Period.

ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_days        ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurement_entries ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users own their profile"
  ON profiles FOR ALL
  USING      (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- workout_days
CREATE POLICY "Users own their workout days"
  ON workout_days FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- exercises
CREATE POLICY "Users own their exercises"
  ON exercises FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- workout_sessions
CREATE POLICY "Users own their workout sessions"
  ON workout_sessions FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- workout_sets: no user_id column; ownership verified via session join
CREATE POLICY "Users own their workout sets"
  ON workout_sets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workout_sessions s
      WHERE s.id = workout_sets.session_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_sessions s
      WHERE s.id = workout_sets.session_id
        AND s.user_id = auth.uid()
    )
  );

-- measurements
CREATE POLICY "Users own their measurements"
  ON measurements FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- measurement_entries
CREATE POLICY "Users own their measurement entries"
  ON measurement_entries FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── PERFORMANCE INDEXES ──────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_workout_days_user_id       ON workout_days(user_id);
CREATE INDEX IF NOT EXISTS idx_exercises_day_id           ON exercises(day_id);
CREATE INDEX IF NOT EXISTS idx_exercises_user_id          ON exercises(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_ex_id     ON workout_sessions(exercise_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_id   ON workout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_sets_session_id    ON workout_sets(session_id);
CREATE INDEX IF NOT EXISTS idx_measurements_user_id       ON measurements(user_id);
CREATE INDEX IF NOT EXISTS idx_measurement_entries_meas   ON measurement_entries(measurement_id);
CREATE INDEX IF NOT EXISTS idx_measurement_entries_user   ON measurement_entries(user_id);

-- ── AUTH TRIGGERS ────────────────────────────────────────────

-- Automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    new.id, 
    new.raw_user_meta_data->>'full_name'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
