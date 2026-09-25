-- ==========================================
-- ARCHITECTURAL FIX: MAKE HISTORY SETS USER-SCOPED
-- ==========================================
-- Replaces the global unique constraint on history sets with a user-scoped one 
-- to allow local client-generated history IDs to be replicated across accounts.

ALTER TABLE workout_history_sets 
DROP CONSTRAINT IF EXISTS unique_history_set;

ALTER TABLE workout_history_sets 
ADD CONSTRAINT unique_history_set UNIQUE (history_id, user_id, set_number);
