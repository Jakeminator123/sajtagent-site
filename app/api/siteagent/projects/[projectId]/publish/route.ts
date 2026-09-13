import { resolveBuildPrincipalV1 } from "../../../../../../lib/siteagent/server/principal.ts"
import { isSameOriginMutation, readBoundedJsonV1 } from "../../../../../../lib/siteagent/server/request-security.ts"
import { publicationDomain, publicationGatewayReachable, publicationHost, PublishNextRequestSchema } from "../../../../../../lib/siteagent/server/next-publication-model.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "private, no-store", "cdn-cache-control": "no-store", "vercel-cdn-cache-control": "no-store" } })

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) return json(401, { error: "unauthenticated" })
  try {
    const { projectId } = await params
    const [{ pool }, { PostgresNextPublicationRepository }] = await Promise.all([
      import("../../../../../../lib/db/client.ts"), import("../../../../../../lib/siteagent/server/next-publication-repository.ts"),
    ])
    if (!pool) return json(503, { error: "persistence_unavailable" })
    const owned = await pool.query(`select id from public.site_projects where id=$1 and tenant_id=$2 and owner_user_id=$3::uuid`, [projectId, principal.tenantId, principal.userId])
    if (!owned.rowCount) return json(404, { error: "project_not_found" })
    const domain = publicationDomain(process.env)
    if (!domain) return json(200, { configured: false, published: null })
    const value = await new PostgresNextPublicationRepository(pool).getOwned(principal, projectId)
    return json(200, { configured: true, published: value ? {
      sourceRevisionId: value.sourceRevisionId, jobId: value.jobId, publishedAt: value.publishedAt,
      url: `https://${publicationHost(principal.tenantId, projectId, domain)}/`,
    } : null })
  } catch { return json(503, { error: "publication_unavailable" }) }
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) return json(401, { error: "unauthenticated" })
  if (!isSameOriginMutation(request)) return json(403, { error: "origin_denied" })
  const domain = publicationDomain(process.env)
  if (!domain) return json(503, { error: "publication_unconfigured" })
  let intent: unknown
  try { intent = PublishNextRequestSchema.parse(await readBoundedJsonV1(request, 2048)) }
  catch { return json(400, { error: "invalid_publish_request" }) }
  try {
    const { projectId } = await params
    const [{ pool }, { PostgresNextPublicationRepository }] = await Promise.all([
      import("../../../../../../lib/db/client.ts"),
      import("../../../../../../lib/siteagent/server/next-publication-repository.ts"),
    ])
    if (!pool) return json(503, { error: "persistence_unavailable" })
    const owned = await pool.query(`select id from public.site_projects where id=$1 and tenant_id=$2 and owner_user_id=$3::uuid`, [projectId, principal.tenantId, principal.userId])
    if (!owned.rowCount) return json(404, { error: "project_not_found" })
    if (!await publicationGatewayReachable(publicationHost(principal.tenantId, projectId, domain))) return json(503, { error: "publication_gateway_unavailable" })
    const published = await new PostgresNextPublicationRepository(pool).publish(principal, projectId, intent, domain)
    return json(200, { schemaVersion: 2, published: {
      projectId, sourceRevisionId: published.sourceRevisionId, jobId: published.jobId,
      publishedAt: published.publishedAt, url: `https://${publicationHost(principal.tenantId, projectId, domain)}/`,
    } })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    if (code === "project_not_found") return json(404, { error: code })
    if (["accepted_revision_missing", "accepted_revision_changed"].includes(code)) return json(409, { error: code })
    return json(503, { error: "publication_failed" })
  }
}
