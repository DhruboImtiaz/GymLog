-- Domain conflicts must not use serialization_failure: managed PostgREST 14
-- can retry SQLSTATE 40001 indefinitely. PT409 returns HTTP 409 immediately.
-- Preserve the installed definitions, ownership, grants and transaction logic.
DO $$
DECLARE target regprocedure; definition text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'public.apply_gymlog_migration(uuid,text,text,jsonb,boolean)'::regprocedure,
    'public.save_gymlog_session(uuid,text,text,date,jsonb,bigint)'::regprocedure,
    'public.mutate_gymlog_data(uuid,text,text,text,jsonb)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(target);
    EXECUTE replace(definition, quote_literal('40001'), quote_literal('PT409'));
  END LOOP;
END; $$;
NOTIFY pgrst, 'reload schema';
