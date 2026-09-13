import { publicationDomain, publishedResponse } from "./next-publication-model.ts"

export async function handlePublishedGateway(request: Request): Promise<Response> {
  const domain = publicationDomain(process.env)
  const url = new URL(request.url)
  if (!domain) return new Response(null, { status: 404 })
  if (!url.hostname.endsWith(`.${domain}`) || !/^[a-f0-9]{32}$/.test(url.hostname.slice(0, -(domain.length + 1)))) return new Response(null, { status: 404 })
  if (url.pathname === "/__siteagent_publication_health" && ["HEAD", "GET"].includes(request.method)) {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store", "x-siteagent-publication-gateway": "v2" } })
  }
  try {
    const [{ pool }, { PostgresNextPublicationRepository }] = await Promise.all([
      import("../../db/client.ts"), import("./next-publication-repository.ts"),
    ])
    if (!pool) return new Response(null, { status: 503, headers: { "cache-control": "no-store" } })
    const publication = await new PostgresNextPublicationRepository(pool).getPublic(url.hostname, domain)
    if (!publication) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } })
    return publishedResponse(request, publication, url.pathname)
  } catch {
    return new Response(null, { status: 503, headers: { "cache-control": "no-store" } })
  }
}
