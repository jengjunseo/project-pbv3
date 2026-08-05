-- Destructive test fixture wrapped in ROLLBACK. Run only on a disposable/preview DB.
begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition, false) then
    raise exception 'TRANSACTION CHECK FAILED: %', message;
  end if;
end;
$$;

delete from public.pb_v3_cleanup_queue;
delete from public.pb_v3_upload_capabilities;
delete from public.pb_v3_rate_limits;
delete from public.pb_v3_slots;
delete from storage.objects where bucket_id='pb-v3';

-- Server owns timestamps and UTF-8 byte accounting.
select public.pb_v3_commit_slot(17, '가a', 'keep', null, repeat('a', 64));
select pg_temp.assert_true(
  (select text_bytes=4 and bytes=4 and revision=1 from public.pb_v3_slots where id=17),
  'UTF-8 bytes or initial revision are incorrect'
);
select public.pb_v3_commit_slot(17, '가나다', 'keep', null, repeat('a', 64));
select pg_temp.assert_true(
  (select text_bytes=9 and bytes=9 and revision=2 from public.pb_v3_slots where id=17),
  'overwrite must recompute bytes and revision'
);

-- Exact-path capability, actual Storage metadata size, and transaction commit.
do $$
declare
  prepared jsonb;
  cap uuid;
  object_path text := 'slots/17/123e4567-e89b-42d3-a456-426614174000/file.pdf';
  committed jsonb;
begin
  prepared := public.pb_v3_prepare_upload(17, repeat('b',64), 'file.pdf', 'application/pdf', 1, object_path, clock_timestamp()+interval '10 minutes');
  cap := (prepared->>'capability_id')::uuid;
  insert into storage.objects(bucket_id,name,metadata) values ('pb-v3', object_path, jsonb_build_object('size',4096,'mimetype','application/pdf'));
  committed := public.pb_v3_commit_slot(17, 'with file', 'replace', cap, repeat('b',64));
  perform pg_temp.assert_true((committed->>'file_bytes')::bigint=4096, 'DB must use actual Storage metadata, not claimed bytes');
  perform pg_temp.assert_true((select state='committed' from public.pb_v3_upload_capabilities where id=cap), 'capability must become single-use committed');
end;
$$;

-- Replacement queues the old object instead of deleting it before commit.
do $$
declare
  prepared jsonb;
  cap uuid;
  old_path text := (select object_path from public.pb_v3_slots where id=17);
  new_path text := 'slots/17/223e4567-e89b-42d3-a456-426614174000/new.pdf';
begin
  prepared := public.pb_v3_prepare_upload(17, repeat('c',64), 'new.pdf', 'application/pdf', 10, new_path, clock_timestamp()+interval '10 minutes');
  cap := (prepared->>'capability_id')::uuid;
  insert into storage.objects(bucket_id,name,metadata) values ('pb-v3',new_path,jsonb_build_object('size',8192,'mimetype','application/pdf'));
  perform public.pb_v3_commit_slot(17,'replacement','replace',cap,repeat('c',64));
  perform pg_temp.assert_true((select object_path=new_path from public.pb_v3_slots where id=17), 'new object must be committed');
  perform pg_temp.assert_true(exists(select 1 from public.pb_v3_cleanup_queue where object_path=old_path), 'old object must enter durable cleanup queue');
end;
$$;

-- Cancel wins against commit and deletion is delayed past signed URL replay lifetime.
do $$
declare
  prepared jsonb;
  cap uuid;
  path text := 'slots/18/323e4567-e89b-42d3-a456-426614174000/cancel.txt';
  failed boolean := false;
begin
  prepared := public.pb_v3_prepare_upload(18,repeat('d',64),'cancel.txt','text/plain',1,path,clock_timestamp()+interval '10 minutes');
  cap := (prepared->>'capability_id')::uuid;
  perform public.pb_v3_cancel_upload(cap,repeat('d',64));
  begin
    perform public.pb_v3_commit_slot(18,'x','replace',cap,repeat('d',64));
  exception when others then
    failed := true;
  end;
  perform pg_temp.assert_true(failed, 'cancelled capability must not commit');
  perform pg_temp.assert_true((select next_attempt_at > clock_timestamp()+interval '1 hour' from public.pb_v3_cleanup_queue where object_path=path), 'cancel cleanup must wait until signed URL replay expires');
end;
$$;

-- Cross-slot paths and more than two pending capabilities per fingerprint are rejected.
do $$
declare
  failed boolean := false;
  fp text := repeat('e',64);
begin
  begin
    perform public.pb_v3_prepare_upload(19,fp,'a.txt','text/plain',1,'slots/20/423e4567-e89b-42d3-a456-426614174000/a.txt',clock_timestamp()+interval '10 minutes');
  exception when others then failed := true;
  end;
  perform pg_temp.assert_true(failed,'cross-slot path must fail');

  perform public.pb_v3_prepare_upload(19,fp,'a.txt','text/plain',1,'slots/19/523e4567-e89b-42d3-a456-426614174000/a.txt',clock_timestamp()+interval '10 minutes');
  perform public.pb_v3_prepare_upload(19,fp,'b.txt','text/plain',1,'slots/19/623e4567-e89b-42d3-a456-426614174000/b.txt',clock_timestamp()+interval '10 minutes');
  failed := false;
  begin
    perform public.pb_v3_prepare_upload(19,fp,'c.txt','text/plain',1,'slots/19/723e4567-e89b-42d3-a456-426614174000/c.txt',clock_timestamp()+interval '10 minutes');
  exception when others then failed := true;
  end;
  perform pg_temp.assert_true(failed,'third active capability must fail');
end;
$$;

-- Reservation pressure evicts oldest slots but never the active slot being saved.
delete from public.pb_v3_cleanup_queue;
delete from public.pb_v3_upload_capabilities;
delete from public.pb_v3_slots;
insert into public.pb_v3_slots(id,text,file,object_path,file_name,file_type,file_bytes,text_bytes,bytes,created_at,updated_at,revision)
select i::smallint,'',jsonb_build_object('pathname','slot-'||i||'/x.bin','name','x.bin','type','application/octet-stream','size',10485760),
       'slot-'||i||'/x.bin','x.bin','application/octet-stream',10485760,0,10485760,
       clock_timestamp()-interval '2 days'+(i*interval '1 minute'),clock_timestamp()-interval '2 days'+(i*interval '1 minute'),1
from generate_series(0,50) i;
select public.pb_v3_prepare_upload(0,repeat('f',64),'new.txt','text/plain',1,'slots/00/823e4567-e89b-42d3-a456-426614174000/new.txt',clock_timestamp()+interval '10 minutes');
select pg_temp.assert_true(exists(select 1 from public.pb_v3_slots where id=0),'active slot must never be evicted');
select pg_temp.assert_true(not exists(select 1 from public.pb_v3_slots where id=1),'oldest non-active slot must be evicted first');

rollback;
