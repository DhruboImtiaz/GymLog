-- Durable receipts and optimistic version checks for ordinary cloud writes.
ALTER TABLE public.gymlog_sync_operations DROP CONSTRAINT gymlog_sync_operations_kind_check;
ALTER TABLE public.gymlog_sync_operations ADD CONSTRAINT gymlog_sync_operations_kind_check CHECK (kind IN ('migration','session','mutation'));

CREATE FUNCTION public.mutate_gymlog_data(expected_user_id uuid, operation_id text, expected_version text, action text, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  uid uuid := gymlog_private.require_user(expected_user_id);
  prior_hash text; request_hash text; affected bigint; ids jsonb; target_table text; parent_id text; actual_count bigint;
BEGIN
  IF operation_id IS NULL OR length(operation_id) NOT BETWEEN 1 AND 200 OR expected_version IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Missing change identity, version or payload.' USING ERRCODE='22023';
  END IF;
  request_hash := md5(jsonb_build_object('kind','mutation','action',action,'payload',payload,'version',expected_version)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended('gymlog:' || uid::text,0));
  SELECT o.request_hash INTO prior_hash FROM public.gymlog_sync_operations o WHERE o.user_id=uid AND o.operation_id=mutate_gymlog_data.operation_id;
  IF FOUND THEN
    IF prior_hash <> request_hash THEN RAISE EXCEPTION 'Operation ID already used for different data.' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('success',true,'replayed',true);
  END IF;
  IF md5(gymlog_private.document()::text) IS DISTINCT FROM expected_version THEN
    RAISE EXCEPTION 'Cloud data changed on another device. Review the refreshed data; reopen any edit form before retrying.' USING ERRCODE='40001';
  END IF;
  IF action NOT IN ('reorder_days','reorder_exercises','reorder_measurements') THEN
    PERFORM gymlog_private.require_text(payload->'id');
  END IF;
  IF action IN ('create_day','rename_day','add_exercise','rename_exercise','create_measurement','rename_measurement') THEN
    PERFORM gymlog_private.require_text(payload->'name');
  END IF;

  CASE action
    WHEN 'create_day' THEN
      PERFORM gymlog_private.require_date(payload->'createdAt');
      INSERT INTO public.workout_days(id,user_id,name,created_at,position)
        SELECT payload->>'id',uid,payload->>'name',(payload->>'createdAt')::date,COALESCE(max(d.position),-1)+1 FROM public.workout_days d WHERE d.user_id=uid;
    WHEN 'rename_day' THEN
      UPDATE public.workout_days d SET name=payload->>'name' WHERE d.user_id=uid AND d.id=payload->>'id';
    WHEN 'delete_day' THEN
      DELETE FROM public.workout_days d WHERE d.user_id=uid AND d.id=payload->>'id';
    WHEN 'add_exercise' THEN
      PERFORM gymlog_private.require_text(payload->'dayId');
      INSERT INTO public.exercises(id,user_id,day_id,name,position)
        SELECT payload->>'id',uid,payload->>'dayId',payload->>'name',COALESCE(max(e.position),-1)+1 FROM public.exercises e WHERE e.user_id=uid AND e.day_id=payload->>'dayId';
    WHEN 'rename_exercise' THEN
      UPDATE public.exercises e SET name=payload->>'name' WHERE e.user_id=uid AND e.id=payload->>'id';
    WHEN 'delete_exercise' THEN
      DELETE FROM public.exercises e WHERE e.user_id=uid AND e.id=payload->>'id';
    WHEN 'add_set' THEN
      PERFORM public.add_gymlog_set(uid,payload->>'exerciseId',payload->>'id',(payload->>'reps')::int,(payload->>'weight')::numeric);
    WHEN 'update_set' THEN
      UPDATE public.active_sets s SET reps=(payload->>'reps')::int, weight=(payload->>'weight')::numeric WHERE s.user_id=uid AND s.id=payload->>'id';
    WHEN 'delete_set' THEN
      IF NOT EXISTS (SELECT 1 FROM public.active_sets s WHERE s.user_id=uid AND s.id=payload->>'id') THEN
        RAISE EXCEPTION 'This set no longer exists. Refresh before trying again.' USING ERRCODE='40001';
      END IF;
      PERFORM public.delete_gymlog_set(uid,payload->>'id');
    WHEN 'create_measurement' THEN
      PERFORM gymlog_private.require_date(payload->'createdAt');
      INSERT INTO public.measurements(id,user_id,name,created_at,position)
        SELECT payload->>'id',uid,payload->>'name',(payload->>'createdAt')::date,COALESCE(max(m.position),-1)+1 FROM public.measurements m WHERE m.user_id=uid;
    WHEN 'rename_measurement' THEN
      UPDATE public.measurements m SET name=payload->>'name' WHERE m.user_id=uid AND m.id=payload->>'id';
    WHEN 'delete_measurement' THEN
      DELETE FROM public.measurements m WHERE m.user_id=uid AND m.id=payload->>'id';
    WHEN 'add_measurement_entry' THEN
      PERFORM gymlog_private.require_date(payload->'logDate'); PERFORM gymlog_private.require_text(payload->'unit');
      INSERT INTO public.measurement_entries(id,user_id,measurement_id,log_date,value,unit)
        VALUES(payload->>'id',uid,payload->>'measurementId',(payload->>'logDate')::date,(payload->>'value')::numeric,payload->>'unit');
    WHEN 'delete_measurement_entry' THEN
      DELETE FROM public.measurement_entries e WHERE e.user_id=uid AND e.id=payload->>'id';
    WHEN 'reorder_days','reorder_exercises','reorder_measurements' THEN
      ids := payload->'ids'; PERFORM gymlog_private.require_array(ids);
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(ids) i WHERE jsonb_typeof(i.value) <> 'string') OR
         (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(ids)) <> jsonb_array_length(ids) THEN
        RAISE EXCEPTION 'Invalid or duplicate ordering IDs.' USING ERRCODE='22023';
      END IF;
      target_table := CASE action WHEN 'reorder_days' THEN 'workout_days' WHEN 'reorder_exercises' THEN 'exercises' ELSE 'measurements' END;
      IF action='reorder_exercises' THEN
        parent_id := payload->>'dayId'; PERFORM gymlog_private.require_text(payload->'dayId');
        SELECT count(*) INTO actual_count FROM public.exercises e WHERE e.user_id=uid AND e.day_id=parent_id;
        IF actual_count <> jsonb_array_length(ids) OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(ids) i WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.user_id=uid AND e.day_id=parent_id AND e.id=i.value)
        ) THEN RAISE EXCEPTION 'Exercise order changed. Refresh and try again.' USING ERRCODE='40001'; END IF;
      ELSE
        EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id=$1',target_table) INTO actual_count USING uid;
        EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id=$1 AND id IN (SELECT value FROM jsonb_array_elements_text($2))',target_table) INTO affected USING uid,ids;
        IF actual_count <> jsonb_array_length(ids) OR affected <> actual_count THEN RAISE EXCEPTION 'List changed. Refresh and try again.' USING ERRCODE='40001'; END IF;
      END IF;
      -- All position updates share this transaction; names and values are never upserted.
      EXECUTE format('UPDATE public.%I t SET position=i.ordinality::int-1 FROM jsonb_array_elements_text($2) WITH ORDINALITY i WHERE t.user_id=$1 AND t.id=i.value',target_table) USING uid,ids;
    ELSE RAISE EXCEPTION 'Unsupported change.' USING ERRCODE='22023';
  END CASE;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF action IN ('rename_day','delete_day','rename_exercise','delete_exercise','update_set','rename_measurement','delete_measurement','delete_measurement_entry') AND affected=0 THEN
    RAISE EXCEPTION 'This item changed or was deleted. Refresh and try again.' USING ERRCODE='40001';
  END IF;
  INSERT INTO public.gymlog_sync_operations(user_id,operation_id,request_hash,kind) VALUES(uid,operation_id,request_hash,'mutation');
  RETURN jsonb_build_object('success',true,'replayed',false);
END; $$;
REVOKE ALL ON FUNCTION public.mutate_gymlog_data(uuid,text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mutate_gymlog_data(uuid,text,text,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
