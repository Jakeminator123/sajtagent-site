-- First SiteAgent build-job boundary.
--
-- The browser never writes these tables directly. Authenticated users receive
-- read access to their own rows; the server-side product controller performs
-- writes through its privileged, server-only database connection.

create table public.site_projects (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  active_revision_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_projects_identity_unique
    unique (id, tenant_id, owner_user_id),
  constraint site_projects_tenant_id_not_blank
    check (length(btrim(tenant_id)) between 1 and 160),
  constraint site_projects_name_not_blank
    check (length(btrim(name)) between 1 and 160)
);

create table public.workspace_revisions (
  id text primary key,
  tenant_id text not null,
  project_id text not null,
  owner_user_id uuid not null,
  base_revision_id text,
  source_job_id text,
  source_run_id text,
  manifest jsonb not null default '{}'::jsonb,
  verification_receipts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint workspace_revisions_project_owner_fk
    foreign key (project_id, tenant_id, owner_user_id)
    references public.site_projects(id, tenant_id, owner_user_id)
    on delete cascade,
  constraint workspace_revisions_identity_unique
    unique (id, project_id, tenant_id, owner_user_id),
  constraint workspace_revisions_manifest_object
    check (jsonb_typeof(manifest) = 'object'),
  constraint workspace_revisions_receipts_array
    check (jsonb_typeof(verification_receipts) = 'array')
);

create table public.build_jobs (
  id text primary key,
  tenant_id text not null,
  project_id text not null,
  owner_user_id uuid not null,
  base_revision_id text not null,
  idempotency_key text not null,
  request_hash text not null,
  intent jsonb not null,
  execution_policy jsonb not null,
  agent_profile_id text not null,
  agent_profile_revision integer not null,
  status text not null,
  worker_report jsonb,
  result jsonb,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint build_jobs_project_owner_fk
    foreign key (project_id, tenant_id, owner_user_id)
    references public.site_projects(id, tenant_id, owner_user_id)
    on delete cascade,
  constraint build_jobs_identity_unique
    unique (id, tenant_id, owner_user_id),
  constraint build_jobs_idempotency_unique
    unique (owner_user_id, project_id, idempotency_key),
  constraint build_jobs_status_known
    check (status in ('accepted', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out')),
  constraint build_jobs_request_hash_sha256
    check (request_hash ~ '^[a-f0-9]{64}$'),
  constraint build_jobs_intent_object
    check (jsonb_typeof(intent) = 'object'),
  constraint build_jobs_execution_policy_object
    check (jsonb_typeof(execution_policy) = 'object'),
  constraint build_jobs_profile_revision_positive
    check (agent_profile_revision > 0),
  constraint build_jobs_expiry_after_creation
    check (expires_at > created_at)
);

create table public.build_events (
  job_id text not null,
  sequence integer not null,
  tenant_id text not null,
  owner_user_id uuid not null,
  event jsonb not null,
  occurred_at timestamptz not null,
  primary key (job_id, sequence),
  constraint build_events_job_owner_fk
    foreign key (job_id, tenant_id, owner_user_id)
    references public.build_jobs(id, tenant_id, owner_user_id)
    on delete cascade,
  constraint build_events_sequence_positive
    check (sequence > 0),
  constraint build_events_event_object
    check (jsonb_typeof(event) = 'object')
);

create index build_jobs_project_created_idx
  on public.build_jobs (project_id, created_at desc);
create index build_jobs_owner_status_idx
  on public.build_jobs (owner_user_id, status, updated_at desc);
create index workspace_revisions_project_created_idx
  on public.workspace_revisions (project_id, created_at desc);
create index build_events_job_sequence_idx
  on public.build_events (job_id, sequence);

alter table public.site_projects enable row level security;
alter table public.workspace_revisions enable row level security;
alter table public.build_jobs enable row level security;
alter table public.build_events enable row level security;

revoke all on table public.site_projects from anon, authenticated;
revoke all on table public.workspace_revisions from anon, authenticated;
revoke all on table public.build_jobs from anon, authenticated;
revoke all on table public.build_events from anon, authenticated;

grant select on table public.site_projects to authenticated;
grant select on table public.workspace_revisions to authenticated;
grant select on table public.build_jobs to authenticated;
grant select on table public.build_events to authenticated;

grant all on table public.site_projects to service_role;
grant all on table public.workspace_revisions to service_role;
grant all on table public.build_jobs to service_role;
grant all on table public.build_events to service_role;

create policy site_projects_owner_read
  on public.site_projects
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

create policy workspace_revisions_owner_read
  on public.workspace_revisions
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

create policy build_jobs_owner_read
  on public.build_jobs
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

create policy build_events_owner_read
  on public.build_events
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);
