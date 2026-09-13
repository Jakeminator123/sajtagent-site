-- Server-only durable V2 state. No browser Data API access, including owner writes.
create table public.next_preview_states (
  project_id text primary key references public.site_projects(id) on delete cascade,
  tenant_id text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null default '{"current":null,"accepted":null}'::jsonb,
  source_files jsonb not null default '[]'::jsonb,
  accepted_source_files jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint next_preview_state_object check (jsonb_typeof(state) = 'object'),
  constraint next_preview_sources_array check (jsonb_typeof(source_files) = 'array' and jsonb_typeof(accepted_source_files) = 'array')
);
alter table public.next_preview_states enable row level security;
revoke all on public.next_preview_states from public, anon, authenticated;
grant select, insert, update, delete on public.next_preview_states to service_role;

create table public.next_preview_access (
  token_sha256 text primary key check (token_sha256 ~ '^[a-f0-9]{64}$'),
  kind text not null check (kind in ('grant','session')),
  project_id text not null references public.next_preview_states(project_id) on delete cascade,
  tenant_id text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  auth_session_id uuid not null references auth.sessions(id) on delete cascade,
  hostname text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index next_preview_access_expiry on public.next_preview_access(expires_at);
alter table public.next_preview_access enable row level security;
revoke all on public.next_preview_access from public, anon, authenticated;
grant select, insert, update, delete on public.next_preview_access to service_role;
comment on table public.next_preview_access is 'Opaque, hashed owner/session-bound preview capabilities; never Supabase access or Vercel bypass tokens.';
