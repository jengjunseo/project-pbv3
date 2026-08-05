-- Run only after applying the PBV3.1 migration to a disposable/preview database.
-- Every assertion is read-only and the transaction is rolled back.
begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition, false) then
    raise exception 'SECURITY CHECK FAILED: %', message;
  end if;
end;
$$;

select pg_temp.assert_true(
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='pb_v3_slots' and column_name='object_path'),
  'PBV3.1 migration is not applied'
);
select pg_temp.assert_true(
  (select public = false from storage.buckets where id='pb-v3'),
  'pb-v3 bucket must be private'
);
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.pb_v3_slots', 'select') and not has_table_privilege('anon', 'public.pb_v3_slots', 'insert') and not has_table_privilege('anon', 'public.pb_v3_slots', 'update') and not has_table_privilege('anon', 'public.pb_v3_slots', 'delete'),
  'anon must not have direct slot CRUD'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.pb_v3_slots', 'select') and not has_table_privilege('authenticated', 'public.pb_v3_slots', 'insert') and not has_table_privilege('authenticated', 'public.pb_v3_slots', 'update') and not has_table_privilege('authenticated', 'public.pb_v3_slots', 'delete'),
  'authenticated must not have direct slot CRUD'
);
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.pb_v3_upload_capabilities', 'select') and not has_table_privilege('anon', 'public.pb_v3_upload_capabilities', 'insert'),
  'anon must not access upload capabilities'
);
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.pb_v3_cleanup_queue', 'select') and not has_table_privilege('anon', 'public.pb_v3_cleanup_queue', 'insert'),
  'anon must not access cleanup queue'
);
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.pb_v3_rate_limits', 'select') and not has_table_privilege('anon', 'public.pb_v3_rate_limits', 'insert'),
  'anon must not access rate limits'
);
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.pb_v3_commit_slot(smallint,text,text,uuid,text)', 'execute'),
  'anon must not execute commit RPC'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.pb_v3_prepare_upload(smallint,text,text,text,bigint,text,timestamp with time zone)', 'execute'),
  'authenticated must not execute upload RPC'
);
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.pb_v3_clear_slot(smallint)', 'execute')
  and not has_function_privilege('authenticated', 'public.pb_v3_clear_slot(smallint)', 'execute'),
  'PUBLIC/anon/authenticated must not execute privileged RPCs'
);
select pg_temp.assert_true(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='pb_v3_evict_oldest'),
  'legacy SECURITY DEFINER eviction function must be removed'
);
select pg_temp.assert_true(
  not exists (select 1 from information_schema.triggers where event_object_schema='public' and event_object_table='pb_v3_slots' and trigger_name='pb_v3_evict_after_write'),
  'legacy eviction trigger must be removed'
);
select pg_temp.assert_true(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.pb_v3_slots'::regclass),
  'slot table must enable and force RLS'
);
select pg_temp.assert_true(
  not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname in ('pb_v3_storage_select','pb_v3_storage_insert','pb_v3_storage_update','pb_v3_storage_delete')
  ),
  'legacy anonymous storage policies must be gone'
);
select pg_temp.assert_true(
  exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='pb_v3_storage_deny_direct'
      and permissive='RESTRICTIVE'
  ),
  'restrictive PB storage deny policy must exist'
);
select pg_temp.assert_true(
  not exists (
    select 1
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'pb_v3_%'
      and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) setting where setting like 'search_path=%')
  ),
  'every SECURITY DEFINER function must pin search_path'
);

rollback;
