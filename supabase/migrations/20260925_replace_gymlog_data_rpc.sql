-- ==========================================
-- REPLACE GYMLOG DATA RPC
-- ==========================================
-- Transactionally replaces the authenticated user's entire GymLog dataset.
-- Expects a payload matching the native nested domain model: { days, measurements }
-- Relies on ON DELETE CASCADE for children and SECURITY INVOKER for RLS.

CREATE OR REPLACE FUNCTION replace_gymlog_data(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  _day jsonb;
  _exercise jsonb;
  _set jsonb;
  _hist jsonb;
  _hset jsonb;
  _meas jsonb;
  _entry jsonb;
  i int; j int; k int; l int; m int;
BEGIN
  -- 1. Authorization
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Delete existing root data (CASCADE handles children)
  DELETE FROM workout_days WHERE user_id = uid;
  DELETE FROM measurements WHERE user_id = uid;

  -- 3. Extract and insert Days hierarchy
  IF payload ? 'days' AND jsonb_typeof(payload->'days') = 'array' THEN
    FOR i IN 0 .. jsonb_array_length(payload->'days') - 1 LOOP
      _day := payload->'days'->i;
      
      -- Insert Day
      INSERT INTO workout_days (id, user_id, name, created_at, position)
      VALUES (
        _day->>'id', 
        uid, 
        _day->>'name', 
        (_day->>'createdAt')::date, 
        i -- Position derived from array index
      );

      -- Extract Exercises
      IF _day ? 'exercises' AND jsonb_typeof(_day->'exercises') = 'array' THEN
        FOR j IN 0 .. jsonb_array_length(_day->'exercises') - 1 LOOP
          _exercise := _day->'exercises'->j;
          
          -- Insert Exercise
          INSERT INTO exercises (id, day_id, user_id, name, position)
          VALUES (
            _exercise->>'id', 
            _day->>'id', 
            uid, 
            _exercise->>'name', 
            j -- Position derived from array index
          );

          -- Extract Active Sets
          IF _exercise ? 'sets' AND jsonb_typeof(_exercise->'sets') = 'array' THEN
            FOR k IN 0 .. jsonb_array_length(_exercise->'sets') - 1 LOOP
              _set := _exercise->'sets'->k;
              
              INSERT INTO active_sets (id, exercise_id, user_id, set_number, reps, weight)
              VALUES (
                _set->>'id', 
                _exercise->>'id', 
                uid, 
                (_set->>'num')::int, 
                (_set->>'reps')::int, 
                (_set->>'weight')::numeric
              );
            END LOOP;
          END IF;

          -- Extract History
          IF _exercise ? 'history' AND jsonb_typeof(_exercise->'history') = 'array' THEN
            FOR l IN 0 .. jsonb_array_length(_exercise->'history') - 1 LOOP
              _hist := _exercise->'history'->l;
              
              INSERT INTO workout_history (id, exercise_id, user_id, log_date)
              VALUES (
                _hist->>'id', 
                _exercise->>'id', 
                uid, 
                (_hist->>'date')::date
              );

              -- Extract History Sets
              IF _hist ? 'sets' AND jsonb_typeof(_hist->'sets') = 'array' THEN
                FOR m IN 0 .. jsonb_array_length(_hist->'sets') - 1 LOOP
                  _hset := _hist->'sets'->m;
                  
                  INSERT INTO workout_history_sets (history_id, user_id, set_number, reps, weight)
                  VALUES (
                    _hist->>'id', 
                    uid, 
                    (_hset->>'num')::int, 
                    (_hset->>'reps')::int, 
                    (_hset->>'weight')::numeric
                  );
                END LOOP;
              END IF;
            END LOOP;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- 4. Extract and insert Measurements hierarchy
  IF payload ? 'measurements' AND jsonb_typeof(payload->'measurements') = 'array' THEN
    FOR i IN 0 .. jsonb_array_length(payload->'measurements') - 1 LOOP
      _meas := payload->'measurements'->i;
      
      INSERT INTO measurements (id, user_id, name, created_at, position)
      VALUES (
        _meas->>'id', 
        uid, 
        _meas->>'name', 
        (_meas->>'createdAt')::date, 
        i -- Position derived from array index
      );

      IF _meas ? 'entries' AND jsonb_typeof(_meas->'entries') = 'array' THEN
        FOR j IN 0 .. jsonb_array_length(_meas->'entries') - 1 LOOP
          _entry := _meas->'entries'->j;
          
          INSERT INTO measurement_entries (id, measurement_id, user_id, log_date, value, unit)
          VALUES (
            _entry->>'id', 
            _meas->>'id', 
            uid, 
            (_entry->>'date')::date, 
            (_entry->>'value')::numeric, 
            _entry->>'unit'
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;

END;
$$;

-- Secure the function execution
REVOKE EXECUTE ON FUNCTION replace_gymlog_data(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_gymlog_data(jsonb) TO authenticated;
