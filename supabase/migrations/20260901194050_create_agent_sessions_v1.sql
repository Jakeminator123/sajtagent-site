-- Site-owned continuous AgentSession V1 persistence.
--
-- Browser-safe session, turn and event rows are owner-readable. Turn policies
-- remain server-only. All writes are performed by the authenticated SiteAgent
-- controller through its server-side database connection.

create schema if not exists siteagent_private;
revoke all on schema siteagent_private from public, anon, authenticated;
grant usage on schema siteagent_private to service_role;

create table public.agent_sessions (
  id text primary key,
  tenant_id text not null,
  project_id text not null,
  owner_user_id uuid not null,
  active_base_revision_id text not null,
  status text not null default 'active',
  last_sequence integer not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint agent_sessions_project_owner_fk
    foreign key (project_id, tenant_id, owner_user_id)
    references public.site_projects(id, tenant_id, owner_user_id)
    on delete cascade,
  constraint agent_sessions_revision_owner_fk
    foreign key (active_base_revision_id, project_id, tenant_id, owner_user_id)
    references public.workspace_revisions(id, project_id, tenant_id, owner_user_id)
    on delete restrict,
  constraint agent_sessions_identity_unique
    unique (id, tenant_id, project_id, owner_user_id),
  constraint agent_sessions_id_shape
    check (id ~ '^session:[A-Za-z0-9_-]{32,128}$'),
  constraint agent_sessions_status_known
    check (status in ('active', 'closed')),
  constraint agent_sessions_sequence_non_negative
    check (last_sequence >= 0),
  constraint agent_sessions_updated_after_created
    check (updated_at >= created_at)
);

create unique index agent_sessions_one_active_per_project_idx
  on public.agent_sessions (tenant_id, project_id, owner_user_id)
  where status = 'active';

create table public.agent_turns (
  id text primary key,
  session_id text not null,
  tenant_id text not null,
  project_id text not null,
  owner_user_id uuid not null,
  base_revision_id text not null,
  base_sequence integer not null,
  idempotency_key text not null,
  request_hash text not null,
  request_payload jsonb not null,
  status text not null default 'running',
  outcome text,
  created_at timestamptz not null,
  terminal_at timestamptz,
  constraint agent_turns_session_owner_fk
    foreign key (session_id, tenant_id, project_id, owner_user_id)
    references public.agent_sessions(id, tenant_id, project_id, owner_user_id)
    on delete cascade,
  constraint agent_turns_revision_owner_fk
    foreign key (base_revision_id, project_id, tenant_id, owner_user_id)
    references public.workspace_revisions(id, project_id, tenant_id, owner_user_id)
    on delete restrict,
  constraint agent_turns_identity_unique
    unique (id, session_id, tenant_id, project_id, owner_user_id),
  constraint agent_turns_idempotency_unique
    unique (session_id, idempotency_key),
  constraint agent_turns_id_shape
    check (id ~ '^turn:[A-Za-z0-9_-]{16,128}$'),
  constraint agent_turns_idempotency_not_blank
    check (length(btrim(idempotency_key)) between 1 and 160),
  constraint agent_turns_request_hash_sha256
    check (request_hash ~ '^[a-f0-9]{64}$'),
  constraint agent_turns_base_sequence_non_negative
    check (base_sequence >= 0),
  constraint agent_turns_request_object
    check (jsonb_typeof(request_payload) = 'object'),
  constraint agent_turns_status_known
    check (status in ('running', 'completed', 'failed')),
  constraint agent_turns_outcome_known
    check (outcome is null or outcome in ('answered', 'awaiting_user', 'built', 'no_change')),
  constraint agent_turns_terminal_state_consistent
    check (
      (status = 'running' and outcome is null and terminal_at is null)
      or (status = 'completed' and outcome is not null and terminal_at is not null)
      or (status = 'failed' and outcome is null and terminal_at is not null)
    ),
  constraint agent_turns_terminal_after_creation
    check (terminal_at is null or terminal_at >= created_at)
);

create unique index agent_turns_one_running_per_session_idx
  on public.agent_turns (session_id)
  where status = 'running';

create table public.agent_turn_policies (
  turn_id text primary key,
  session_id text not null,
  tenant_id text not null,
  project_id text not null,
  owner_user_id uuid not null,
  policy jsonb not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  constraint agent_turn_policies_turn_owner_fk
    foreign key (turn_id, session_id, tenant_id, project_id, owner_user_id)
    references public.agent_turns(id, session_id, tenant_id, project_id, owner_user_id)
    on delete cascade,
  constraint agent_turn_policies_policy_object
    check (jsonb_typeof(policy) = 'object'),
  constraint agent_turn_policies_expiry_after_issue
    check (expires_at > issued_at),
  constraint agent_turn_policies_ttl_bounded
    check (expires_at <= issued_at + interval '15 minutes')
);

create table public.agent_events (
  session_id text not null,
  sequence integer not null,
  event_id text not null,
  turn_id text not null,
  tenant_id text not null,
  project_id text not null,
  owner_user_id uuid not null,
  event jsonb not null,
  occurred_at timestamptz not null,
  primary key (session_id, sequence),
  constraint agent_events_event_id_unique
    unique (event_id),
  constraint agent_events_turn_owner_fk
    foreign key (turn_id, session_id, tenant_id, project_id, owner_user_id)
    references public.agent_turns(id, session_id, tenant_id, project_id, owner_user_id)
    on delete cascade,
  constraint agent_events_event_id_shape
    check (event_id ~ '^event:[A-Za-z0-9_-]{16,128}$'),
  constraint agent_events_sequence_positive
    check (sequence > 0),
  constraint agent_events_event_object
    check (jsonb_typeof(event) = 'object'),
  constraint agent_events_envelope_matches_columns
    check (
      event ->> 'sessionId' = session_id
      and event ->> 'turnId' = turn_id
      and event ->> 'eventId' = event_id
      and event ->> 'sequence' = sequence::text
    )
);

create index agent_sessions_owner_updated_idx
  on public.agent_sessions (owner_user_id, updated_at desc);
create index agent_turns_session_created_idx
  on public.agent_turns (session_id, created_at desc);
create index agent_events_turn_sequence_idx
  on public.agent_events (turn_id, sequence);

create function siteagent_private.enforce_agent_event_sequence_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  update public.agent_sessions
     set last_sequence = last_sequence + 1,
         updated_at = greatest(updated_at, new.occurred_at)
   where id = new.session_id
     and tenant_id = new.tenant_id
     and project_id = new.project_id
     and owner_user_id = new.owner_user_id
     and status = 'active'
     and last_sequence + 1 = new.sequence;

  if not found then
    raise exception 'agent_event_sequence_gap'
      using errcode = '23514';
  end if;
  return new;
end
$function$;

revoke all on function siteagent_private.enforce_agent_event_sequence_v1()
  from public, anon, authenticated;
grant execute on function siteagent_private.enforce_agent_event_sequence_v1()
  to service_role;

create trigger agent_events_sequence_guard_v1
before insert on public.agent_events
for each row execute function siteagent_private.enforce_agent_event_sequence_v1();

alter table public.agent_sessions enable row level security;
alter table public.agent_turns enable row level security;
alter table public.agent_turn_policies enable row level security;
alter table public.agent_events enable row level security;

revoke all on table public.agent_sessions from public, anon, authenticated;
revoke all on table public.agent_turns from public, anon, authenticated;
revoke all on table public.agent_turn_policies from public, anon, authenticated;
revoke all on table public.agent_events from public, anon, authenticated;

grant select on table public.agent_sessions to authenticated;
grant select on table public.agent_turns to authenticated;
grant select on table public.agent_events to authenticated;

grant select, insert, update, delete on table public.agent_sessions to service_role;
grant select, insert, update, delete on table public.agent_turns to service_role;
grant select, insert, update, delete on table public.agent_turn_policies to service_role;
grant select, insert, update, delete on table public.agent_events to service_role;

create policy agent_sessions_owner_read
  on public.agent_sessions
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

create policy agent_turns_owner_read
  on public.agent_turns
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

create policy agent_events_owner_read
  on public.agent_events
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);
