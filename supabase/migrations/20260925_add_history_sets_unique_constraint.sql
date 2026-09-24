-- ==========================================
-- ADD UNIQUE CONSTRAINT FOR HISTORICAL SETS
-- ==========================================
-- Required for idempotent migration of legacy localStorage data 
-- which lacks IDs for historical sets.

ALTER TABLE workout_history_sets 
ADD CONSTRAINT unique_history_set UNIQUE (history_id, set_number);
