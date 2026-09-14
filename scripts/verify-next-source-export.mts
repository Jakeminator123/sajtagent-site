import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { registerHooks } from "node:module"
import { crc32 } from "node:zlib"
import type { Pool } from "pg"
import { createAcceptedNextSourceArchive, NextSourceExportError } from "../lib/siteagent/server/next-source-export.ts"
import { nextPreviewConfig, sourceRevisionId, type SourceFile } from "../lib/siteagent/server/next-preview-model.ts"
import { createSingleHtmlZipV1, createTextFilesZip } from "../lib/siteagent/server/version-archive.ts"

// Read both ZIP indexes and verify offsets/checksums with Node's independent CRC.
function unzip(input: Uint8Array): Map<string, string> {
  const zip = Buffer.from(input), end = zip.length - 22
  assert.equal(zip.readUInt32LE(end), 0x06054b50)
  const count = zip.readUInt16LE(end + 10), centralStart = zip.readUInt32LE(end + 16)
  let cursor = centralStart
  const entries = new Map<string, string>()
  for (let i = 0; i < count; i++) {
    assert.equal(zip.readUInt32LE(cursor), 0x02014b50)
    assert.equal(zip.readUInt16LE(cursor + 10), 0, "stored files need no decompression")
    const size = zip.readUInt32LE(cursor + 24), nameLength = zip.readUInt16LE(cursor + 28)
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8")
    const offset = zip.readUInt32LE(cursor + 42)
    assert.equal(zip.readUInt32LE(offset), 0x04034b50)
    assert.equal(zip.readUInt16LE(offset + 6), 0x0800)
    assert.equal(zip.readUInt32LE(offset + 22), size)
    assert.equal(zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"), name)
    const data = zip.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size)
    assert.equal(crc32(data), zip.readUInt32LE(cursor + 16))
    assert.equal(crc32(data), zip.readUInt32LE(offset + 14))
    assert.ok(offset + 30 + nameLength + size <= centralStart)
    assert.equal(entries.has(name), false)
    entries.set(name, data.toString("utf8"))
    cursor += 46 + nameLength
  }
  assert.equal(cursor, end)
  return entries
}

const principal = { userId: "00000000-0000-4000-8000-000000000001", tenantId: "tenant:a" }
const projectId = "project:a"
const files: SourceFile[] = [
  { path: "app/layout.tsx", content: 'import type { ReactNode } from "react"; export default function Layout({children}:{children:ReactNode}){return <html><body>{children}</body></html>}' },
  { path: "app/page.tsx", content: '"use client"; import {useState} from "react"; export default function Page(){const [n,setN]=useState(0);return <button onClick={()=>setN(n+1)}>Åk igen 🏔️ {n}</button>}' },
  { path: "package.json", content: '{"scripts":{"postinstall":"do-not-run"},"dependencies":{"next":"16.3.3"}}' },
]
const accepted = {
  tenantId: principal.tenantId, projectId, jobId: "job:accepted", sourceRevisionId: sourceRevisionId(principal.tenantId, projectId, files),
  acceptedAt: "2026-09-14T12:00:00.000Z", deploymentUrl: "https://private-artifact.example.test", files: [{ path: "index.html", content: "compiled output" }],
}
const intent = { sourceRevisionId: accepted.sourceRevisionId, jobId: accepted.jobId }
let row: { accepted: unknown; accepted_source_files: SourceFile[] | null } | null = { accepted, accepted_source_files: files }
let queries = 0
let changeAfterRead = false
const queryPool = {
  async query(sql: string, values: unknown[]) {
    queries++
    assert.match(sql, /select \(n\.state->'accepted'\) - 'files' - 'deploymentUrl' as accepted, n\.accepted_source_files/)
    assert.match(sql, /n\.project_id=p\.id and n\.tenant_id=p\.tenant_id and n\.owner_user_id=p\.owner_user_id/)
    assert.match(sql, /where p\.id=\$1 and p\.tenant_id=\$2 and p\.owner_user_id=\$3::uuid/)
    const owned = values[0] === projectId && values[1] === principal.tenantId && values[2] === principal.userId
    const rows = owned && row ? [structuredClone(row)] : []
    if (changeAfterRead) row = { accepted: { ...accepted, jobId: "job:newer" }, accepted_source_files: [{ ...files[0], content: "newer source" }, files[1]] }
    return { rows, rowCount: rows.length }
  },
}
const pool = queryPool as unknown as Pick<Pool, "query">
const errorIs = (code: string, status: number) => (error: unknown) => error instanceof NextSourceExportError && error.message === code && error.status === status
const archive = await createAcceptedNextSourceArchive(pool, principal, projectId, intent)
assert.equal(queries, 1, "receipt and source are fetched by one snapshot query")
assert.match(archive.fileName, /^sajtagent-next-[a-f0-9]{12}\.zip$/)
const entries = unzip(archive.bytes)
assert.equal(entries.get("app/page.tsx"), files[1].content)
assert.equal(entries.get("app/layout.tsx"), files[0].content)
assert.equal(entries.has("index.html"), false)
assert.ok(entries.has("README.md"))
const snapshot = JSON.parse(entries.get(".sajtagent/accepted-source.json")!)
assert.equal(snapshot.sourceRevisionId, intent.sourceRevisionId)
assert.equal(snapshot.jobId, intent.jobId)
assert.equal(sourceRevisionId(principal.tenantId, projectId, snapshot.files), intent.sourceRevisionId)
assert.deepEqual(snapshot.files, [...files].sort((a, b) => a.path.localeCompare(b.path)))
const pkg = JSON.parse(entries.get("package.json")!)
assert.deepEqual(pkg.dependencies, { next: "16.3.3", react: "19.2.3", "react-dom": "19.2.3" })
assert.deepEqual(pkg.devDependencies, { typescript: "5.7.3", "@types/react": "19.2.2", "@types/node": "22.19.1" })
assert.deepEqual(pkg.scripts, { dev: "next dev", build: "next build" })
assert.doesNotMatch(entries.get("next.config.mjs")!, /basePath|previewRef|SITEAGENT|https:/)
assert.match(entries.get("next.config.mjs")!, /"output": "export"/)
assert.doesNotMatch(Buffer.from(archive.bytes).toString(), /private-artifact\.example\.test|compiled output/)
assert.deepEqual((await createAcceptedNextSourceArchive(pool, principal, projectId, intent)).bytes, archive.bytes)

for (const [actor, project] of [
  [{ ...principal, userId: "00000000-0000-4000-8000-000000000002" }, projectId],
  [{ ...principal, tenantId: "tenant:b" }, projectId], [principal, "project:b"],
] as const) await assert.rejects(createAcceptedNextSourceArchive(pool, actor, project, intent), errorIs("source_not_found", 404))
await assert.rejects(createAcceptedNextSourceArchive(pool, principal, projectId, { ...intent, jobId: "job:stale" }), errorIs("accepted_revision_changed", 409))
await assert.rejects(createAcceptedNextSourceArchive(pool, principal, projectId, { ...intent, sourceRevisionId: `revision:sha256:${"a".repeat(64)}` }), errorIs("accepted_revision_changed", 409))
for (const empty of [null, { accepted: null, accepted_source_files: files }, { accepted, accepted_source_files: [] }]) {
  row = empty
  await assert.rejects(createAcceptedNextSourceArchive(pool, principal, projectId, intent), errorIs("source_not_found", 404))
}
row = { accepted: { ...accepted, tenantId: "tenant:b" }, accepted_source_files: files }
await assert.rejects(createAcceptedNextSourceArchive(pool, principal, projectId, intent), errorIs("source_not_found", 404))
row = { accepted, accepted_source_files: [files[0], { ...files[1], content: "wrong revision" }] }
await assert.rejects(createAcceptedNextSourceArchive(pool, principal, projectId, intent), errorIs("source_snapshot_invalid", 503))
row = { accepted, accepted_source_files: [files[0], { path: "../outside.tsx", content: "bad" }] }
await assert.rejects(createAcceptedNextSourceArchive(pool, principal, projectId, intent), errorIs("source_snapshot_invalid", 503))
row = { accepted, accepted_source_files: files }
const beforeRace = queries
changeAfterRead = true
assert.deepEqual((await createAcceptedNextSourceArchive(pool, principal, projectId, intent)).bytes, archive.bytes)
assert.equal(queries - beforeRace, 1, "a later commit cannot cause a second source lookup")
changeAfterRead = false

// Existing V1 output remains byte-for-byte identical after sharing the ZIP writer.
assert.equal(createHash("sha256").update(createSingleHtmlZipV1("<!doctype html><p>Hej åäö</p>", "2026-09-14T18:02:04.000Z")).digest("hex"), "85990d8e2a464578962235ebfdd2dec75c07db034406cd8ed803bd0e49a82c2b")
for (const path of ["../secret", "/root", "C:/secret", "a\\b", "a:stream", "a/CON.txt", "a/last.", "a//b"]) {
  assert.throws(() => createTextFilesZip([{ path, content: "bad" }], accepted.acceptedAt), /invalid_archive_path/)
}
assert.throws(() => createTextFilesZip([{ path: "a", content: "" }, { path: "A", content: "" }], accepted.acceptedAt), /invalid_archive_path/)
assert.throws(() => createTextFilesZip([{ path: "a", content: "" }, { path: "a/b", content: "" }], accepted.acceptedAt), /invalid_archive_path/)
assert.throws(() => createTextFilesZip([{ path: "a", content: "x".repeat(8_000_001) }], accepted.acceptedAt), /invalid_archive_size/)

// Exercise the real GET handler, substituting only verified identity and config/pool.
const fixtureUrl = `data:text/javascript,${encodeURIComponent(`
let state;
export function setState(next){state=next}
export async function resolveBuildPrincipalV1(){return state.principal}
export function nextPreviewConfig(){return state.config()}
export async function nextPreviewRepository(){return {pool:state.pool}}
`)}`
const fixture = await import(fixtureUrl) as { setState: (state: { principal: typeof principal | null; config: () => unknown; pool: typeof pool }) => void }
const hook = registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith("/next/download/route.ts") && /\/(principal|next-preview-service)\.ts$/.test(specifier)) return { url: fixtureUrl, shortCircuit: true }
  return nextResolve(specifier, context)
} })
try {
  const { GET } = await import("../app/api/siteagent/projects/[projectId]/next/download/route.ts")
  const url = new URL(`https://site.example.test/api/siteagent/projects/${projectId}/next/download`)
  url.searchParams.set("sourceRevisionId", intent.sourceRevisionId)
  url.searchParams.set("jobId", intent.jobId)
  const params = { params: Promise.resolve({ projectId }) }
  fixture.setState({ principal: null, config: () => ({}), pool })
  assert.equal((await GET(new Request(url), params)).status, 401)
  fixture.setState({ principal, config: () => nextPreviewConfig({}), pool })
  assert.equal((await GET(new Request(url), params)).status, 404)
  fixture.setState({ principal, config: () => ({}), pool })
  row = { accepted, accepted_source_files: files }
  const response = await GET(new Request(url), params)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("content-type"), "application/zip")
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0")
  assert.equal(response.headers.get("cdn-cache-control"), "no-store")
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin")
  assert.deepEqual(unzip(new Uint8Array(await response.arrayBuffer())), entries)
  url.searchParams.set("jobId", "job:stale")
  assert.equal((await GET(new Request(url), params)).status, 409)
  url.searchParams.delete("jobId")
  assert.equal((await GET(new Request(url), params)).status, 400)
  url.searchParams.append("jobId", intent.jobId)
  url.searchParams.append("jobId", "job:other")
  assert.equal((await GET(new Request(url), params)).status, 400)
} finally { hook.deregister() }

console.log("Next source export: owner/revision/snapshot checks, safe ZIP extraction, fixed Next scaffold and GET authorization passed (mock SQL/auth; no live DB/build)")
