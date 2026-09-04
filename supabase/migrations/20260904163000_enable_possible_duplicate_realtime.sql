-- Deliver possible-duplicate review changes to the owning Wallet without a refresh.
-- Realtime continues to enforce the table's existing owner-only RLS policy.
do $$
begin
  alter publication supabase_realtime add table public.receipt_possible_duplicates;
exception
  when duplicate_object then null;
end;
$$;
