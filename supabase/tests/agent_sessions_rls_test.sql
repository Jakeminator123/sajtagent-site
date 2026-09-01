begin;
select plan(31);

select has_table('public', 'agent_sessions', 'agent_sessions exists');
select has_table('public', 'agent_turns', 'agent_turns exists');
select has_table('public', 'agent_turn_policies', 'agent_turn_policies exists');
select has_table('public', 'agent_events', 'agent_events exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.agent_sessions'::regclass),
  'agent_sessions has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.agent_turns'::regclass),
  'agent_turns has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.agent_turn_policies'::regclass),
  'agent_turn_policies has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.agent_events'::regclass),
  'agent_events has RLS enabled'
);

select ok(
  has_table_privilege('authenticated', 'public.agent_sessions', 'select'),
  'authenticated receives explicit session select'
);
select ok(
  has_table_privilege('authenticated', 'public.agent_turns', 'select'),
  'authenticated receives explicit turn select'
);
select ok(
  has_table_privilege('authenticated', 'public.agent_events', 'select'),
  'authenticated receives explicit event select'
);
select ok(
  not has_table_privilege('authenticated', 'public.agent_turn_policies', 'select'),
  'turn policies remain server-only'
);
select ok(
  not has_table_privilege('authenticated', 'public.agent_sessions', 'insert'),
  'authenticated cannot insert sessions directly'
);
select ok(
  not has_table_privilege('anon', 'public.agent_events', 'select'),
  'anonymous clients cannot read events'
);
select ok(
  has_table_privilege('service_role', 'public.agent_turn_policies', 'select'),
  'service role can read server-owned policies'
);
select has_function(
  'siteagent_private',
  'enforce_agent_event_sequence_v1',
  'session-global sequence guard exists'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, created_at, updated_at
) values
  (
    '55555555-5555-4555-8555-555555555555',
    'authenticated', 'authenticated', 'agent-owner-one@example.test', '', now(), now()
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    'authenticated', 'authenticated', 'agent-owner-two@example.test', '', now(), now()
  );

insert into public.site_projects (id, tenant_id, owner_user_id, name) values
  ('project:agent-one', 'personal:55555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', 'Agent one'),
  ('project:agent-two', 'personal:66666666-6666-4666-8666-666666666666', '66666666-6666-4666-8666-666666666666', 'Agent two');

insert into public.workspace_revisions (
  id, tenant_id, project_id, owner_user_id, manifest, verification_receipts
) values
  (
    'revision:agent-one:root',
    'personal:55555555-5555-4555-8555-555555555555',
    'project:agent-one',
    '55555555-5555-4555-8555-555555555555',
    '{}'::jsonb, '[]'::jsonb
  ),
  (
    'revision:agent-two:root',
    'personal:66666666-6666-4666-8666-666666666666',
    'project:agent-two',
    '66666666-6666-4666-8666-666666666666',
    '{}'::jsonb, '[]'::jsonb
  );

insert into public.agent_sessions (
  id, tenant_id, project_id, owner_user_id, active_base_revision_id,
  status, created_at, updated_at
) values
  (
    'session:11111111111111111111111111111111',
    'personal:55555555-5555-4555-8555-555555555555',
    'project:agent-one',
    '55555555-5555-4555-8555-555555555555',
    'revision:agent-one:root', 'active', now(), now()
  ),
  (
    'session:22222222222222222222222222222222',
    'personal:66666666-6666-4666-8666-666666666666',
    'project:agent-two',
    '66666666-6666-4666-8666-666666666666',
    'revision:agent-two:root', 'active', now(), now()
  );

insert into public.agent_turns (
  id, session_id, tenant_id, project_id, owner_user_id, base_revision_id,
  base_sequence, idempotency_key, request_hash, request_payload, status, created_at
) values
  (
    'turn:1111111111111111',
    'session:11111111111111111111111111111111',
    'personal:55555555-5555-4555-8555-555555555555',
    'project:agent-one', '55555555-5555-4555-8555-555555555555',
    'revision:agent-one:root', 0, 'idem:agent-one', repeat('a', 64),
    '{"schemaVersion":1,"message":"Hej"}'::jsonb, 'running', now()
  ),
  (
    'turn:2222222222222222',
    'session:22222222222222222222222222222222',
    'personal:66666666-6666-4666-8666-666666666666',
    'project:agent-two', '66666666-6666-4666-8666-666666666666',
    'revision:agent-two:root', 0, 'idem:agent-two', repeat('b', 64),
    '{"schemaVersion":1,"message":"Hej"}'::jsonb, 'running', now()
  );

insert into public.agent_turn_policies (
  turn_id, session_id, tenant_id, project_id, owner_user_id,
  policy, issued_at, expires_at
) values
  (
    'turn:1111111111111111',
    'session:11111111111111111111111111111111',
    'personal:55555555-5555-4555-8555-555555555555',
    'project:agent-one', '55555555-5555-4555-8555-555555555555',
    '{"schemaVersion":1,"capabilities":["conversation.respond"]}'::jsonb,
    now(), now() + interval '5 minutes'
  ),
  (
    'turn:2222222222222222',
    'session:22222222222222222222222222222222',
    'personal:66666666-6666-4666-8666-666666666666',
    'project:agent-two', '66666666-6666-4666-8666-666666666666',
    '{"schemaVersion":1,"capabilities":["conversation.respond"]}'::jsonb,
    now(), now() + interval '5 minutes'
  );

insert into public.agent_events (
  session_id, sequence, event_id, turn_id, tenant_id, project_id,
  owner_user_id, event, occurred_at
) values
  (
    'session:11111111111111111111111111111111', 1,
    'event:1111111111111111', 'turn:1111111111111111',
    'personal:55555555-5555-4555-8555-555555555555', 'project:agent-one',
    '55555555-5555-4555-8555-555555555555',
    '{"schemaVersion":1,"sessionId":"session:11111111111111111111111111111111","turnId":"turn:1111111111111111","eventId":"event:1111111111111111","sequence":1,"type":"turn.accepted"}'::jsonb,
    now()
  ),
  (
    'session:22222222222222222222222222222222', 1,
    'event:2222222222222222', 'turn:2222222222222222',
    'personal:66666666-6666-4666-8666-666666666666', 'project:agent-two',
    '66666666-6666-4666-8666-666666666666',
    '{"schemaVersion":1,"sessionId":"session:22222222222222222222222222222222","turnId":"turn:2222222222222222","eventId":"event:2222222222222222","sequence":1,"type":"turn.accepted"}'::jsonb,
    now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}',
  true
);

select results_eq(
  'select count(*)::bigint from public.agent_sessions',
  array[1::bigint],
  'owner reads only their session'
);
select results_eq(
  'select count(*)::bigint from public.agent_turns',
  array[1::bigint],
  'owner reads only their turn'
);
select results_eq(
  'select count(*)::bigint from public.agent_events',
  array[1::bigint],
  'owner reads only their event'
);
select results_eq(
  $$select count(*)::bigint from public.agent_sessions
      where id = 'session:22222222222222222222222222222222'$$,
  array[0::bigint],
  'cross-owner session is invisible'
);

select throws_ok(
  $$select count(*) from public.agent_turn_policies$$,
  '42501', null,
  'authenticated clients cannot read server-owned policy'
);
select throws_ok(
  $$insert into public.agent_sessions (
      id, tenant_id, project_id, owner_user_id, active_base_revision_id,
      status, created_at, updated_at
    ) values (
      'session:33333333333333333333333333333333',
      'personal:55555555-5555-4555-8555-555555555555',
      'project:agent-one', '55555555-5555-4555-8555-555555555555',
      'revision:agent-one:root', 'active', now(), now()
    )$$,
  '42501', null,
  'authenticated clients cannot create sessions directly'
);
select throws_ok(
  $$update public.agent_turns set status = 'failed'
      where id = 'turn:1111111111111111'$$,
  '42501', null,
  'authenticated clients cannot update turns directly'
);
select throws_ok(
  $$delete from public.agent_events
      where event_id = 'event:1111111111111111'$$,
  '42501', null,
  'authenticated clients cannot delete events directly'
);

reset role;
set local role anon;
select throws_ok(
  $$select count(*) from public.agent_sessions$$,
  '42501', null,
  'anonymous clients have no session table grant'
);

reset role;
select throws_ok(
  $$insert into public.agent_events (
      session_id, sequence, event_id, turn_id, tenant_id, project_id,
      owner_user_id, event, occurred_at
    ) values (
      'session:11111111111111111111111111111111', 3,
      'event:3333333333333333', 'turn:1111111111111111',
      'personal:55555555-5555-4555-8555-555555555555', 'project:agent-one',
      '55555555-5555-4555-8555-555555555555',
      '{"schemaVersion":1,"sessionId":"session:11111111111111111111111111111111","turnId":"turn:1111111111111111","eventId":"event:3333333333333333","sequence":3,"type":"turn.failed"}'::jsonb,
      now()
    )$$,
  '23514', null,
  'database rejects a session-global sequence gap'
);
select throws_ok(
  $$insert into public.agent_events (
      session_id, sequence, event_id, turn_id, tenant_id, project_id,
      owner_user_id, event, occurred_at
    ) values (
      'session:11111111111111111111111111111111', 2,
      'event:1111111111111111', 'turn:1111111111111111',
      'personal:55555555-5555-4555-8555-555555555555', 'project:agent-one',
      '55555555-5555-4555-8555-555555555555',
      '{"schemaVersion":1,"sessionId":"session:11111111111111111111111111111111","turnId":"turn:1111111111111111","eventId":"event:1111111111111111","sequence":2,"type":"turn.failed"}'::jsonb,
      now()
    )$$,
  '23505', null,
  'database rejects a replayed event id'
);
select throws_ok(
  $$insert into public.agent_turns (
      id, session_id, tenant_id, project_id, owner_user_id, base_revision_id,
      base_sequence, idempotency_key, request_hash, request_payload, status, created_at
    ) values (
      'turn:3333333333333333',
      'session:11111111111111111111111111111111',
      'personal:55555555-5555-4555-8555-555555555555',
      'project:agent-one', '55555555-5555-4555-8555-555555555555',
      'revision:agent-one:root', 1, 'idem:agent-one', repeat('c', 64),
      '{}'::jsonb, 'running', now()
    )$$,
  '23505', null,
  'database enforces turn idempotency per session'
);
select throws_ok(
  $$insert into public.agent_turns (
      id, session_id, tenant_id, project_id, owner_user_id, base_revision_id,
      base_sequence, idempotency_key, request_hash, request_payload, status, created_at
    ) values (
      'turn:4444444444444444',
      'session:11111111111111111111111111111111',
      'personal:55555555-5555-4555-8555-555555555555',
      'project:agent-one', '55555555-5555-4555-8555-555555555555',
      'revision:agent-one:root', 1, 'idem:other', repeat('d', 64),
      '{}'::jsonb, 'running', now()
    )$$,
  '23505', null,
  'database permits only one running turn per session'
);
select throws_ok(
  $$insert into public.agent_sessions (
      id, tenant_id, project_id, owner_user_id, active_base_revision_id,
      status, created_at, updated_at
    ) values (
      'session:44444444444444444444444444444444',
      'personal:55555555-5555-4555-8555-555555555555',
      'project:agent-one', '55555555-5555-4555-8555-555555555555',
      'revision:agent-one:root', 'active', now(), now()
    )$$,
  '23505', null,
  'database permits only one active session per project'
);
select results_eq(
  $$select last_sequence from public.agent_sessions
      where id = 'session:11111111111111111111111111111111'$$,
  array[1],
  'failed sequence inserts do not advance the session cursor'
);

select * from finish();
rollback;
