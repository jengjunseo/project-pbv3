-- PBV3.1 persistence boundary
-- Apply to a disposable/preview branch first. This migration is intentionally not auto-applied by the app.

begin;

create extension if not exists pgcrypto with schema extensions;

-- Remove the legacy client-authoritative eviction trigger.
drop trigger if exists pb_v3_evict_after_write on public.pb_v3_slots;
drop function if exists public.pb_v3_evict_oldest();

-- Remove the legacy anonymous CRUD surface.
drop policy if exists pb_v3_public_select on public.pb_v3_slots;
drop policy if exists pb_v3_public_insert on public.pb_v3_slots;
drop policy if exists pb_v3_public_update on public.pb_v3_slots;
drop policy if exists pb_v3_public_delete on public.pb_v3_slots;

drop policy if exists pb_v3_storage_select on storage.objects;
drop policy if exists pb_v3_storage_insert on storage.objects;
drop policy if exists pb_v3_storage_update on storage.objects;
drop policy if exists pb_v3_storage_delete on storage.objects;

-- Keep the legacy columns for a reversible migration, while moving authority to typed server-owned columns.
alter table public.pb_v3_slots add column if not exists object_path text;
alter table public.pb_v3_slots add column if not exists file_name text;
alter table public.pb_v3_slots add column if not exists file_type text;
alter table public.pb_v3_slots add column if not exists file_bytes bigint not null default 0;
alter table public.pb_v3_slots add column if not exists text_bytes bigint not null default 0;
alter table public.pb_v3_slots add column if not exists created_at timestamptz not null default now();
alter table public.pb_v3_slots add column if not exists revision bigint not null default 1;

update public.pb_v3_slots
set
  object_path = coalesce(
    object_path,
    nullif(file->>'objectPath', ''),
    nullif(file->>'pathname', ''),
    nullif(file->>'path', '')
  ),
  file_name = coalesce(file_name, nullif(file->>'name', '')),
  file_type = coalesce(file_type, nullif(file->>'type', '')),
  file_bytes = 0,
  text_bytes = octet_length(text),
  created_at = coalesce(created_at, updated_at, now()),
  revision = greatest(revision, 1);

-- Recompute every legacy file from authoritative Storage metadata. Client JSON size/type is not trusted.
update public.pb_v3_slots s
set
  file_name = coalesce(s.file_name, nullif(regexp_replace(s.object_path, '^.*/', ''), '')),
  file_type = coalesce(
    nullif(o.metadata->>'mimetype', ''),
    nullif(o.metadata->>'contentType', ''),
    nullif(s.file_type, ''),
    'application/octet-stream'
  ),
  file_bytes = (o.metadata->>'size')::bigint
from storage.objects o
where s.object_path is not null
  and o.bucket_id = 'pb-v3'
  and o.name = s.object_path
  and coalesce(o.metadata->>'size', '') ~ '^[0-9]+$'
  and (o.metadata->>'size')::bigint between 1 and 10485760;

-- Legacy rows that point at missing/invalid Storage metadata must not keep a broken file reference.
update public.pb_v3_slots s
set
  object_path = null,
  file_name = null,
  file_type = null,
  file_bytes = 0,
  file = null,
  text_bytes = octet_length(s.text),
  bytes = octet_length(s.text)
where s.object_path is not null
  and not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'pb-v3'
      and o.name = s.object_path
      and coalesce(o.metadata->>'size', '') ~ '^[0-9]+$'
      and (o.metadata->>'size')::bigint between 1 and 10485760
  );

update public.pb_v3_slots
set
  text_bytes = octet_length(text),
  bytes = octet_length(text) + file_bytes,
  file = case
    when object_path is null then null
    else jsonb_build_object(
      'pathname', object_path,
      'name', file_name,
      'type', coalesce(file_type, 'application/octet-stream'),
      'size', file_bytes
    )
  end;

alter table public.pb_v3_slots drop constraint if exists pb_v3_slots_bytes_check;
alter table public.pb_v3_slots add constraint pb_v3_slots_bytes_check check (bytes >= 0);
alter table public.pb_v3_slots drop constraint if exists pb_v3_slots_file_bytes_check;
alter table public.pb_v3_slots add constraint pb_v3_slots_file_bytes_check check (file_bytes between 0 and 10485760);
alter table public.pb_v3_slots drop constraint if exists pb_v3_slots_text_bytes_check;
alter table public.pb_v3_slots add constraint pb_v3_slots_text_bytes_check check (text_bytes = octet_length(text));
alter table public.pb_v3_slots drop constraint if exists pb_v3_slots_total_bytes_check;
alter table public.pb_v3_slots add constraint pb_v3_slots_total_bytes_check check (bytes = text_bytes + file_bytes);
alter table public.pb_v3_slots drop constraint if exists pb_v3_slots_file_shape_check;
alter table public.pb_v3_slots add constraint pb_v3_slots_file_shape_check check (
  (object_path is null and file_name is null and file_type is null and file_bytes = 0 and file is null)
  or
  (object_path is not null and file_name is not null and file_type is not null and file_bytes > 0 and file is not null)
);
alter table public.pb_v3_slots drop constraint if exists pb_v3_slots_object_path_check;
alter table public.pb_v3_slots add constraint pb_v3_slots_object_path_check check (
  object_path is null or (
    object_path !~ '(^/|\.\.|//)' and (
      object_path ~ '^slots/(0[0-9]|[1-9][0-9])/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[^/]+$'
      or object_path ~ '^slot-(0|[1-9][0-9]?)/[A-Za-z0-9._()\-]+$'
    )
  )
);
alter table public.pb_v3_slots drop constraint if exists pb_v3_slots_revision_check;
alter table public.pb_v3_slots add constraint pb_v3_slots_revision_check check (revision > 0);
create unique index if not exists pb_v3_slots_object_path_key
  on public.pb_v3_slots (object_path)
  where object_path is not null;
create index if not exists pb_v3_slots_updated_at_idx
  on public.pb_v3_slots (updated_at, id);

create table if not exists public.pb_v3_upload_capabilities (
  id uuid primary key default gen_random_uuid(),
  slot_id smallint not null check (slot_id between 0 and 99),
  fingerprint_hash text not null check (char_length(fingerprint_hash) between 32 and 128),
  object_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 180),
  mime_type text not null check (char_length(mime_type) between 1 and 120),
  claimed_bytes bigint not null check (claimed_bytes between 1 and 10485760),
  reserved_bytes bigint not null default 10485760 check (reserved_bytes = 10485760),
  state text not null default 'pending' check (state in ('pending', 'committed', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  committed_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists pb_v3_upload_capabilities_active_idx
  on public.pb_v3_upload_capabilities (fingerprint_hash, expires_at)
  where state = 'pending';
create index if not exists pb_v3_upload_capabilities_slot_idx
  on public.pb_v3_upload_capabilities (slot_id, created_at)
  where state = 'pending';

create table if not exists public.pb_v3_cleanup_queue (
  id bigint generated by default as identity primary key,
  object_path text not null unique,
  reason text not null,
  state text not null default 'queued' check (state in ('queued', 'processing', 'dead')),
  attempts integer not null default 0 check (attempts between 0 and 8),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pb_v3_cleanup_queue_ready_idx
  on public.pb_v3_cleanup_queue (state, next_attempt_at, id);

create table if not exists public.pb_v3_rate_limits (
  fingerprint_hash text not null,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (fingerprint_hash, action, window_started_at)
);
create index if not exists pb_v3_rate_limits_updated_idx
  on public.pb_v3_rate_limits (updated_at);

-- Close Data API access even if a broad grant or permissive policy appears later.
alter table public.pb_v3_slots enable row level security;
alter table public.pb_v3_slots force row level security;
alter table public.pb_v3_upload_capabilities enable row level security;
alter table public.pb_v3_upload_capabilities force row level security;
alter table public.pb_v3_cleanup_queue enable row level security;
alter table public.pb_v3_cleanup_queue force row level security;
alter table public.pb_v3_rate_limits enable row level security;
alter table public.pb_v3_rate_limits force row level security;

drop policy if exists pb_v3_slots_deny_direct on public.pb_v3_slots;
create policy pb_v3_slots_deny_direct
  on public.pb_v3_slots as restrictive for all to anon, authenticated
  using (false) with check (false);

drop policy if exists pb_v3_upload_capabilities_deny_direct on public.pb_v3_upload_capabilities;
create policy pb_v3_upload_capabilities_deny_direct
  on public.pb_v3_upload_capabilities as restrictive for all to anon, authenticated
  using (false) with check (false);

drop policy if exists pb_v3_cleanup_queue_deny_direct on public.pb_v3_cleanup_queue;
create policy pb_v3_cleanup_queue_deny_direct
  on public.pb_v3_cleanup_queue as restrictive for all to anon, authenticated
  using (false) with check (false);

drop policy if exists pb_v3_rate_limits_deny_direct on public.pb_v3_rate_limits;
create policy pb_v3_rate_limits_deny_direct
  on public.pb_v3_rate_limits as restrictive for all to anon, authenticated
  using (false) with check (false);

revoke all on table public.pb_v3_slots from public, anon, authenticated;
revoke all on table public.pb_v3_upload_capabilities from public, anon, authenticated;
revoke all on table public.pb_v3_cleanup_queue from public, anon, authenticated;
revoke all on table public.pb_v3_rate_limits from public, anon, authenticated;
revoke all on sequence public.pb_v3_cleanup_queue_id_seq from public, anon, authenticated;

grant select, insert, update, delete on table public.pb_v3_slots to service_role;
grant select, insert, update, delete on table public.pb_v3_upload_capabilities to service_role;
grant select, insert, update, delete on table public.pb_v3_cleanup_queue to service_role;
grant select, insert, update, delete on table public.pb_v3_rate_limits to service_role;
grant usage, select on sequence public.pb_v3_cleanup_queue_id_seq to service_role;

-- Private bucket + restrictive policy means browser-wide anon CRUD remains impossible.
update storage.buckets
set public = false,
    file_size_limit = 10485760,
    updated_at = now()
where id = 'pb-v3';

drop policy if exists pb_v3_storage_deny_direct on storage.objects;
create policy pb_v3_storage_deny_direct
  on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'pb-v3')
  with check (bucket_id <> 'pb-v3');

-- Signed upload URLs currently outlive the short DB capability. Delay deletion of any
-- capability-created path until the signed URL can no longer be replayed.
create or replace function public.pb_v3_cleanup_not_before(p_object_path text)
returns timestamptz
language sql
security definer
set search_path = pg_catalog, public
as $$
  select greatest(
    clock_timestamp(),
    coalesce((
      select c.created_at + interval '2 hours 5 minutes'
      from public.pb_v3_upload_capabilities c
      where c.object_path = p_object_path
      order by c.created_at desc
      limit 1
    ), clock_timestamp())
  );
$$;

-- Database-backed rate limiting. No browser role can invoke it directly.
create or replace function public.pb_v3_take_rate_limit(
  p_fingerprint_hash text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if char_length(p_fingerprint_hash) not between 32 and 128
     or char_length(p_action) not between 1 and 64
     or p_limit not between 1 and 1000
     or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid rate-limit arguments' using errcode = '22023';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.pb_v3_rate_limits (
    fingerprint_hash, action, window_started_at, request_count, updated_at
  ) values (
    p_fingerprint_hash, p_action, v_window, 1, clock_timestamp()
  )
  on conflict (fingerprint_hash, action, window_started_at)
  do update set
    request_count = public.pb_v3_rate_limits.request_count + 1,
    updated_at = clock_timestamp()
  returning request_count into v_count;

  delete from public.pb_v3_rate_limits
  where updated_at < clock_timestamp() - interval '2 days';

  return v_count <= p_limit;
end;
$$;

create or replace function public.pb_v3_reap_expired_uploads()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.pb_v3_upload_capabilities
    set state = 'expired', cancelled_at = clock_timestamp()
    where state = 'pending' and expires_at <= clock_timestamp()
    returning object_path
  ), queued as (
    insert into public.pb_v3_cleanup_queue (object_path, reason, next_attempt_at)
    select object_path, 'expired-upload-capability', public.pb_v3_cleanup_not_before(object_path) from expired
    on conflict (object_path) do nothing
    returning 1
  )
  select count(*) into v_count from queued;

  update public.pb_v3_cleanup_queue
  set state = 'dead', locked_at = null, last_error = coalesce(last_error, 'cleanup lease expired after final attempt'), updated_at = clock_timestamp()
  where state = 'processing'
    and locked_at < clock_timestamp() - interval '10 minutes'
    and attempts >= 8;

  update public.pb_v3_cleanup_queue
  set state = 'queued', locked_at = null, next_attempt_at = clock_timestamp(), updated_at = clock_timestamp()
  where state = 'processing'
    and locked_at < clock_timestamp() - interval '10 minutes'
    and attempts < 8;

  return v_count;
end;
$$;

create or replace function public.pb_v3_prepare_upload(
  p_slot_id smallint,
  p_fingerprint_hash text,
  p_original_name text,
  p_mime_type text,
  p_claimed_bytes bigint,
  p_object_path text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_capability_id uuid := gen_random_uuid();
  v_active integer;
  v_total bigint;
  v_victim record;
  v_evicted smallint[] := '{}';
begin
  perform pg_advisory_xact_lock(hashtextextended('pb-v3-storage', 0));
  perform public.pb_v3_reap_expired_uploads();

  if p_slot_id not between 0 and 99
     or char_length(p_fingerprint_hash) not between 32 and 128
     or char_length(p_original_name) not between 1 and 180
     or char_length(p_mime_type) not between 1 and 120
     or p_claimed_bytes not between 1 and 10485760
     or p_expires_at <= clock_timestamp()
     or p_expires_at > clock_timestamp() + interval '30 minutes' then
    raise exception 'invalid upload capability request' using errcode = '22023';
  end if;

  if p_object_path like '/%'
     or p_object_path like '%..%'
     or p_object_path like '%//%'
     or p_object_path !~ (
       '^slots/' || lpad(p_slot_id::text, 2, '0') ||
       '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[^/]+$'
     ) then
    raise exception 'invalid or cross-slot object path' using errcode = '22023';
  end if;

  select count(*) into v_active
  from public.pb_v3_upload_capabilities
  where fingerprint_hash = p_fingerprint_hash
    and state = 'pending'
    and expires_at > clock_timestamp();

  if v_active >= 2 then
    raise exception 'too many active upload capabilities' using errcode = '54000';
  end if;

  select
    coalesce((select sum(bytes) from public.pb_v3_slots), 0) +
    coalesce((select sum(reserved_bytes) from public.pb_v3_upload_capabilities where state = 'pending' and expires_at > clock_timestamp()), 0) +
    10485760
  into v_total;

  while v_total > 536870912 loop
    select id, bytes, object_path
    into v_victim
    from public.pb_v3_slots
    where id <> p_slot_id
    order by updated_at asc, id asc
    limit 1
    for update skip locked;

    if not found then
      raise exception 'insufficient capacity for upload reservation' using errcode = '54000';
    end if;

    delete from public.pb_v3_slots where id = v_victim.id;
    if v_victim.object_path is not null then
      insert into public.pb_v3_cleanup_queue (object_path, reason, next_attempt_at)
      values (v_victim.object_path, 'prepare-upload-eviction', public.pb_v3_cleanup_not_before(v_victim.object_path))
      on conflict (object_path) do nothing;
    end if;
    v_evicted := array_append(v_evicted, v_victim.id::smallint);
    v_total := v_total - v_victim.bytes;
  end loop;

  insert into public.pb_v3_upload_capabilities (
    id, slot_id, fingerprint_hash, object_path, original_name, mime_type,
    claimed_bytes, reserved_bytes, expires_at
  ) values (
    v_capability_id, p_slot_id, p_fingerprint_hash, p_object_path, p_original_name, p_mime_type,
    p_claimed_bytes, 10485760, p_expires_at
  );

  return jsonb_build_object(
    'capability_id', v_capability_id,
    'expires_at', p_expires_at,
    'evicted_ids', to_jsonb(v_evicted)
  );
end;
$$;

create or replace function public.pb_v3_cancel_upload(
  p_capability_id uuid,
  p_fingerprint_hash text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_path text;
begin
  perform pg_advisory_xact_lock(hashtextextended('pb-v3-storage', 0));

  select object_path into v_path
  from public.pb_v3_upload_capabilities
  where id = p_capability_id
    and fingerprint_hash = p_fingerprint_hash
    and state = 'pending'
  for update;

  if not found then
    return false;
  end if;

  update public.pb_v3_upload_capabilities
  set state = 'cancelled', cancelled_at = clock_timestamp()
  where id = p_capability_id;

  insert into public.pb_v3_cleanup_queue (object_path, reason, next_attempt_at)
  values (v_path, 'cancelled-upload', public.pb_v3_cleanup_not_before(v_path))
  on conflict (object_path) do nothing;

  return true;
end;
$$;

create or replace function public.pb_v3_commit_slot(
  p_slot_id smallint,
  p_text text,
  p_file_action text,
  p_capability_id uuid,
  p_fingerprint_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_current public.pb_v3_slots%rowtype;
  v_has_current boolean := false;
  v_capability public.pb_v3_upload_capabilities%rowtype;
  v_storage_metadata jsonb;
  v_new_path text;
  v_new_name text;
  v_new_type text;
  v_new_file_bytes bigint := 0;
  v_text_bytes bigint;
  v_total_bytes bigint;
  v_total bigint;
  v_revision bigint;
  v_created_at timestamptz;
  v_old_path text;
  v_victim record;
  v_evicted smallint[] := '{}';
  v_result public.pb_v3_slots%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('pb-v3-storage', 0));
  perform public.pb_v3_reap_expired_uploads();

  if p_slot_id not between 0 and 99
     or p_text is null
     or char_length(p_text) > 30000
     or p_file_action not in ('keep', 'remove', 'replace')
     or char_length(p_fingerprint_hash) not between 32 and 128 then
    raise exception 'invalid slot commit request' using errcode = '22023';
  end if;

  select * into v_current
  from public.pb_v3_slots
  where id = p_slot_id
  for update;
  v_has_current := found;

  if v_has_current then
    v_new_path := v_current.object_path;
    v_new_name := v_current.file_name;
    v_new_type := v_current.file_type;
    v_new_file_bytes := v_current.file_bytes;
    v_old_path := v_current.object_path;
    v_created_at := v_current.created_at;
    v_revision := v_current.revision + 1;
  else
    v_created_at := v_now;
    v_revision := 1;
  end if;

  if p_file_action = 'remove' then
    if p_capability_id is not null then
      raise exception 'remove cannot include a capability' using errcode = '22023';
    end if;
    v_new_path := null;
    v_new_name := null;
    v_new_type := null;
    v_new_file_bytes := 0;
  elsif p_file_action = 'replace' then
    if p_capability_id is null then
      raise exception 'replace requires a capability' using errcode = '22023';
    end if;

    select * into v_capability
    from public.pb_v3_upload_capabilities
    where id = p_capability_id
      and slot_id = p_slot_id
      and fingerprint_hash = p_fingerprint_hash
      and state = 'pending'
      and expires_at > v_now
    for update;

    if not found then
      raise exception 'upload capability is missing, expired, used, or belongs to another slot' using errcode = '22023';
    end if;

    if v_capability.object_path like '/%'
       or v_capability.object_path like '%..%'
       or v_capability.object_path like '%//%'
       or v_capability.object_path !~ (
         '^slots/' || lpad(p_slot_id::text, 2, '0') ||
         '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[^/]+$'
       ) then
      raise exception 'capability contains an unsafe object path' using errcode = '22023';
    end if;

    select metadata into v_storage_metadata
    from storage.objects
    where bucket_id = 'pb-v3'
      and name = v_capability.object_path;

    if not found
       or coalesce(v_storage_metadata->>'size', '') !~ '^[0-9]+$' then
      raise exception 'uploaded object metadata is missing' using errcode = '22023';
    end if;

    v_new_file_bytes := (v_storage_metadata->>'size')::bigint;
    if v_new_file_bytes not between 1 and 10485760 then
      raise exception 'uploaded object exceeds file limit' using errcode = '22023';
    end if;

    v_new_path := v_capability.object_path;
    v_new_name := v_capability.original_name;
    v_new_type := coalesce(
      nullif(v_storage_metadata->>'mimetype', ''),
      nullif(v_storage_metadata->>'contentType', ''),
      v_capability.mime_type,
      'application/octet-stream'
    );

    update public.pb_v3_upload_capabilities
    set state = 'committed', committed_at = v_now
    where id = p_capability_id;
  elsif p_capability_id is not null then
    raise exception 'capability is only valid for replace' using errcode = '22023';
  end if;

  if btrim(p_text) = '' and v_new_path is null then
    raise exception 'slot cannot be empty' using errcode = '22023';
  end if;

  v_text_bytes := octet_length(p_text);
  v_total_bytes := v_text_bytes + v_new_file_bytes;

  insert into public.pb_v3_slots (
    id, text, file, object_path, file_name, file_type, file_bytes,
    text_bytes, bytes, created_at, updated_at, revision
  ) values (
    p_slot_id,
    p_text,
    case when v_new_path is null then null else jsonb_build_object(
      'pathname', v_new_path,
      'name', v_new_name,
      'type', v_new_type,
      'size', v_new_file_bytes
    ) end,
    v_new_path,
    v_new_name,
    v_new_type,
    v_new_file_bytes,
    v_text_bytes,
    v_total_bytes,
    v_created_at,
    v_now,
    v_revision
  )
  on conflict (id) do update set
    text = excluded.text,
    file = excluded.file,
    object_path = excluded.object_path,
    file_name = excluded.file_name,
    file_type = excluded.file_type,
    file_bytes = excluded.file_bytes,
    text_bytes = excluded.text_bytes,
    bytes = excluded.bytes,
    updated_at = excluded.updated_at,
    revision = excluded.revision;

  if v_old_path is not null and v_old_path is distinct from v_new_path then
    insert into public.pb_v3_cleanup_queue (object_path, reason, next_attempt_at)
    values (v_old_path, 'replaced-or-removed-file', public.pb_v3_cleanup_not_before(v_old_path))
    on conflict (object_path) do nothing;
  end if;

  select
    coalesce((select sum(bytes) from public.pb_v3_slots), 0) +
    coalesce((select sum(reserved_bytes) from public.pb_v3_upload_capabilities where state = 'pending' and expires_at > v_now), 0)
  into v_total;

  while v_total > 536870912 loop
    select id, bytes, object_path
    into v_victim
    from public.pb_v3_slots
    where id <> p_slot_id
    order by updated_at asc, id asc
    limit 1
    for update skip locked;

    if not found then
      raise exception 'storage limit cannot be satisfied without evicting the active slot' using errcode = '54000';
    end if;

    delete from public.pb_v3_slots where id = v_victim.id;
    if v_victim.object_path is not null then
      insert into public.pb_v3_cleanup_queue (object_path, reason, next_attempt_at)
      values (v_victim.object_path, 'slot-eviction', public.pb_v3_cleanup_not_before(v_victim.object_path))
      on conflict (object_path) do nothing;
    end if;
    v_evicted := array_append(v_evicted, v_victim.id::smallint);
    v_total := v_total - v_victim.bytes;
  end loop;

  select * into v_result from public.pb_v3_slots where id = p_slot_id;

  return jsonb_build_object(
    'id', v_result.id,
    'text', v_result.text,
    'object_path', v_result.object_path,
    'file_name', v_result.file_name,
    'file_type', v_result.file_type,
    'file_bytes', v_result.file_bytes,
    'bytes', v_result.bytes,
    'created_at', v_result.created_at,
    'updated_at', v_result.updated_at,
    'revision', v_result.revision,
    'evicted_ids', to_jsonb(v_evicted)
  );
end;
$$;

create or replace function public.pb_v3_clear_slot(p_slot_id smallint)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_path text;
  v_cancelled_path text;
  v_cleared boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended('pb-v3-storage', 0));

  delete from public.pb_v3_slots
  where id = p_slot_id
  returning object_path into v_path;
  v_cleared := found;

  if v_path is not null then
    insert into public.pb_v3_cleanup_queue (object_path, reason, next_attempt_at)
    values (v_path, 'slot-clear', public.pb_v3_cleanup_not_before(v_path))
    on conflict (object_path) do nothing;
  end if;

  for v_cancelled_path in
    update public.pb_v3_upload_capabilities
    set state = 'cancelled', cancelled_at = clock_timestamp()
    where slot_id = p_slot_id and state = 'pending'
    returning object_path
  loop
    insert into public.pb_v3_cleanup_queue (object_path, reason, next_attempt_at)
    values (v_cancelled_path, 'slot-clear-pending-upload', public.pb_v3_cleanup_not_before(v_cancelled_path))
    on conflict (object_path) do nothing;
  end loop;

  return v_cleared;
end;
$$;

create or replace function public.pb_v3_claim_cleanup_batch(p_limit integer default 20)
returns table(id bigint, object_path text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_limit not between 1 and 100 then
    raise exception 'invalid cleanup batch size' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select q.id
    from public.pb_v3_cleanup_queue q
    where q.state = 'queued'
      and q.next_attempt_at <= clock_timestamp()
      and q.attempts < 8
    order by q.next_attempt_at, q.id
    limit p_limit
    for update skip locked
  )
  update public.pb_v3_cleanup_queue q
  set
    state = 'processing',
    attempts = q.attempts + 1,
    locked_at = clock_timestamp(),
    updated_at = clock_timestamp()
  from candidates c
  where q.id = c.id
  returning q.id, q.object_path;
end;
$$;

create or replace function public.pb_v3_finish_cleanup(
  p_cleanup_id bigint,
  p_success boolean,
  p_error text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attempts integer;
begin
  if p_success then
    delete from public.pb_v3_cleanup_queue where id = p_cleanup_id;
    return;
  end if;

  select attempts into v_attempts
  from public.pb_v3_cleanup_queue
  where id = p_cleanup_id
  for update;

  if not found then
    return;
  end if;

  update public.pb_v3_cleanup_queue
  set
    state = case when v_attempts >= 8 then 'dead' else 'queued' end,
    next_attempt_at = case
      when v_attempts >= 8 then 'infinity'::timestamptz
      else clock_timestamp() + (power(2, least(v_attempts, 6)) * interval '30 seconds')
    end,
    locked_at = null,
    last_error = left(coalesce(p_error, 'unknown cleanup error'), 500),
    updated_at = clock_timestamp()
  where id = p_cleanup_id;
end;
$$;

-- Safely queue only recognized, currently unreferenced legacy/new PB paths.
insert into public.pb_v3_cleanup_queue (object_path, reason, next_attempt_at)
select o.name, 'migration-unreferenced-object', public.pb_v3_cleanup_not_before(o.name)
from storage.objects o
where o.bucket_id = 'pb-v3'
  and (
    o.name ~ '^slots/(0[0-9]|[1-9][0-9])/[0-9a-f-]{36}/[^/]+$'
    or o.name ~ '^slot-(0|[1-9][0-9]?)/[A-Za-z0-9._()\-]+$'
  )
  and not exists (select 1 from public.pb_v3_slots s where s.object_path = o.name)
  and not exists (
    select 1 from public.pb_v3_upload_capabilities c
    where c.object_path = o.name and c.state = 'pending' and c.expires_at > clock_timestamp()
  )
on conflict (object_path) do nothing;

-- SECURITY DEFINER is server-only: remove PostgreSQL's default PUBLIC EXECUTE grant.
revoke all on function public.pb_v3_cleanup_not_before(text) from public, anon, authenticated;
revoke all on function public.pb_v3_take_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.pb_v3_reap_expired_uploads() from public, anon, authenticated;
revoke all on function public.pb_v3_prepare_upload(smallint, text, text, text, bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.pb_v3_cancel_upload(uuid, text) from public, anon, authenticated;
revoke all on function public.pb_v3_commit_slot(smallint, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.pb_v3_clear_slot(smallint) from public, anon, authenticated;
revoke all on function public.pb_v3_claim_cleanup_batch(integer) from public, anon, authenticated;
revoke all on function public.pb_v3_finish_cleanup(bigint, boolean, text) from public, anon, authenticated;

grant execute on function public.pb_v3_cleanup_not_before(text) to service_role;
grant execute on function public.pb_v3_take_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.pb_v3_reap_expired_uploads() to service_role;
grant execute on function public.pb_v3_prepare_upload(smallint, text, text, text, bigint, text, timestamptz) to service_role;
grant execute on function public.pb_v3_cancel_upload(uuid, text) to service_role;
grant execute on function public.pb_v3_commit_slot(smallint, text, text, uuid, text) to service_role;
grant execute on function public.pb_v3_clear_slot(smallint) to service_role;
grant execute on function public.pb_v3_claim_cleanup_batch(integer) to service_role;
grant execute on function public.pb_v3_finish_cleanup(bigint, boolean, text) to service_role;

commit;
