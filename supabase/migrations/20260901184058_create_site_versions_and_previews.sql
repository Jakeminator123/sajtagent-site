-- Site-owned, immutable V1 version and preview projection.
--
-- Privileged writes stay behind the SiteAgent controller. Authenticated users
-- receive read-only access to rows bound to their auth.uid(); anonymous users
-- receive no table grants. Runtime artifact refs and credentials have no
-- column in this projection.

alter table public.build_jobs
  add constraint build_jobs_project_owner_identity_unique
  unique (id, project_id, tenant_id, owner_user_id);

create table public.site_preview_artifacts (
  id text primary key,
  tenant_id text not null,
  project_id text not null,
  owner_user_id uuid not null,
  workspace_revision_id text not null,
  source_job_id text not null,
  media_type text not null,
  sha256 text not null,
  size_bytes integer not null,
  html_content text not null,
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint site_preview_artifacts_revision_owner_fk
    foreign key (workspace_revision_id, project_id, tenant_id, owner_user_id)
    references public.workspace_revisions(id, project_id, tenant_id, owner_user_id)
    on delete cascade,
  constraint site_preview_artifacts_job_owner_fk
    foreign key (source_job_id, project_id, tenant_id, owner_user_id)
    references public.build_jobs(id, project_id, tenant_id, owner_user_id)
    on delete cascade,
  constraint site_preview_artifacts_identity_unique
    unique (id, tenant_id, project_id, owner_user_id, workspace_revision_id),
  constraint site_preview_artifacts_one_per_revision
    unique (workspace_revision_id, project_id, tenant_id, owner_user_id),
  constraint site_preview_artifacts_one_per_job
    unique (source_job_id),
  constraint site_preview_artifacts_html_only
    check (media_type = 'text/html'),
  constraint site_preview_artifacts_sha256
    check (sha256 ~ '^[a-f0-9]{64}$'),
  constraint site_preview_artifacts_size_bounded
    check (size_bytes between 1 and 1048576),
  constraint site_preview_artifacts_size_matches
    check (octet_length(html_content) = size_bytes),
  constraint site_preview_artifacts_no_runtime_ref
    check (position('sprite-worktree:' in lower(html_content)) = 0)
);

create table public.site_versions (
  id text primary key,
  tenant_id text not null,
  project_id text not null,
  owner_user_id uuid not null,
  workspace_revision_id text not null,
  source_job_id text not null,
  preview_ref text not null,
  sitemap_revision text not null,
  version_number integer not null,
  verification_receipts jsonb not null,
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint site_versions_revision_owner_fk
    foreign key (workspace_revision_id, project_id, tenant_id, owner_user_id)
    references public.workspace_revisions(id, project_id, tenant_id, owner_user_id)
    on delete cascade,
  constraint site_versions_job_owner_fk
    foreign key (source_job_id, project_id, tenant_id, owner_user_id)
    references public.build_jobs(id, project_id, tenant_id, owner_user_id)
    on delete cascade,
  constraint site_versions_preview_owner_fk
    foreign key (preview_ref, tenant_id, project_id, owner_user_id, workspace_revision_id)
    references public.site_preview_artifacts(id, tenant_id, project_id, owner_user_id, workspace_revision_id)
    on delete restrict,
  constraint site_versions_identity_unique
    unique (id, tenant_id, project_id, owner_user_id),
  constraint site_versions_one_per_revision
    unique (workspace_revision_id, project_id, tenant_id, owner_user_id),
  constraint site_versions_one_per_job
    unique (source_job_id),
  constraint site_versions_project_number_unique
    unique (project_id, tenant_id, owner_user_id, version_number),
  constraint site_versions_number_positive
    check (version_number > 0),
  constraint site_versions_sitemap_revision_not_blank
    check (length(btrim(sitemap_revision)) between 1 and 160),
  constraint site_versions_receipts_array
    check (jsonb_typeof(verification_receipts) = 'array')
);

create index site_versions_project_created_idx
  on public.site_versions (project_id, version_number desc);
create index site_preview_artifacts_owner_created_idx
  on public.site_preview_artifacts (owner_user_id, created_at desc);

alter table public.site_preview_artifacts enable row level security;
alter table public.site_versions enable row level security;

revoke all on table public.site_preview_artifacts from anon, authenticated;
revoke all on table public.site_versions from anon, authenticated;

grant select on table public.site_versions to authenticated;

grant select, insert, update, delete on table public.site_preview_artifacts to service_role;
grant select, insert, update, delete on table public.site_versions to service_role;

create policy site_preview_artifacts_owner_read
  on public.site_preview_artifacts
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

create policy site_versions_owner_read
  on public.site_versions
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);
