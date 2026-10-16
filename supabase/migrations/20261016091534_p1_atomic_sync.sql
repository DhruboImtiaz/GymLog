-- All authenticated writes take the same per-account transaction lock, including
-- writes from existing REST clients. New RPCs check identity and version under it.
CREATE SCHEMA IF NOT EXISTS gymlog_private;
REVOKE ALL ON SCHEMA gymlog_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA gymlog_private TO authenticated;

CREATE TABLE public.gymlog_sync_operations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_sequence bigint GENERATED ALWAYS AS IDENTITY,
  kind text NOT NULL CHECK (kind IN ('migration', 'session')),
  operation_id text NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 200),
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation_id)
);
CREATE INDEX gymlog_sync_generation ON public.gymlog_sync_operations(user_id, kind, operation_sequence DESC);
ALTER TABLE public.gymlog_sync_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_sync_operations ON public.gymlog_sync_operations FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
REVOKE ALL ON public.gymlog_sync_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.gymlog_sync_operations TO authenticated;
REVOKE ALL ON SEQUENCE public.gymlog_sync_operations_operation_sequence_seq FROM PUBLIC, anon;
GRANT USAGE ON SEQUENCE public.gymlog_sync_operations_operation_sequence_seq TO authenticated;

CREATE FUNCTION gymlog_private.require_user(expected_user_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF expected_user_id IS NULL OR auth.uid() IS DISTINCT FROM expected_user_id THEN
    RAISE EXCEPTION 'Account changed. Please sign in again.' USING ERRCODE = '42501';
  END IF;
  RETURN expected_user_id;
END; $$;

CREATE FUNCTION gymlog_private.lock_writes() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('gymlog:' || auth.uid()::text, 0));
  END IF;
  RETURN NULL;
END; $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['workout_days','exercises','active_sets','workout_history','workout_history_sets','measurements','measurement_entries'] LOOP
    EXECUTE format('CREATE TRIGGER gymlog_lock_writes BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION gymlog_private.lock_writes()', t);
  END LOOP;
END; $$;

-- A single SQL snapshot, with total ordering and no Data API nested-row truncation.
CREATE FUNCTION gymlog_private.document() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'days', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', d.id, 'name', d.name, 'createdAt', d.created_at,
      'exercises', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name,
        'sets', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'num', s.set_number, 'reps', s.reps, 'weight', s.weight) ORDER BY s.set_number, s.id)
          FROM public.active_sets s WHERE s.exercise_id=e.id AND s.user_id=d.user_id), '[]'::jsonb),
        'history', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', h.id, 'date', h.log_date,
          'sets', COALESCE((SELECT jsonb_agg(jsonb_build_object('num', hs.set_number, 'reps', hs.reps, 'weight', hs.weight) ORDER BY hs.set_number, hs.id)
            FROM public.workout_history_sets hs WHERE hs.history_id=h.id AND hs.user_id=d.user_id), '[]'::jsonb)
        ) ORDER BY h.log_date, h.id) FROM public.workout_history h WHERE h.exercise_id=e.id AND h.user_id=d.user_id), '[]'::jsonb)
      ) ORDER BY e.position, e.id) FROM public.exercises e WHERE e.day_id=d.id AND e.user_id=d.user_id), '[]'::jsonb)
    ) ORDER BY d.position, d.id) FROM public.workout_days d WHERE d.user_id=auth.uid()), '[]'::jsonb),
    'measurements', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name, 'createdAt', m.created_at,
      'entries', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', en.id, 'date', en.log_date, 'value', en.value, 'unit', en.unit) ORDER BY en.log_date, en.id)
        FROM public.measurement_entries en WHERE en.measurement_id=m.id AND en.user_id=m.user_id), '[]'::jsonb)
    ) ORDER BY m.position, m.id) FROM public.measurements m WHERE m.user_id=auth.uid()), '[]'::jsonb)
  );
$$;

CREATE FUNCTION public.get_gymlog_snapshot(expected_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE doc jsonb; BEGIN
  PERFORM gymlog_private.require_user(expected_user_id);
  doc := gymlog_private.document();
  RETURN doc || jsonb_build_object('_version', md5(doc::text), '_generation',
    COALESCE((SELECT max(o.operation_sequence) FROM public.gymlog_sync_operations o WHERE o.user_id=auth.uid() AND o.kind='migration'), 0)::text);
END; $$;

CREATE FUNCTION gymlog_private.require_array(value jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid or missing data array.' USING ERRCODE='22023';
  END IF;
END; $$;
CREATE FUNCTION gymlog_private.require_text(value jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'string' OR btrim(value #>> '{}') = '' THEN
    RAISE EXCEPTION 'Invalid or missing text field.' USING ERRCODE='22023';
  END IF;
END; $$;
CREATE FUNCTION gymlog_private.require_date(value jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM gymlog_private.require_text(value);
  IF (value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Invalid date.' USING ERRCODE='22023';
  END IF;
  PERFORM (value #>> '{}')::date;
END; $$;
CREATE FUNCTION gymlog_private.require_set(value jsonb, active boolean) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF active THEN PERFORM gymlog_private.require_text(value->'id'); END IF;
  IF jsonb_typeof(value->'num') IS DISTINCT FROM 'number' OR
     jsonb_typeof(value->'reps') IS DISTINCT FROM 'number' OR
     jsonb_typeof(value->'weight') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Invalid set values.' USING ERRCODE='22023';
  END IF;
  -- Table constraints validate ranges and integer casts before the RPC can commit.
END; $$;
CREATE FUNCTION gymlog_private.validate_document(payload jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE d jsonb; e jsonb; s jsonb; h jsonb; m jsonb; en jsonb;
BEGIN
  PERFORM gymlog_private.require_array(payload->'days');
  PERFORM gymlog_private.require_array(payload->'measurements');
  FOR d IN SELECT value FROM jsonb_array_elements(payload->'days') LOOP
    PERFORM gymlog_private.require_text(d->'id'); PERFORM gymlog_private.require_text(d->'name'); PERFORM gymlog_private.require_date(d->'createdAt');
    PERFORM gymlog_private.require_array(d->'exercises');
    FOR e IN SELECT value FROM jsonb_array_elements(d->'exercises') LOOP
      PERFORM gymlog_private.require_text(e->'id'); PERFORM gymlog_private.require_text(e->'name');
      PERFORM gymlog_private.require_array(e->'sets'); PERFORM gymlog_private.require_array(e->'history');
      FOR s IN SELECT value FROM jsonb_array_elements(e->'sets') LOOP PERFORM gymlog_private.require_set(s, true); END LOOP;
      FOR h IN SELECT value FROM jsonb_array_elements(e->'history') LOOP
        PERFORM gymlog_private.require_text(h->'id'); PERFORM gymlog_private.require_date(h->'date'); PERFORM gymlog_private.require_array(h->'sets');
        FOR s IN SELECT value FROM jsonb_array_elements(h->'sets') LOOP PERFORM gymlog_private.require_set(s, false); END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
  FOR m IN SELECT value FROM jsonb_array_elements(payload->'measurements') LOOP
    PERFORM gymlog_private.require_text(m->'id'); PERFORM gymlog_private.require_text(m->'name'); PERFORM gymlog_private.require_date(m->'createdAt');
    PERFORM gymlog_private.require_array(m->'entries');
    FOR en IN SELECT value FROM jsonb_array_elements(m->'entries') LOOP
      PERFORM gymlog_private.require_text(en->'id'); PERFORM gymlog_private.require_date(en->'date'); PERFORM gymlog_private.require_text(en->'unit');
      IF jsonb_typeof(en->'value') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid measurement value.' USING ERRCODE='22023'; END IF;
    END LOOP;
  END LOOP;
END; $$;
CREATE FUNCTION gymlog_private.replace_data(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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

  PERFORM gymlog_private.validate_document(payload);
  PERFORM pg_advisory_xact_lock(hashtextextended('gymlog:' || uid::text, 0));

  -- 2. Delete existing root data (CASCADE handles children)
  DELETE FROM public.workout_days WHERE user_id = uid;
  DELETE FROM public.measurements WHERE user_id = uid;

  -- 3. Extract and insert Days hierarchy
  IF payload ? 'days' AND jsonb_typeof(payload->'days') = 'array' THEN
    FOR i IN 0 .. jsonb_array_length(payload->'days') - 1 LOOP
      _day := payload->'days'->i;
      
      -- Insert Day
      INSERT INTO public.workout_days (id, user_id, name, created_at, position)
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
          INSERT INTO public.exercises (id, day_id, user_id, name, position)
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
              
              INSERT INTO public.active_sets (id, exercise_id, user_id, set_number, reps, weight)
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
              
              INSERT INTO public.workout_history (id, exercise_id, user_id, log_date)
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
                  
                  INSERT INTO public.workout_history_sets (history_id, user_id, set_number, reps, weight)
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
      
      INSERT INTO public.measurements (id, user_id, name, created_at, position)
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
          
          INSERT INTO public.measurement_entries (id, measurement_id, user_id, log_date, value, unit)
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


REVOKE EXECUTE ON FUNCTION public.replace_gymlog_data(jsonb) FROM authenticated, anon, PUBLIC;

CREATE FUNCTION public.apply_gymlog_migration(expected_user_id uuid, operation_id text, expected_version text, payload jsonb, replace_existing boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE uid uuid := gymlog_private.require_user(expected_user_id); prior_hash text; request_hash text; doc jsonb;
BEGIN
  IF operation_id IS NULL OR length(operation_id) NOT BETWEEN 1 AND 200 OR expected_version IS NULL OR replace_existing IS NULL THEN
    RAISE EXCEPTION 'Missing migration identity or version.' USING ERRCODE='22023';
  END IF;
  PERFORM gymlog_private.validate_document(payload);
  request_hash := md5(jsonb_build_object('kind','migration','payload',payload,'version',expected_version,'replace',replace_existing)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended('gymlog:' || uid::text, 0));
  SELECT o.request_hash INTO prior_hash FROM public.gymlog_sync_operations o WHERE o.user_id=uid AND o.operation_id=apply_gymlog_migration.operation_id;
  IF FOUND THEN
    IF prior_hash <> request_hash THEN RAISE EXCEPTION 'Operation ID already used for different data.' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('success',true,'replayed',true);
  END IF;
  doc := gymlog_private.document();
  IF md5(doc::text) IS DISTINCT FROM expected_version THEN
    RAISE EXCEPTION 'Cloud data changed. Refresh the conflict preview before continuing.' USING ERRCODE='40001';
  END IF;
  IF NOT replace_existing AND (jsonb_array_length(doc->'days') > 0 OR jsonb_array_length(doc->'measurements') > 0) THEN
    RAISE EXCEPTION 'Cloud data already exists. Refresh the conflict preview.' USING ERRCODE='40001';
  END IF;
  PERFORM gymlog_private.replace_data(payload);
  INSERT INTO public.gymlog_sync_operations(user_id,operation_id,request_hash,kind) VALUES(uid,operation_id,request_hash,'migration');
  RETURN jsonb_build_object('success',true,'replayed',false);
END; $$;

CREATE FUNCTION public.save_gymlog_session(expected_user_id uuid, operation_id text, exercise_id text, log_date date, sets jsonb, dataset_generation bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE uid uuid := gymlog_private.require_user(expected_user_id); prior_hash text; request_hash text; s jsonb;
BEGIN
  PERFORM gymlog_private.require_array(sets);
  IF jsonb_array_length(sets)=0 OR log_date IS NULL OR operation_id IS NULL THEN RAISE EXCEPTION 'No workout to save.' USING ERRCODE='22023'; END IF;
  request_hash := md5(jsonb_build_object('kind','session','exercise',exercise_id,'date',log_date,'sets',sets,'generation',dataset_generation)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended('gymlog:' || uid::text, 0));
  SELECT o.request_hash INTO prior_hash FROM public.gymlog_sync_operations o WHERE o.user_id=uid AND o.operation_id=save_gymlog_session.operation_id;
  IF FOUND THEN
    IF prior_hash <> request_hash THEN RAISE EXCEPTION 'Operation ID already used for different data.' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('success',true,'replayed',true);
  END IF;
  IF COALESCE((SELECT max(o.operation_sequence) FROM public.gymlog_sync_operations o WHERE o.user_id=uid AND o.kind='migration'), 0) IS DISTINCT FROM dataset_generation THEN
    RAISE EXCEPTION 'Your dataset was replaced on another device. Refresh before saving.' USING ERRCODE='40001';
  END IF;
  IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(sets)) <> jsonb_array_length(sets) THEN
    RAISE EXCEPTION 'Duplicate active sets.' USING ERRCODE='22023';
  END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(sets) LOOP
    PERFORM gymlog_private.require_set(s,true);
    IF NOT EXISTS (SELECT 1 FROM public.active_sets a WHERE a.user_id=uid AND a.exercise_id=save_gymlog_session.exercise_id AND a.id=s->>'id'
      AND a.reps=(s->>'reps')::int AND a.weight=(s->>'weight')::numeric AND a.set_number=(s->>'num')::int) THEN
      RAISE EXCEPTION 'Workout sets changed on another device. Refresh before saving.' USING ERRCODE='40001';
    END IF;
  END LOOP;
  INSERT INTO public.workout_history(id,exercise_id,user_id,log_date) VALUES(operation_id,exercise_id,uid,log_date);
  INSERT INTO public.workout_history_sets(history_id,user_id,set_number,reps,weight)
    SELECT operation_id,uid,(value->>'num')::int,(value->>'reps')::int,(value->>'weight')::numeric FROM jsonb_array_elements(sets);
  DELETE FROM public.active_sets a WHERE a.user_id=uid AND a.exercise_id=save_gymlog_session.exercise_id AND a.id IN (SELECT value->>'id' FROM jsonb_array_elements(sets));
  WITH numbered AS (SELECT a.id, row_number() OVER(ORDER BY a.set_number,a.id)::int AS n FROM public.active_sets a WHERE a.user_id=uid AND a.exercise_id=save_gymlog_session.exercise_id)
    UPDATE public.active_sets a SET set_number=n.n FROM numbered n WHERE a.user_id=uid AND a.id=n.id;
  INSERT INTO public.gymlog_sync_operations(user_id,operation_id,request_hash,kind) VALUES(uid,operation_id,request_hash,'session');
  RETURN jsonb_build_object('success',true,'replayed',false);
END; $$;

CREATE FUNCTION public.delete_gymlog_set(expected_user_id uuid, set_id text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE uid uuid := gymlog_private.require_user(expected_user_id); parent_id text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('gymlog:' || uid::text, 0));
  DELETE FROM public.active_sets a WHERE a.user_id=uid AND a.id=set_id RETURNING a.exercise_id INTO parent_id;
  WITH numbered AS (SELECT a.id, row_number() OVER(ORDER BY a.set_number,a.id)::int AS n FROM public.active_sets a WHERE a.user_id=uid AND a.exercise_id=parent_id)
    UPDATE public.active_sets a SET set_number=n.n FROM numbered n WHERE a.user_id=uid AND a.id=n.id;
END; $$;

CREATE FUNCTION public.add_gymlog_set(expected_user_id uuid, exercise_id text, set_id text, reps int, weight numeric) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE uid uuid := gymlog_private.require_user(expected_user_id); next_number int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('gymlog:' || uid::text, 0));
  SELECT COALESCE(max(a.set_number),0)+1 INTO next_number FROM public.active_sets a WHERE a.user_id=uid AND a.exercise_id=add_gymlog_set.exercise_id;
  INSERT INTO public.active_sets(id,exercise_id,user_id,set_number,reps,weight) VALUES(set_id,exercise_id,uid,next_number,reps,weight);
END; $$;

-- Explicit grants also work on projects with restrictive default privileges.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA gymlog_private FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA gymlog_private TO authenticated;
REVOKE ALL ON FUNCTION public.get_gymlog_snapshot(uuid), public.apply_gymlog_migration(uuid,text,text,jsonb,boolean), public.save_gymlog_session(uuid,text,text,date,jsonb,bigint), public.delete_gymlog_set(uuid,text), public.add_gymlog_set(uuid,text,text,int,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gymlog_snapshot(uuid), public.apply_gymlog_migration(uuid,text,text,jsonb,boolean), public.save_gymlog_session(uuid,text,text,date,jsonb,bigint), public.delete_gymlog_set(uuid,text), public.add_gymlog_set(uuid,text,text,int,numeric) TO authenticated;
NOTIFY pgrst, 'reload schema';
