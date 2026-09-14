begin;
select plan(8);

select has_column(
  'public',
  'site_projects',
  'worker_sprite_id',
  'site_projects.worker_sprite_id exists'
);

select is(
  (
    select is_nullable
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'site_projects'
       and column_name = 'worker_sprite_id'
  ),
  'YES',
  'worker_sprite_id is nullable'
);

select ok(
  exists(
    select 1
      from pg_indexes
     where schemaname = 'public'
       and tablename = 'site_projects'
       and indexname = 'site_projects_worker_sprite_id_unique'
  ),
  'worker_sprite_id is unique when bound'
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
    'owner-one-v2@example.test',
    '',
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'owner-two-v2@example.test',
    '',
    now(),
    now()
  );

insert into public.site_projects (id, tenant_id, owner_user_id, name, worker_sprite_id)
values
  (
    'project:v2-owner-one',
    'tenant:owner-one',
    '11111111-1111-4111-8111-111111111111',
    'Owner one',
    'sprite:owner-one'
  ),
  (
    'project:v2-owner-two',
    'tenant:owner-two',
    '22222222-2222-4222-8222-222222222222',
    'Owner two',
    null
  );

select throws_ok(
  $$update public.site_projects
       set worker_sprite_id = 'sprite:owner-one'
     where id = 'project:v2-owner-two'$$,
  '23505',
  null,
  'one workerSpriteId cannot be bound to two projects'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select results_eq(
  $$select worker_sprite_id from public.site_projects where id = 'project:v2-owner-one'$$,
  array['sprite:owner-one'::text],
  'owner can read their own worker binding'
);

select results_eq(
  $$select count(*)::bigint from public.site_projects where id = 'project:v2-owner-two'$$,
  array[0::bigint],
  'other principal project stays invisible'
);

select throws_ok(
  $$update public.site_projects
       set worker_sprite_id = 'sprite:stolen'
     where id = 'project:v2-owner-one'$$,
  '42501',
  null,
  'authenticated clients cannot write worker_sprite_id'
);

select throws_ok(
  $$insert into public.site_projects (id, tenant_id, owner_user_id, name, worker_sprite_id)
    values (
      'project:v2-forbidden',
      'tenant:owner-one',
      '11111111-1111-4111-8111-111111111111',
      'Forbidden',
      'sprite:client-chosen'
    )$$,
  '42501',
  null,
  'authenticated clients cannot create a worker binding'
);

select * from finish();
rollback;
