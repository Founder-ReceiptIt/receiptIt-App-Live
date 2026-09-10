-- Run with the linked Management API. Every fixture and HTTP trigger rolls back.
begin;
create temporary table duplicate_delete_results(test text,result text);
do $$
declare owner_id uuid := '5b3d86f3-f9a7-4423-9c77-c5849bf78913';
  a uuid; b uuid; shadow_id uuid; copy_id uuid; exact_blocked boolean:=false; guarded boolean:=false; n integer;
  ha text:=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex');
  hb text:=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex');
begin
  insert into receipts(user_id,merchant,amount,currency,status,source,category,storage_path,file_hash,reference_number)
  values(owner_id,'Controlled Duplicate Contract',17.45,'GBP','parsed','image','Other',owner_id||'/contract-a.png',ha,'CONTRACT-20260910') returning id into a;
  insert into receipts(user_id,merchant,amount,currency,status,source,category,storage_path,file_hash,reference_number,original_receipt_id,duplicate_of)
  values(owner_id,'Controlled Duplicate Contract',17.45,'GBP','parsed','image','Other',owner_id||'/contract-b.png',hb,'CONTRACT-20260910',a,a) returning id into b;
  -- Reproduce a historic suppressed exact-override job as privileged setup only.
  -- New normal INSERTs cannot create this state. Everything rolls back.
  insert into receipts(user_id,merchant,amount,currency,status,source,category,storage_path,duplicate_of,is_duplicate)
  values(owner_id,'Suppressed legacy job',null,'GBP','duplicate','image','Other',owner_id||'/contract-shadow.png',a,true) returning id into shadow_id;
  update receipts set file_hash=ha where id=shadow_id;
  if not exists(select 1 from receipt_possible_duplicates where receipt_id=b and possible_duplicate_of=a) then raise exception 'Different evidence did not produce possible duplicate'; end if;
  perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform keep_possible_duplicate(b);
  perform keep_possible_duplicate(b);
  if (select decision from receipt_possible_duplicates where receipt_id=b)<>'saved_anyway' or
     (select count(*) from receipts where id in(a,b) and status='parsed')<>2 then raise exception 'Save anyway failed'; end if;
  insert into duplicate_delete_results values('possible duplicate / independent save / idempotent acknowledgement','PASS');
  begin
    insert into receipts(user_id,merchant,amount,currency,status,source,category,storage_path,file_hash,duplicate_of,is_duplicate)
    values(owner_id,'Exact override attempt',17.45,'GBP','processing','image','Other',owner_id||'/contract-exact.png',ha,a,false);
  exception when unique_violation then exact_blocked:=true;
  end;
  if not exact_blocked then raise exception 'Exact override still allowed'; end if;
  insert into duplicate_delete_results values('exact override rejected with 23505','PASS');
  begin update receipts set original_receipt_id=null where id=b;
  exception when others then guarded:=sqlerrm='Receipt evidence fields are processor managed'; end;
  if not guarded then raise exception 'Direct managed-field update was allowed'; end if;
  insert into duplicate_delete_results values('direct client evidence change remains denied','PASS');
  delete from receipts where id=a;
  if not exists(select 1 from receipts where id=b and status='parsed' and original_receipt_id is null and duplicate_of is null) then raise exception 'Independent receipt lost on original deletion'; end if;
  if exists(select 1 from receipts where id=shadow_id) or not exists(select 1 from receipt_storage_cleanup where receipt_id=shadow_id) then raise exception 'Suppressed shadow cleanup failed'; end if;
  insert into duplicate_delete_results values('legacy suppressed exact shadow removed and evidence queued','PASS');
  if exists(select 1 from receipt_possible_duplicates where receipt_id=b) then raise exception 'Dangling candidate'; end if;
  if not exists(select 1 from receipt_storage_cleanup where receipt_id=a and storage_path=owner_id||'/contract-a.png') then raise exception 'Original cleanup not queued'; end if;
  if exists(select 1 from receipt_storage_cleanup where receipt_id=b) then raise exception 'Independent evidence wrongly queued'; end if;
  insert into duplicate_delete_results values('FK unlink / independent receipt preserved / cleanup queued','PASS');
  insert into receipts(user_id,merchant,amount,currency,status,source,category,storage_path,file_hash)
  values(owner_id,'Reupload after deletion',null,'GBP','processing','image','Other',owner_id||'/contract-reupload.png',ha) returning id into copy_id;
  if copy_id is null then raise exception 'Reupload failed'; end if;
  insert into duplicate_delete_results values('reupload deleted hash allowed','PASS');
  perform set_config('request.jwt.claim.role','service_role',true);
  update receipts set status='finalising' where id=copy_id;
  perform set_config('request.jwt.claim.role','authenticated',true);
  if not exists(select 1 from find_existing_receipt_by_file_hash(ha) where id=copy_id) then raise exception 'Finalising receipt absent from exact lookup'; end if;
  exact_blocked:=false;
  begin
    insert into receipts(user_id,merchant,amount,currency,status,source,category,storage_path,file_hash)
    values(owner_id,'Exact during Finalise',null,'GBP','processing','image','Other',owner_id||'/contract-race.png',ha);
  exception when unique_violation then exact_blocked:=true;
  end;
  if not exact_blocked then raise exception 'Finalising exact race allowed'; end if;
  insert into duplicate_delete_results values('finalising exact lookup and insertion race blocked','PASS');
  delete from receipts where id=b;
  if not exists(select 1 from receipts where id=copy_id) then raise exception 'Deleting independent second receipt removed new original'; end if;
  insert into duplicate_delete_results values('delete independent copy only','PASS');
  perform set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  select count(*) into n from find_existing_receipt_by_file_hash(ha);
  if n<>0 then raise exception 'Other owner visible through hash lookup'; end if;
  insert into duplicate_delete_results values('cross-owner hash lookup empty','PASS');
end $$;
select * from duplicate_delete_results;
rollback;
