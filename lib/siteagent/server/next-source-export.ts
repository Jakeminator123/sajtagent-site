import type { Pool } from "pg"
import { z } from "zod"
import { SourceRevisionIdV2Schema } from "../../../contracts/deployment-v2.ts"
import type { BuildPrincipalV1 } from "./build-job-input.ts"
import { sourceRevisionId, validateSourceFiles, type SourceFile } from "./next-preview-model.ts"
import { exportPackageJsonFromSource } from "./next-preview-packages.ts"
import { createTextFilesZip } from "./version-archive.ts"

export const NextSourceExportRequestSchema = z.object({
  sourceRevisionId: SourceRevisionIdV2Schema,
  jobId: z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
}).strict()
type ExportRequest = z.infer<typeof NextSourceExportRequestSchema>
const acceptedSchema = NextSourceExportRequestSchema.extend({
  tenantId: z.string(), projectId: z.string(), acceptedAt: z.string().datetime({ offset: true }),
}).strip()

export class NextSourceExportError extends Error {
  readonly status: 404 | 409 | 503
  constructor(code: string, status: 404 | 409 | 503) {
    super(code)
    this.status = status
  }
}

const EXPORT_CONFIG = { output: "export", images: { unoptimized: true }, trailingSlash: true }
const EXPORT_README = `# Your Sajtagent Next.js source

Use Node.js 24 and npm 11. From the extracted project folder, run:

    npm install --ignore-scripts --no-audit --no-fund
    npm run dev

Open the localhost address printed by Next.js. For static output, run:

    npm run build

Serve the resulting out/ folder through a static web server, rather than opening
index.html directly from disk. This profile supports React client interactions
and static Next.js pages; it does not include a server backend or SSR.

The .tsx/CSS/assets are the accepted source. package.json is the same pinned
Next/React/TS set the worker installs, plus optional clsx or lucide-react when
the accepted source imports them, with dev/build scripts added.
next.config.mjs keeps static export, unoptimized images and trailing slashes; the
private preview basePath is omitted so this copy runs at your own site's root.
No credentials or Sajtagent deployment access are needed to run the source.

The exact original accepted file strings, revision and job are preserved in
.sajtagent/accepted-source.json. This includes the original package.json before
normalization. No installed dependencies or compiled preview files are bundled.
There is no worker lockfile, so transitive dependency resolution can change; this
export does not promise a byte-identical rebuild of the original deployment.
`

export async function createAcceptedNextSourceArchive(
  pool: Pick<Pool, "query">,
  principal: BuildPrincipalV1,
  projectId: string,
  requested: ExportRequest,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const intent = NextSourceExportRequestSchema.parse(requested)
  // One PostgreSQL statement sees one MVCC snapshot. Separate accepted/source
  // queries could join revision A's receipt to revision B's files during finish.
  // The owner-bound project join is authoritative even if an old state survives.
  const result = await pool.query<{ accepted: unknown; accepted_source_files: SourceFile[] | null }>(
    `select (n.state->'accepted') - 'files' - 'deploymentUrl' as accepted, n.accepted_source_files
     from public.site_projects p join public.next_preview_states n
       on n.project_id=p.id and n.tenant_id=p.tenant_id and n.owner_user_id=p.owner_user_id
     where p.id=$1 and p.tenant_id=$2 and p.owner_user_id=$3::uuid`,
    [projectId, principal.tenantId, principal.userId],
  )
  const row = result.rows[0]
  if (!row?.accepted || !row.accepted_source_files?.length) {
    throw new NextSourceExportError("source_not_found", 404)
  }
  const parsed = acceptedSchema.safeParse(row.accepted)
  if (!parsed.success) throw new NextSourceExportError("source_snapshot_invalid", 503)
  const accepted = parsed.data
  if (accepted.tenantId !== principal.tenantId || accepted.projectId !== projectId) {
    throw new NextSourceExportError("source_not_found", 404)
  }
  if (accepted.sourceRevisionId !== intent.sourceRevisionId || accepted.jobId !== intent.jobId) {
    throw new NextSourceExportError("accepted_revision_changed", 409)
  }
  let files: SourceFile[]
  try {
    files = validateSourceFiles(row.accepted_source_files)
    if (sourceRevisionId(principal.tenantId, projectId, files) !== accepted.sourceRevisionId) {
      throw new Error("source_digest_mismatch")
    }
  } catch {
    throw new NextSourceExportError("source_snapshot_invalid", 503)
  }

  const exported = files.filter(file => file.path !== "package.json" && file.path !== "next.config.mjs")
  exported.push(
    { path: "package.json", content: exportPackageJsonFromSource(files) },
    { path: "next.config.mjs", content: `export default ${JSON.stringify(EXPORT_CONFIG, null, 2)};\n` },
    { path: ".sajtagent/README.md", content: EXPORT_README },
    { path: ".sajtagent/accepted-source.json", content: `${JSON.stringify({ schemaVersion: 2, ...intent, files }, null, 2)}\n` },
  )
  if (!files.some(file => file.path.toLowerCase() === "readme.md")) {
    exported.push({ path: "README.md", content: EXPORT_README })
  }
  exported.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  try {
    return {
      bytes: createTextFilesZip(exported, accepted.acceptedAt),
      fileName: `sajtagent-next-${accepted.sourceRevisionId.slice(-64, -52)}.zip`,
    }
  } catch {
    throw new NextSourceExportError("source_archive_unavailable", 503)
  }
}
