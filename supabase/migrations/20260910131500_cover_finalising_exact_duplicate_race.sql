begin;
-- Live Finalise uses this transient status between processing and parsed.
do $$
declare definition text; signature text;
begin
  foreach signature in array array['public.prevent_active_receipt_file_duplicate()','public.find_existing_receipt_by_file_hash(text)'] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    if position('''processing'',''parsed''' in definition)=0 then raise exception 'Unexpected exact guard format'; end if;
    execute replace(definition,'''processing'',''parsed''','''processing'',''finalising'',''parsed''');
  end loop;
end $$;
commit;
