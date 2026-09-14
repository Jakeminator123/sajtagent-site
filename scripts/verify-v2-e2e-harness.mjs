import assert from "node:assert/strict"
import { fixtureFiles, requireCancelled, requireDenied, requiredEnvironment, safeOrigin, sourceDigest,
  publicationSettings, expectedPublicationUrl, publishIntent, requirePublishedBinding, requirePublicLocation } from "./v2-e2e-support.mjs"

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

const siteOrigin = "https://sajtagent-site.vercel.app"
const previewDomain = "preview.sajtagent.se"
assert.equal(publicationSettings("sites.sajtagent.se", siteOrigin, previewDomain), "sites.sajtagent.se")
for (const domain of [undefined, "", "*.sites.sajtagent.se", "https://sites.sajtagent.se", "sites.vercel.app",
  previewDomain, "child.preview.sajtagent.se", "sajtagent.se"]) {
  assert.throws(() => publicationSettings(domain, siteOrigin, previewDomain))
}
assert.throws(() => publicationSettings("sites.sajtagent.se", "https://sites.sajtagent.se", previewDomain))
assert.throws(() => publicationSettings("sites.sajtagent.se", "https://customer.sites.sajtagent.se", previewDomain))
const project = { projectId: "project-one", owner: { tenantId: "tenant-one" } }
const publicUrl = expectedPublicationUrl(project, "sites.sajtagent.se")
assert.match(publicUrl, /^https:\/\/[a-f0-9]{32}\.sites\.sajtagent\.se\/$/)
assert.notEqual(expectedPublicationUrl({ ...project, projectId: "project-two" }, "sites.sajtagent.se"), publicUrl)
assert.notEqual(expectedPublicationUrl({ ...project, owner: { tenantId: "tenant-two" } }, "sites.sajtagent.se"), publicUrl)
assert.throws(() => expectedPublicationUrl({}, "sites.sajtagent.se"))
const firstState = { accepted: { sourceRevisionId: "revision-one", jobId: "job-one", previewRef: "preview:one" } }
assert.deepEqual(publishIntent(firstState), { sourceRevisionId: "revision-one", jobId: "job-one" })
assert.throws(() => publishIntent({ accepted: null }))
const published = { ...publishIntent(firstState), publishedAt: "2026-09-14T13:00:00.000Z", url: publicUrl }
const firstIdentity = requirePublishedBinding(published, firstState, publicUrl)
assert.equal(requirePublishedBinding({ ...published }, firstState, publicUrl), firstIdentity)
for (const override of [{ sourceRevisionId: "stale-revision" }, { jobId: "stale-job" },
  { url: `${publicUrl}?grant=must-not-be-public` }, { url: "https://sajtagent-site.vercel.app/login" },
  { publishedAt: null }, { publishedAt: "invalid" }]) {
  assert.throws(() => requirePublishedBinding({ ...published, ...override }, firstState, publicUrl))
}
// A matching GET on the old revision still must not hide changed timestamp or
// accidental auto-publication; compare the entire pinned identity.
assert.notEqual(requirePublishedBinding({ ...published, publishedAt: "2026-09-14T13:00:01.000Z" }, firstState, publicUrl), firstIdentity)
const latestState = { accepted: { sourceRevisionId: "revision-two", jobId: "job-two", previewRef: "preview:two" } }
assert.throws(() => requirePublishedBinding(published, latestState, publicUrl))
assert.notEqual(requirePublishedBinding({ ...published, ...publishIntent(latestState) }, latestState, publicUrl), firstIdentity)
const goodLocation = `${publicUrl}api/siteagent/next-previews/preview%3Aone/content/`
assert.doesNotThrow(() => requirePublicLocation(goodLocation, publicUrl, firstState.accepted.previewRef))
for (const location of [publicUrl, `${goodLocation}?token=private`, `${goodLocation}#private`,
  goodLocation.replace("preview%3Aone", "preview%3Atwo"), goodLocation.replace("sites.sajtagent.se", "preview.sajtagent.se"),
  "https://vercel.com/login", "not a URL"]) {
  assert.throws(() => requirePublicLocation(location, publicUrl, firstState.accepted.previewRef))
}
console.log("PASS harness-only tests: denial classification, redacted config, two-account requirement, fixture/lock consistency, exact publication bindings, pinned identity and public redirect scope. NOT a live E2E result.")
