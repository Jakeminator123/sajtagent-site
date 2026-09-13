-- Publication is an explicit snapshot, never the moving private preview head.
create table public.next_publications_v2 (
  project_id text primary key references public.site_projects(id) on delete cascade,
  tenant_id text not null,
  owner_user_id uuid not null references auth.users(id),
  hostname text not null unique,
  snapshot jsonb not null,
  published_at timestamptz not null default now(),
  constraint next_publications_v2_snapshot_owner check (
    snapshot->>'projectId' = project_id and snapshot->>'tenantId' = tenant_id
  )
);
alter table public.next_publications_v2 enable row level security;
revoke all on public.next_publications_v2 from public, anon, authenticated;
grant select, insert, update, delete on public.next_publications_v2 to service_role;
-- The server resolves public hostname -> pinned snapshot. No Data API access.
