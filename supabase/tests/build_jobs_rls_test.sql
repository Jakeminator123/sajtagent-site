begin;
select plan(15);

select has_table('public', 'site_projects', 'site_projects exists');
select has_table('public', 'workspace_revisions', 'workspace_revisions exists');
select has_table('public', 'build_jobs', 'build_jobs exists');
select has_table('public', 'build_events', 'build_events exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.site_projects'::regclass),
  'site_projects has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.workspace_revisions'::regclass),
  'workspace_revisions has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.build_jobs'::regclass),
  'build_jobs has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.build_events'::regclass),
  'build_events has RLS enabled'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  created_at,
  updated_at
) values
  (
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'owner-one@example.test',
    '',
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'owner-two@example.test',
    '',
    now(),
    now()
  );

insert into public.site_projects (
  id,
  tenant_id,
  owner_user_id,
  name
) values
  ('project:owner-one', 'tenant:owner-one', '11111111-1111-4111-8111-111111111111', 'Owner one'),
  ('project:owner-two', 'tenant:owner-two', '22222222-2222-4222-8222-222222222222', 'Owner two');

insert into public.workspace_revisions (
  id,
  tenant_id,
  project_id,
  owner_user_id,
  manifest
) values
  (
    'revision:owner-one:root',
    'tenant:owner-one',
    'project:owner-one',
    '11111111-1111-4111-8111-111111111111',
    '{"kind":"root"}'::jsonb
  ),
  (
    'revision:owner-two:root',
    'tenant:owner-two',
    'project:owner-two',
    '22222222-2222-4222-8222-222222222222',
    '{"kind":"root"}'::jsonb
  );

insert into public.build_jobs (
  id,
  tenant_id,
  project_id,
  owner_user_id,
  base_revision_id,
  idempotency_key,
  request_hash,
  intent,
  execution_policy,
  agent_profile_id,
  agent_profile_revision,
  status,
  created_at,
  expires_at
) values
  (
    'job:owner-one',
    'tenant:owner-one',
    'project:owner-one',
    '11111111-1111-4111-8111-111111111111',
    'revision:owner-one:root',
    'idem:owner-one',
    repeat('a', 64),
    '{"schemaVersion":1}'::jsonb,
    '{"deadlineAt":"2026-09-01T12:05:00.000Z"}'::jsonb,
    'siteagent-builder',
    1,
    'accepted',
    '2026-09-01T12:00:00.000Z',
    '2026-09-01T12:10:00.000Z'
  ),
  (
    'job:owner-two',
    'tenant:owner-two',
    'project:owner-two',
    '22222222-2222-4222-8222-222222222222',
    'revision:owner-two:root',
    'idem:owner-two',
    repeat('b', 64),
    '{"schemaVersion":1}'::jsonb,
    '{"deadlineAt":"2026-09-01T12:05:00.000Z"}'::jsonb,
    'siteagent-builder',
    1,
    'accepted',
    '2026-09-01T12:00:00.000Z',
    '2026-09-01T12:10:00.000Z'
  );

insert into public.build_events (
  job_id,
  sequence,
  tenant_id,
  owner_user_id,
  event,
  occurred_at
) values
  (
    'job:owner-one',
    1,
    'tenant:owner-one',
    '11111111-1111-4111-8111-111111111111',
    '{"type":"job.accepted"}'::jsonb,
    now()
  ),
  (
    'job:owner-two',
    1,
    'tenant:owner-two',
    '22222222-2222-4222-8222-222222222222',
    '{"type":"job.accepted"}'::jsonb,
    now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select results_eq(
  'select count(*)::bigint from public.site_projects',
  array[1::bigint],
  'owner reads only their project'
);
select results_eq(
  'select count(*)::bigint from public.workspace_revisions',
  array[1::bigint],
  'owner reads only their revision'
);
select results_eq(
  'select count(*)::bigint from public.build_jobs',
  array[1::bigint],
  'owner reads only their build job'
);
select results_eq(
  'select count(*)::bigint from public.build_events',
  array[1::bigint],
  'owner reads only their build event'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select results_eq(
  $$select count(*)::bigint from public.build_jobs where id = 'job:owner-one'$$,
  array[0::bigint],
  'cross-tenant build job is invisible'
);

select throws_ok(
  $$insert into public.site_projects (id, tenant_id, owner_user_id, name)
    values ('project:forbidden', 'tenant:owner-two', '22222222-2222-4222-8222-222222222222', 'Forbidden')$$,
  '42501',
  null,
  'authenticated clients cannot bypass the controller and write projects'
);

reset role;
set local role anon;
select throws_ok(
  $$select count(*) from public.build_jobs$$,
  '42501',
  null,
  'anonymous clients have no table grant'
);

select * from finish();
rollback;
