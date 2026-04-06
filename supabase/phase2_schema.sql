-- APEX Phase 2 normalized schema foundation.
-- This is additive: keep public.apex_user_state in place until the app migrates
-- from the compatibility workspace blob to these relational tables.

create extension if not exists pgcrypto;

create or replace function public.apex_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.apex_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My APEX Workspace',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apex_workspace_members (
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create or replace function public.apex_add_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.apex_workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_user_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists apex_workspaces_add_owner_membership on public.apex_workspaces;
create trigger apex_workspaces_add_owner_membership
after insert on public.apex_workspaces
for each row execute function public.apex_add_owner_membership();

create or replace function public.apex_is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.apex_workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = (select auth.uid())
  );
$$;

create table if not exists public.apex_classes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  title text not null,
  course_code text,
  platform text,
  instructor text,
  current_grade numeric(5,2),
  target_grade numeric(5,2),
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apex_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  class_id uuid references public.apex_classes(id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'urgent', 'critical')),
  score numeric(7,2),
  points_possible numeric(7,2),
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apex_syllabi (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  class_id uuid references public.apex_classes(id) on delete set null,
  upload_id uuid,
  title text not null,
  parse_status text not null default 'pending' check (parse_status in ('pending', 'parsed', 'needs_review', 'confirmed', 'failed')),
  parsed_summary jsonb not null default '{}'::jsonb,
  confidence numeric(4,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.apex_syllabi
drop constraint if exists apex_syllabi_parse_status_check;
alter table public.apex_syllabi
add constraint apex_syllabi_parse_status_check
check (parse_status in ('pending', 'parsed', 'needs_review', 'confirmed', 'failed'));

create table if not exists public.apex_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  title text not null,
  domain text not null default 'notebook',
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'urgent', 'critical')),
  source_entity_type text,
  source_entity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apex_calendar_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  title text not null,
  domain text not null default 'command',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_locked boolean not null default false,
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.apex_financial_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  provider text not null,
  display_name text not null,
  institution_name text,
  account_type text,
  mask text,
  current_balance numeric(14,2),
  currency text not null default 'USD',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apex_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  financial_account_id uuid references public.apex_financial_accounts(id) on delete cascade,
  posted_at date,
  description text not null,
  amount numeric(14,2) not null,
  category text,
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.apex_budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  income numeric(14,2) not null default 0,
  planned_spend numeric(14,2) not null default 0,
  actual_spend numeric(14,2) not null default 0,
  saved numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.apex_notebooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  title text not null,
  domain text not null default 'notebook',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apex_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  notebook_id uuid references public.apex_notebooks(id) on delete set null,
  title text not null,
  body text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apex_uploads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  file_size_bytes bigint,
  upload_status text not null default 'uploaded' check (upload_status in ('uploaded', 'processing', 'ready', 'failed')),
  extracted_text_status text not null default 'pending' check (extracted_text_status in ('pending', 'complete', 'failed', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.apex_syllabi
drop constraint if exists apex_syllabi_upload_id_fkey;
alter table public.apex_syllabi
add constraint apex_syllabi_upload_id_fkey
foreign key (upload_id) references public.apex_uploads(id) on delete set null;

create table if not exists public.apex_integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  provider text not null,
  provider_type text not null check (provider_type in ('lms', 'calendar', 'finance', 'workforce', 'health', 'webhook', 'storage')),
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'needs_reauth', 'error')),
  scopes text[] not null default '{}',
  token_ref text,
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apex_notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  source_entity_type text,
  source_entity_id uuid,
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'critical')),
  action_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz,
  dismissed_at timestamptz
);

create table if not exists public.apex_notification_events (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.apex_notifications(id) on delete cascade,
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'shown', 'read', 'resolved', 'dismissed', 'action_clicked')),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.apex_notification_preferences (
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null default 'in_app' check (channel in ('in_app', 'email', 'push')),
  enabled boolean not null default true,
  quiet_hours jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id, channel)
);

create table if not exists public.apex_activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action_type text not null,
  before_state jsonb,
  after_state jsonb,
  source text not null default 'app',
  created_at timestamptz not null default now()
);

create table if not exists public.apex_scheduler_preferences (
  workspace_id uuid primary key references public.apex_workspaces(id) on delete cascade,
  mode text not null default 'balanced' check (mode in ('balanced', 'focus_week', 'light_recovery', 'finals_mode', 'work_heavy', 'catch_up')),
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.apex_constraint_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.apex_workspaces(id) on delete cascade,
  rule_type text not null check (rule_type in ('hard', 'soft')),
  domain text not null default 'command',
  name text not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists apex_workspaces_owner_user_id_idx on public.apex_workspaces (owner_user_id);
create index if not exists apex_workspace_members_user_id_idx on public.apex_workspace_members (user_id);
create index if not exists apex_classes_workspace_id_idx on public.apex_classes (workspace_id);
create index if not exists apex_assignments_workspace_due_idx on public.apex_assignments (workspace_id, due_at);
create index if not exists apex_assignments_class_id_idx on public.apex_assignments (class_id);
create index if not exists apex_syllabi_workspace_id_idx on public.apex_syllabi (workspace_id);
create index if not exists apex_syllabi_upload_id_idx on public.apex_syllabi (upload_id);
create index if not exists apex_tasks_workspace_due_idx on public.apex_tasks (workspace_id, due_at);
create index if not exists apex_calendar_events_workspace_starts_idx on public.apex_calendar_events (workspace_id, starts_at);
create index if not exists apex_financial_accounts_workspace_id_idx on public.apex_financial_accounts (workspace_id);
create index if not exists apex_transactions_workspace_id_idx on public.apex_transactions (workspace_id);
create index if not exists apex_transactions_account_posted_idx on public.apex_transactions (financial_account_id, posted_at desc);
create index if not exists apex_budgets_workspace_period_idx on public.apex_budgets (workspace_id, period_start, period_end);
create index if not exists apex_notebooks_workspace_id_idx on public.apex_notebooks (workspace_id);
create index if not exists apex_notes_workspace_id_idx on public.apex_notes (workspace_id);
create index if not exists apex_uploads_workspace_id_idx on public.apex_uploads (workspace_id);
create index if not exists apex_integrations_workspace_provider_idx on public.apex_integrations (workspace_id, provider_type, provider);
create index if not exists apex_notifications_user_unread_idx on public.apex_notifications (user_id, created_at desc) where read_at is null and dismissed_at is null;
create index if not exists apex_notifications_workspace_idx on public.apex_notifications (workspace_id, created_at desc);
create index if not exists apex_notification_events_notification_id_idx on public.apex_notification_events (notification_id);
create index if not exists apex_notification_preferences_user_idx on public.apex_notification_preferences (user_id);
create index if not exists apex_activity_log_workspace_created_idx on public.apex_activity_log (workspace_id, created_at desc);
create index if not exists apex_constraint_rules_workspace_idx on public.apex_constraint_rules (workspace_id, rule_type, enabled);

alter table public.apex_workspaces enable row level security;
alter table public.apex_workspace_members enable row level security;
alter table public.apex_classes enable row level security;
alter table public.apex_assignments enable row level security;
alter table public.apex_syllabi enable row level security;
alter table public.apex_tasks enable row level security;
alter table public.apex_calendar_events enable row level security;
alter table public.apex_financial_accounts enable row level security;
alter table public.apex_transactions enable row level security;
alter table public.apex_budgets enable row level security;
alter table public.apex_notebooks enable row level security;
alter table public.apex_notes enable row level security;
alter table public.apex_uploads enable row level security;
alter table public.apex_integrations enable row level security;
alter table public.apex_notifications enable row level security;
alter table public.apex_notification_events enable row level security;
alter table public.apex_notification_preferences enable row level security;
alter table public.apex_activity_log enable row level security;
alter table public.apex_scheduler_preferences enable row level security;
alter table public.apex_constraint_rules enable row level security;

drop policy if exists "Workspace owners and members can manage workspaces" on public.apex_workspaces;
create policy "Workspace owners and members can manage workspaces"
on public.apex_workspaces
for all
to authenticated
using (owner_user_id = (select auth.uid()) or (select public.apex_is_workspace_member(id)))
with check (owner_user_id = (select auth.uid()));

drop policy if exists "Workspace members can manage memberships" on public.apex_workspace_members;
create policy "Workspace members can manage memberships"
on public.apex_workspace_members
for all
to authenticated
using (user_id = (select auth.uid()) or (select public.apex_is_workspace_member(workspace_id)))
with check ((select public.apex_is_workspace_member(workspace_id)) or user_id = (select auth.uid()));

drop policy if exists "Members can manage classes" on public.apex_classes;
create policy "Members can manage classes" on public.apex_classes for all to authenticated using ((select public.apex_is_workspace_member(workspace_id))) with check ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can manage assignments" on public.apex_assignments;
create policy "Members can manage assignments" on public.apex_assignments for all to authenticated using ((select public.apex_is_workspace_member(workspace_id))) with check ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can manage syllabi" on public.apex_syllabi;
create policy "Members can manage syllabi" on public.apex_syllabi for all to authenticated using ((select public.apex_is_workspace_member(workspace_id))) with check ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can manage tasks" on public.apex_tasks;
create policy "Members can manage tasks" on public.apex_tasks for all to authenticated using ((select public.apex_is_workspace_member(workspace_id))) with check ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can manage calendar events" on public.apex_calendar_events;
create policy "Members can manage calendar events" on public.apex_calendar_events for all to authenticated using ((select public.apex_is_workspace_member(workspace_id))) with check ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can manage financial accounts" on public.apex_financial_accounts;
create policy "Members can manage financial accounts" on public.apex_financial_accounts for all to authenticated using ((select public.apex_is_workspace_member(workspace_id))) with check ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can manage transactions" on public.apex_transactions;
create policy "Members can manage transactions" on public.apex_transactions for all to authenticated using ((select public.apex_is_workspace_member(workspace_id))) with check ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can manage budgets" on public.apex_budgets;
create policy "Members can manage budgets" on public.apex_budgets for all to authenticated using ((select public.apex_is_workspace_member(workspace_id))) with check ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can manage notebooks" on public.apex_notebooks;
create policy "Members can manage notebooks" on public.apex_notebooks for all to authenticated using ((select public.apex_is_workspace_member(workspace_id))) with check ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can manage notes" on public.apex_notes;
create policy "Members can manage notes" on public.apex_notes for all to authenticated using ((select public.apex_is_workspace_member(workspace_id))) with check ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can manage uploads" on public.apex_uploads;
create policy "Members can manage uploads" on public.apex_uploads for all to authenticated using ((select public.apex_is_workspace_member(workspace_id))) with check ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can manage integrations" on public.apex_integrations;
create policy "Members can manage integrations" on public.apex_integrations for all to authenticated using ((select public.apex_is_workspace_member(workspace_id))) with check ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can manage notifications" on public.apex_notifications;
create policy "Members can manage notifications" on public.apex_notifications for all to authenticated using (user_id = (select auth.uid()) and (select public.apex_is_workspace_member(workspace_id))) with check (user_id = (select auth.uid()) and (select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can manage notification events" on public.apex_notification_events;
create policy "Members can manage notification events" on public.apex_notification_events for all to authenticated using ((select public.apex_is_workspace_member(workspace_id))) with check ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Users can manage notification preferences" on public.apex_notification_preferences;
create policy "Users can manage notification preferences" on public.apex_notification_preferences for all to authenticated using (user_id = (select auth.uid()) and (select public.apex_is_workspace_member(workspace_id))) with check (user_id = (select auth.uid()) and (select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can read activity log" on public.apex_activity_log;
create policy "Members can read activity log" on public.apex_activity_log for select to authenticated using ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can insert activity log" on public.apex_activity_log;
create policy "Members can insert activity log" on public.apex_activity_log for insert to authenticated with check ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can manage scheduler preferences" on public.apex_scheduler_preferences;
create policy "Members can manage scheduler preferences" on public.apex_scheduler_preferences for all to authenticated using ((select public.apex_is_workspace_member(workspace_id))) with check ((select public.apex_is_workspace_member(workspace_id)));
drop policy if exists "Members can manage constraint rules" on public.apex_constraint_rules;
create policy "Members can manage constraint rules" on public.apex_constraint_rules for all to authenticated using ((select public.apex_is_workspace_member(workspace_id))) with check ((select public.apex_is_workspace_member(workspace_id)));

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'apex_workspaces', 'apex_classes', 'apex_assignments', 'apex_syllabi',
    'apex_tasks', 'apex_calendar_events', 'apex_financial_accounts',
    'apex_budgets', 'apex_notebooks', 'apex_notes', 'apex_uploads',
    'apex_integrations', 'apex_notification_preferences',
    'apex_scheduler_preferences', 'apex_constraint_rules'
  ]
  loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', target_table, target_table);
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function public.apex_touch_updated_at()', target_table, target_table);
  end loop;
end;
$$;
