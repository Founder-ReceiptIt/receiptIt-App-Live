-- Founder-only, best-effort beta journey telemetry. No public read/write policy.
create table public.access_code_events (
  id uuid primary key default gen_random_uuid(),
  code_label text not null check (length(code_label) between 1 and 128),
  event_type text not null check (event_type in (
    'code_submitted','code_accepted','signup_started','signup_completed','intro_completed','wallet_reached'
  )),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid not null,
  metadata jsonb,
  constraint access_code_events_once unique(session_id,event_type),
  constraint access_code_events_metadata check (
    metadata is null or (event_type = 'intro_completed' and metadata in (
      '{"completion_method":"completed"}'::jsonb, '{"completion_method":"skipped"}'::jsonb
    ))
  )
);
alter table public.access_code_events enable row level security;
revoke all on public.access_code_events from public, anon, authenticated;
grant select, insert on public.access_code_events to service_role;
create index access_code_events_label_time on public.access_code_events(code_label, created_at desc);
comment on table public.access_code_events is 'Founder-only beta journey events. No email, IP, device fingerprint or raw invalid code. Recommended retention: 90 days.';
