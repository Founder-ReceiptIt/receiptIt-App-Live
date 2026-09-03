/*
  Production QA must never inherit an arbitrary signed-in beta user's identity.

  The allowlist is server-owned. The client can only ask whether its own current
  identity is approved, and cannot read or change any other QA identity.
*/

begin;

create table if not exists public.production_test_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text not null check (length(label) between 3 and 120),
  active boolean not null default true,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.production_test_accounts enable row level security;

revoke all on public.production_test_accounts from public, anon, authenticated;
grant all on public.production_test_accounts to service_role;

create or replace function public.current_production_test_authorisation()
returns table (approved boolean, label text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1
      from public.production_test_accounts pta
      where pta.user_id = auth.uid()
        and pta.active
    ) as approved,
    (
      select pta.label
      from public.production_test_accounts pta
      where pta.user_id = auth.uid()
        and pta.active
      limit 1
    ) as label;
$$;

revoke all on function public.current_production_test_authorisation() from public, anon;
grant execute on function public.current_production_test_authorisation() to authenticated;

-- This is the founder-controlled ReceiptIt QA identity. It is deliberately
-- separate from friends-and-family beta accounts.
insert into public.production_test_accounts (user_id, label, active)
select id, 'Founder-controlled production QA', true
from auth.users
where id = '5b3d86f3-f9a7-4423-9c77-c5849bf78913'::uuid
on conflict (user_id) do update
set label = excluded.label,
    active = excluded.active,
    approved_at = now();

comment on table public.production_test_accounts is
  'Server-owned allowlist for deliberate production fixtures. Never fall back to the current browser identity.';

commit;
