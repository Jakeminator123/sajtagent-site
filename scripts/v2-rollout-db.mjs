import { registerHooks } from "node:module"
import { databaseIsSajtagent, inspectDatabaseResult } from "./v2-rollout-preflight.mjs"
import { resolveConfiguredDbEnv } from "../lib/db/env.ts"

// Internal child of the CLI: suppress the application's diagnostic logger and
// return booleans only. No user/session/source rows are ever selected.
console.log = console.warn = console.error = () => {}
const db = resolveConfiguredDbEnv(process.env)
if (!db || !databaseIsSajtagent(db.connectionString)) process.exit(2)

// Node does not resolve Next's extensionless TS import. Resolve this one known
// import only; execute the same application Pool factory, SSL and env precedence.
const clientUrl = new URL("../lib/db/client.ts", import.meta.url).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./env" && context.parentURL === clientUrl) {
      return { url: new URL("../lib/db/env.ts", import.meta.url).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

let pool
let client
try {
  ;({ pool } = await import(clientUrl))
  if (!pool) throw new Error("missing_pool")
  client = await pool.connect()
  await client.query("BEGIN READ ONLY")
  await client.query("SET LOCAL statement_timeout = '5000ms'")
  const result = await client.query(`
    with tables as (
      select c.oid, c.relrowsecurity, c.relowner, c.relforcerowsecurity
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('next_preview_states', 'next_preview_access', 'next_publications_v2')
    )
    select
      (select count(*) = 3 and bool_and(relrowsecurity) from tables)
        and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'site_projects' and column_name = 'worker_sprite_id') as schema_ready,
      (select bool_and(has_table_privilege(current_user, oid, 'SELECT') and has_table_privilege(current_user, oid, 'INSERT')
        and has_table_privilege(current_user, oid, 'UPDATE') and has_table_privilege(current_user, oid, 'DELETE')
        and ((select rolbypassrls or rolsuper from pg_catalog.pg_roles where rolname = current_user)
          or (pg_has_role(current_user, relowner, 'USAGE') and not relforcerowsecurity))) from tables) as app_dml,
      has_schema_privilege(current_user, 'auth', 'USAGE')
        and has_column_privilege(current_user, 'auth.sessions', 'id', 'SELECT')
        and has_column_privilege(current_user, 'auth.sessions', 'user_id', 'SELECT')
        and has_column_privilege(current_user, 'auth.sessions', 'not_after', 'SELECT')
        and (select not c.relrowsecurity or (select rolbypassrls or rolsuper from pg_catalog.pg_roles where rolname = current_user)
          or (pg_has_role(current_user, c.relowner, 'USAGE') and not c.relforcerowsecurity)
          from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'auth' and c.relname = 'sessions') as session_read,
      (select bool_and(not has_table_privilege(role_name, oid, 'SELECT,INSERT,UPDATE,DELETE')
        and not has_any_column_privilege(role_name, oid, 'SELECT,INSERT,UPDATE'))
        from tables cross join (values ('anon'), ('authenticated')) roles(role_name))
        and (select bool_and(not has_any_column_privilege(role_name, 'auth.sessions', 'SELECT'))
          from (values ('anon'), ('authenticated')) roles(role_name)) as browser_closed
  `)
  const value = Object.fromEntries(["schema_ready", "app_dml", "session_read", "browser_closed"].map(key => [key, result.rows[0]?.[key] === true]))
  process.stdout.write(JSON.stringify(value))
  process.exitCode = inspectDatabaseResult(value).status === "pass" ? 0 : 2
} catch {
  process.exitCode = 2
} finally {
  if (client) {
    await client.query("ROLLBACK").catch(() => {})
    client.release(true)
  }
  await pool?.end().catch(() => {})
}
