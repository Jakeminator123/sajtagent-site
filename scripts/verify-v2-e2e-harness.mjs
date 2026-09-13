import assert from "node:assert/strict"
import { fixtureFiles, requireCancelled, requireDenied, requiredEnvironment, safeOrigin, sourceDigest } from "./v2-e2e-support.mjs"

for (const status of [401, 403, 404]) assert.doesNotThrow(() => requireDenied(status, "denied"))
for (const status of [200, 201, 302, 307, 429, 500, 503]) assert.throws(() => requireDenied(status, "denied"))
const cancelled = { current: { jobId: "job-one", status: "failed", failureCode: "cancelled" } }
assert.doesNotThrow(() => requireCancelled({ cancelled: true }, cancelled, "job-one"))
assert.throws(() => requireCancelled({ cancelled: false }, cancelled, "job-one"))
assert.throws(() => requireCancelled({ cancelled: true }, cancelled, "other-job"))
assert.throws(() => requireCancelled({ cancelled: true },
  { current: { ...cancelled.current, failureCode: "build_or_verification_failed" } }, "job-one"))
assert.throws(() => requireCancelled({ cancelled: true },
  { current: { ...cancelled.current, status: "building" } }, "job-one"))
assert.throws(() => requiredEnvironment({}), /missing_environment/)
assert.throws(() => safeOrigin("https://secret@example.com"))
assert.throws(() => safeOrigin("https://example.com/private?token=secret"))
assert.throws(() => safeOrigin("http://example.com"))
assert.equal(safeOrigin("http://127.0.0.1:3000"), "http://127.0.0.1:3000")
const one = await fixtureFiles("ONE")
const two = await fixtureFiles("TWO")
assert.equal(one.length, 3)
assert.ok(!one.some((file) => /next\.config|lock/.test(file.path)))
assert.notEqual(sourceDigest(one), sourceDigest(two))
assert.equal(sourceDigest(one), sourceDigest([...one].reverse()))
assert.throws(() => requiredEnvironment({ V2_E2E_SITE_ORIGIN: "http://localhost:3000",
  V2_E2E_OWNER_EMAIL: "same@example.test", V2_E2E_OTHER_EMAIL: "SAME@example.test",
  V2_E2E_OWNER_PASSWORD: "test", V2_E2E_OTHER_PASSWORD: "test" }), /two_distinct_accounts/)
const pkg = JSON.parse(one.find((file) => file.path === "package.json").content)
const local = await fixtureFiles("ONE", true)
const lock = JSON.parse(local.find((file) => file.path === "package-lock.json").content)
assert.equal(pkg.dependencies.next, lock.packages[""].dependencies.next)
assert.equal(pkg.dependencies.next, lock.packages["node_modules/next"].version)
console.log("PASS harness-only tests: denial classification, redacted config, two-account requirement, real Next fixture/lock consistency. NOT a live E2E result.")
