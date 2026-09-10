begin;
create or replace function public.request_receipt_storage_cleanup()
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare cleanup_key text;
begin
  if not exists(select 1 from public.receipt_storage_cleanup) then return; end if;
  select decrypted_secret into cleanup_key from vault.decrypted_secrets where name='receipt_delete_cleanup_secret';
  if cleanup_key is null then raise exception 'Receipt cleanup credential unavailable'; end if;
  perform net.http_post(
    url:='https://qqfntftbughorckugceu.supabase.co/functions/v1/delete-receipt',
    headers:=jsonb_build_object('Content-Type','application/json','x-receipt-cleanup-key',cleanup_key),
    body:='{}'::jsonb,timeout_milliseconds:=30000
  );
end $$;
revoke all on function public.request_receipt_storage_cleanup() from public,anon,authenticated;
select cron.schedule('receiptit-storage-delete-recovery','*/5 * * * *','select public.request_receipt_storage_cleanup()');
commit;
