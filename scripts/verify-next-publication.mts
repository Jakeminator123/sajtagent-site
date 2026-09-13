import assert from "node:assert/strict"
import { publicationBasePath, publicationDomain, publicationHost, publicationPath, publishedResponse, PublishNextRequestSchema } from "../lib/siteagent/server/next-publication-model.ts"

const domain = "published.example.test"
assert.notEqual(publicationHost("tenant-a", "project", domain), publicationHost("tenant-b", "project", domain))
assert.notEqual(publicationHost("tenant-a", "project", domain), publicationHost("tenant-a", "other", domain))
assert.throws(() => publicationHost("tenant", "project", "product.vercel.app"))
assert.equal(publicationDomain({ SITEAGENT_PUBLISHED_DOMAIN: domain, SITEAGENT_NEXT_PREVIEW_DOMAIN: "preview.example.test", SITEAGENT_SITE_ORIGIN: "https://app.example.test" }), domain)
for (const invalid of [domain, `nested.${domain}`]) {
  assert.equal(publicationDomain({ SITEAGENT_PUBLISHED_DOMAIN: domain, SITEAGENT_NEXT_PREVIEW_DOMAIN: invalid, SITEAGENT_SITE_ORIGIN: "https://app.example.test" }), null)
}
assert.equal(publicationDomain({ SITEAGENT_PUBLISHED_DOMAIN: domain, SITEAGENT_NEXT_PREVIEW_DOMAIN: "preview.example.test", SITEAGENT_SITE_ORIGIN: `https://app.${domain}` }), null)
assert.equal(PublishNextRequestSchema.safeParse({ sourceRevisionId: `revision:sha256:${"a".repeat(64)}`, jobId: "job-a", deploymentId: "client-choice" }).success, false)
for (const path of ["/../secret", "/%2e%2e/secret", "/%252e%252e/secret", "/.env", "/foo\\bar", "/%00", "//evil.test"]) assert.equal(publicationPath(path), null)
const publication = {
  tenantId: "tenant-a", projectId: "project-a", sourceRevisionId: `revision:sha256:${"a".repeat(64)}`,
  jobId: "job-a", deploymentId: "dpl-accepted", outputSha256: "b".repeat(64), publishedAt: new Date().toISOString(),
  previewRef: "preview:abcdefghijklmnopqrstuv",
  files: [{ path: "index.html", content: Buffer.from("<h1>Accepted revision</h1>").toString("base64"), encoding: "base64" as const },
    { path: "_next/static/app.js", content: Buffer.from("window.ready=true").toString("base64"), encoding: "base64" as const }],
}
const request = new Request("https://public.example.test/")
const base = publicationBasePath(publication.previewRef)
assert.equal(publishedResponse(request, publication, "/").headers.get("location"), `${base}/`)
const response = publishedResponse(request, publication, `${base}/`)
assert.equal(response.status, 200)
assert.equal(await response.text(), "<h1>Accepted revision</h1>")
assert.equal(response.headers.get("set-cookie"), null)
assert.equal(response.headers.get("cache-control"), "no-store")
assert.equal(publishedResponse(request, publication, "/api/siteagent/projects").status, 404)
assert.equal(publishedResponse(request, publication, `${base}/_next/static/app.js`).headers.get("content-type"), "application/javascript; charset=utf-8")
assert.equal(publishedResponse(new Request(request, { headers: { "service-worker": "script" } }), publication, `${base}/_next/static/app.js`).status, 403)
assert.equal(publishedResponse(new Request(request, { method: "POST" }), publication, "/").status, 405)
assert.equal(await publishedResponse(new Request(request, { method: "HEAD" }), publication, "/").text(), "")
console.log("Next publication: host isolation, strict publish intent, traversal denials, frozen static responses passed (not live deployment/E2E)")
