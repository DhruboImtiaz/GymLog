-- ==========================================
-- CORRECT PRIVILEGES FOR GYMLOG SCHEMA
-- ==========================================
-- This migration fixes the 'permission denied' Postgres role errors.
-- It explicitly revokes 'anon' access and strictly grants the required
-- operations to the 'authenticated' Supabase API role.
-- RLS policies created previously will govern the row-level logic.

-- 1. WORKOUT DAYS
REVOKE ALL ON TABLE workout_days FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workout_days TO authenticated;

-- 2. EXERCISES
REVOKE ALL ON TABLE exercises FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE exercises TO authenticated;

-- 3. ACTIVE SETS
REVOKE ALL ON TABLE active_sets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE active_sets TO authenticated;

-- 4. WORKOUT HISTORY
REVOKE ALL ON TABLE workout_history FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workout_history TO authenticated;

-- 5. WORKOUT HISTORY SETS
REVOKE ALL ON TABLE workout_history_sets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workout_history_sets TO authenticated;

-- 6. MEASUREMENTS
REVOKE ALL ON TABLE measurements FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE measurements TO authenticated;

-- 7. MEASUREMENT ENTRIES
REVOKE ALL ON TABLE measurement_entries FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE measurement_entries TO authenticated;
