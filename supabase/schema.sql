create table if not exists public.apex_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.apex_user_state enable row level security;

drop policy if exists "Users can read their own APEX state" on public.apex_user_state;
create policy "Users can read their own APEX state"
on public.apex_user_state
for select
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "Users can insert their own APEX state" on public.apex_user_state;
create policy "Users can insert their own APEX state"
on public.apex_user_state
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "Users can update their own APEX state" on public.apex_user_state;
create policy "Users can update their own APEX state"
on public.apex_user_state
for update
to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

create index if not exists apex_user_state_updated_at_idx
on public.apex_user_state (updated_at desc);
