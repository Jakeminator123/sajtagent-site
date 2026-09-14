import assert from "node:assert/strict"

export class Pool {
  constructor(options) {
    // Confirm this is the application factory's configuration, including its
    // query cleanup, pool size, TLS handling and connection-string precedence.
    assert.equal(new URL(options.connectionString).searchParams.has("sslmode"), false)
    assert.equal(options.ssl.rejectUnauthorized, false)
    assert.equal(options.max, 3)
    assert.equal(options.keepAlive, true)
    this.statements = []
  }
  on() { return this }
  async connect() {
    console.error(process.env.SITEAGENT_NEXT_VERCEL_TOKEN)
    if (process.env.TEST_PREFLIGHT_DB_MODE === "error") throw new Error(process.env.POSTGRES_URL)
    return {
      query: async text => {
        this.statements.push(text)
        if (text.startsWith("BEGIN") || text.startsWith("SET LOCAL") || text === "ROLLBACK") return { rows: [] }
        assert.equal(this.statements[0], "BEGIN READ ONLY")
        assert.equal(this.statements[1], "SET LOCAL statement_timeout = '5000ms'")
        assert.ok(text.includes("has_column_privilege"))
        assert.ok(text.includes("rolbypassrls"))
        assert.ok(!/\b(?:INSERT INTO|UPDATE public|DELETE FROM)\b/i.test(text))
        return { rows: [{ schema_ready: true, app_dml: true, session_read: process.env.TEST_PREFLIGHT_DB_MODE !== "denied", browser_closed: true }] }
      },
      release: destroy => { assert.equal(destroy, true) },
    }
  }
  async end() {
    if (process.env.TEST_PREFLIGHT_DB_MODE !== "error") assert.equal(this.statements.at(-1), "ROLLBACK")
  }
}
