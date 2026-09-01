begin;
select plan(20);

select has_table('public', 'site_preview_artifacts', 'site_preview_artifacts exists');
select has_table('public', 'site_versions', 'site_versions exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.site_preview_artifacts'::regclass),
  'site_preview_artifacts has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.site_versions'::regclass),
  'site_versions has RLS enabled'
);

select ok(
  not has_table_privilege('authenticated', 'public.site_preview_artifacts', 'select'),
  'authenticated receives no raw preview select grant'
);
select ok(
  has_table_privilege('authenticated', 'public.site_versions', 'select'),
  'authenticated receives explicit version select grant'
);
select ok(
  not has_table_privilege('authenticated', 'public.site_preview_artifacts', 'insert'),
  'authenticated receives no preview insert grant'
);
select ok(
  not has_table_privilege('anon', 'public.site_versions', 'select'),
  'anonymous receives no version select grant'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, created_at, updated_at
) values
  (
    '33333333-3333-4333-8333-333333333333',
    'authenticated', 'authenticated', 'version-owner-one@example.test', '', now(), now()
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'authenticated', 'authenticated', 'version-owner-two@example.test', '', now(), now()
  );

insert into public.site_projects (id, tenant_id, owner_user_id, name) values
  ('project:version-one', 'personal:33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'Version one'),
  ('project:version-two', 'personal:44444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444', 'Version two');

insert into public.workspace_revisions (
  id, tenant_id, project_id, owner_user_id, manifest, verification_receipts
) values
  (
    'revision:version-one:base',
    'personal:33333333-3333-4333-8333-333333333333',
    'project:version-one',
    '33333333-3333-4333-8333-333333333333',
    '{}'::jsonb, '[]'::jsonb
  ),
  (
    'revision:version-one:accepted',
    'personal:33333333-3333-4333-8333-333333333333',
    'project:version-one',
    '33333333-3333-4333-8333-333333333333',
    '{}'::jsonb, '[]'::jsonb
  ),
  (
    'revision:version-two:base',
    'personal:44444444-4444-4444-8444-444444444444',
    'project:version-two',
    '44444444-4444-4444-8444-444444444444',
    '{}'::jsonb, '[]'::jsonb
  ),
  (
    'revision:version-two:accepted',
    'personal:44444444-4444-4444-8444-444444444444',
    'project:version-two',
    '44444444-4444-4444-8444-444444444444',
    '{}'::jsonb, '[]'::jsonb
  ),
  (
    'revision:version-one:cross-version',
    'personal:33333333-3333-4333-8333-333333333333',
    'project:version-one',
    '33333333-3333-4333-8333-333333333333',
    '{}'::jsonb, '[]'::jsonb
  );

insert into public.build_jobs (
  id, tenant_id, project_id, owner_user_id, base_revision_id,
  idempotency_key, request_hash, intent, execution_policy,
  agent_profile_id, agent_profile_revision, status, created_at, expires_at
) values
  (
    'job:version-one',
    'personal:33333333-3333-4333-8333-333333333333',
    'project:version-one',
    '33333333-3333-4333-8333-333333333333',
    'revision:version-one:base', 'idem:version-one', repeat('a', 64),
    '{"schemaVersion":1}'::jsonb,
    '{"deadlineAt":"2026-09-01T12:05:00.000Z"}'::jsonb,
    'siteagent-builder', 1, 'running',
    '2026-09-01T12:00:00.000Z', '2026-09-01T12:10:00.000Z'
  ),
  (
    'job:version-two',
    'personal:44444444-4444-4444-8444-444444444444',
    'project:version-two',
    '44444444-4444-4444-8444-444444444444',
    'revision:version-two:base', 'idem:version-two', repeat('b', 64),
    '{"schemaVersion":1}'::jsonb,
    '{"deadlineAt":"2026-09-01T12:05:00.000Z"}'::jsonb,
    'siteagent-builder', 1, 'running',
    '2026-09-01T12:00:00.000Z', '2026-09-01T12:10:00.000Z'
  ),
  (
    'job:version-one:cross-preview',
    'personal:33333333-3333-4333-8333-333333333333',
    'project:version-one',
    '33333333-3333-4333-8333-333333333333',
    'revision:version-one:base', 'idem:version-one:cross-preview', repeat('e', 64),
    '{"schemaVersion":1}'::jsonb,
    '{"deadlineAt":"2026-09-01T12:05:00.000Z"}'::jsonb,
    'siteagent-builder', 1, 'running',
    '2026-09-01T12:00:00.000Z', '2026-09-01T12:10:00.000Z'
  ),
  (
    'job:version-one:cross-version',
    'personal:33333333-3333-4333-8333-333333333333',
    'project:version-one',
    '33333333-3333-4333-8333-333333333333',
    'revision:version-one:base', 'idem:version-one:cross-version', repeat('f', 64),
    '{"schemaVersion":1}'::jsonb,
    '{"deadlineAt":"2026-09-01T12:05:00.000Z"}'::jsonb,
    'siteagent-builder', 1, 'running',
    '2026-09-01T12:00:00.000Z', '2026-09-01T12:10:00.000Z'
  );

insert into public.site_preview_artifacts (
  id, tenant_id, project_id, owner_user_id, workspace_revision_id,
  source_job_id, media_type, sha256, size_bytes, html_content, verified_at
) values
  (
    'preview:version-one',
    'personal:33333333-3333-4333-8333-333333333333',
    'project:version-one',
    '33333333-3333-4333-8333-333333333333',
    'revision:version-one:accepted', 'job:version-one', 'text/html', repeat('c', 64),
    octet_length('<main>one</main>'), '<main>one</main>', now()
  ),
  (
    'preview:version-two',
    'personal:44444444-4444-4444-8444-444444444444',
    'project:version-two',
    '44444444-4444-4444-8444-444444444444',
    'revision:version-two:accepted', 'job:version-two', 'text/html', repeat('d', 64),
    octet_length('<main>two</main>'), '<main>two</main>', now()
  );

insert into public.site_versions (
  id, tenant_id, project_id, owner_user_id, workspace_revision_id,
  source_job_id, preview_ref, sitemap_revision, version_number,
  verification_receipts, verified_at
) values
  (
    'version:one',
    'personal:33333333-3333-4333-8333-333333333333',
    'project:version-one',
    '33333333-3333-4333-8333-333333333333',
    'revision:version-one:accepted', 'job:version-one', 'preview:version-one',
    'sitemap:version-one', 1, '[]'::jsonb, now()
  ),
  (
    'version:two',
    'personal:44444444-4444-4444-8444-444444444444',
    'project:version-two',
    '44444444-4444-4444-8444-444444444444',
    'revision:version-two:accepted', 'job:version-two', 'preview:version-two',
    'sitemap:version-two', 1, '[]'::jsonb, now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);

select throws_ok(
  $$select count(*) from public.site_preview_artifacts$$,
  '42501', null,
  'authenticated owners must use the preview route instead of raw HTML select'
);
select results_eq(
  'select count(*)::bigint from public.site_versions',
  array[1::bigint],
  'owner reads only their canonical version'
);
select results_eq(
  $$select count(*)::bigint from public.site_versions where preview_ref = 'preview:version-one'$$,
  array[1::bigint],
  'owner resolves their opaque preview ref through the version read model'
);
select results_eq(
  $$select count(*)::bigint from public.site_versions where id = 'version:two'$$,
  array[0::bigint],
  'cross-tenant version is invisible'
);

select throws_ok(
  $$insert into public.site_preview_artifacts (
      id, tenant_id, project_id, owner_user_id, workspace_revision_id,
      source_job_id, media_type, sha256, size_bytes, html_content, verified_at
    ) values (
      'preview:forbidden', 'personal:33333333-3333-4333-8333-333333333333',
      'project:version-one', '33333333-3333-4333-8333-333333333333',
      'revision:version-one:accepted', 'job:version-one', 'text/html', repeat('e', 64),
      1, 'x', now()
    )$$,
  '42501', null,
  'authenticated clients cannot write preview artifacts'
);
select throws_ok(
  $$insert into public.site_versions (
      id, tenant_id, project_id, owner_user_id, workspace_revision_id,
      source_job_id, preview_ref, sitemap_revision, version_number,
      verification_receipts, verified_at
    ) values (
      'version:forbidden', 'personal:33333333-3333-4333-8333-333333333333',
      'project:version-one', '33333333-3333-4333-8333-333333333333',
      'revision:version-one:accepted', 'job:version-one', 'preview:version-one',
      'sitemap:forbidden', 2, '[]'::jsonb, now()
    )$$,
  '42501', null,
  'authenticated clients cannot write canonical versions'
);

reset role;
set local role anon;
select throws_ok(
  $$select count(*) from public.site_preview_artifacts$$,
  '42501', null,
  'anonymous clients cannot read preview artifacts'
);
select throws_ok(
  $$select count(*) from public.site_versions$$,
  '42501', null,
  'anonymous clients cannot read canonical versions'
);

reset role;
select throws_ok(
  $$insert into public.site_preview_artifacts (
      id, tenant_id, project_id, owner_user_id, workspace_revision_id,
      source_job_id, media_type, sha256, size_bytes, html_content, verified_at
    ) values (
      'preview:wrong-media', 'personal:33333333-3333-4333-8333-333333333333',
      'project:version-one', '33333333-3333-4333-8333-333333333333',
      'revision:version-one:accepted', 'job:version-one', 'text/javascript', repeat('e', 64),
      1, 'x', now()
    )$$,
  '23514', null,
  'non-HTML preview media types fail closed'
);
select throws_ok(
  $$insert into public.site_preview_artifacts (
      id, tenant_id, project_id, owner_user_id, workspace_revision_id,
      source_job_id, media_type, sha256, size_bytes, html_content, verified_at
    ) values (
      'preview:wrong-size', 'personal:33333333-3333-4333-8333-333333333333',
      'project:version-one', '33333333-3333-4333-8333-333333333333',
      'revision:version-one:accepted', 'job:version-one', 'text/html', repeat('e', 64),
      2, 'x', now()
    )$$,
  '23514', null,
  'preview byte count must match stored HTML'
);
select throws_ok(
  $$insert into public.site_preview_artifacts (
      id, tenant_id, project_id, owner_user_id, workspace_revision_id,
      source_job_id, media_type, sha256, size_bytes, html_content, verified_at
    ) values (
      'preview:cross-bound', 'personal:33333333-3333-4333-8333-333333333333',
      'project:version-one', '33333333-3333-4333-8333-333333333333',
      'revision:version-two:accepted', 'job:version-one:cross-preview', 'text/html', repeat('e', 64),
      1, 'x', now()
    )$$,
  '23503', null,
  'preview cannot bind a revision from another tenant and project'
);
select throws_ok(
  $$insert into public.site_versions (
      id, tenant_id, project_id, owner_user_id, workspace_revision_id,
      source_job_id, preview_ref, sitemap_revision, version_number,
      verification_receipts, verified_at
    ) values (
      'version:cross-bound', 'personal:33333333-3333-4333-8333-333333333333',
      'project:version-one', '33333333-3333-4333-8333-333333333333',
      'revision:version-one:cross-version', 'job:version-one:cross-version', 'preview:version-two',
      'sitemap:cross-bound', 2, '[]'::jsonb, now()
    )$$,
  '23503', null,
  'version cannot bind a preview from another tenant and project'
);

select * from finish();
rollback;
