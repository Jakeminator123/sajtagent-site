import { z } from "zod"
import { SourceRevisionIdV2Schema } from "../../../contracts/deployment-v2.ts"
import {
  NEXT_SOURCE_PATH_MAX,
  validateSourceFiles,
  type NextState,
  type SourceFile,
} from "./next-preview-model.ts"

const PAGE_SEGMENT = "[a-z0-9-]{1,40}"
const PAGE_ROUTE_BODY = `(?:${PAGE_SEGMENT}(?:\\/${PAGE_SEGMENT})*)`
export const NEXT_PAGE_ROUTE_PATTERN = new RegExp(`^\\/(?:${PAGE_ROUTE_BODY})?$`)
const PAGE_FILE_PATTERN = new RegExp(`^app\\/(?:(${PAGE_ROUTE_BODY})\\/)?page\\.(tsx|jsx|js)$`)
const CONTROLLER_OWNED_SOURCE_PATH = /(^|\/)(next\.config\.[^/]+|package(-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|\.npmrc)$/
const HOME_PAGE_PATHS = new Set(["app/page.tsx", "app/page.jsx", "app/page.js"])
const ADD_VERB = /(?:lägg\s+till|skapa|add)\b/i
const REMOVE_VERB = /(?:ta\s+bort|radera|släng|remove|delete)/i
const RESERVED_ADD_SLUGS = new Set(["start", "hem", "home", "index", "startsida"])

function lastMatchIndex(pattern: RegExp, text: string): number {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)
  let last = -1
  for (const match of text.matchAll(global)) {
    if (match.index !== undefined) last = match.index
  }
  return last
}

function nearestPageVerb(prompt: string, index: number): "add" | "remove" | null {
  const before = prompt.slice(Math.max(0, index - 80), index)
  const addAt = lastMatchIndex(ADD_VERB, before)
  const removeAt = lastMatchIndex(REMOVE_VERB, before)
  if (addAt < 0 && removeAt < 0) return null
  return addAt >= removeAt ? "add" : "remove"
}

export const NextPageMutationRequestSchema = z.object({
  op: z.enum(["add", "remove"]),
  route: z.string().min(1).max(200),
  jobId: z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
  sourceRevisionId: SourceRevisionIdV2Schema,
}).strict()

export type NextPageMutationRequest = z.infer<typeof NextPageMutationRequestSchema>
export type NextPageOp = NextPageMutationRequest["op"]

export function isControllerOwnedSourcePath(path: string): boolean {
  return CONTROLLER_OWNED_SOURCE_PATH.test(path)
}

export function isHomePagePath(path: string): boolean {
  return HOME_PAGE_PATHS.has(path)
}

export function parseManualPageRoute(route: string): string {
  if (!NEXT_PAGE_ROUTE_PATTERN.test(route)) throw new Error("invalid_page_route")
  if (route !== "/" && (route.includes("//") || route.endsWith("/") || route.split("/").includes("_next"))) {
    throw new Error("invalid_page_route")
  }
  const path = pagePathForRoute(route)
  if (path.length > NEXT_SOURCE_PATH_MAX || path.split("/").includes("_next")) throw new Error("invalid_page_route")
  return route
}

export function pagePathForRoute(route: string): string {
  return route === "/" ? "app/page.tsx" : `app${route}/page.tsx`
}

export function sourcePathToPageRoute(path: string): string | null {
  const match = PAGE_FILE_PATTERN.exec(path)
  if (!match) return null
  return match[1] ? `/${match[1]}` : "/"
}

export function pageHeading(route: string): string {
  if (route === "/") return "Hem"
  const last = route.slice(1).split("/").at(-1) ?? "Sida"
  return last.charAt(0).toUpperCase() + last.slice(1)
}

export function composeNextPageStub(route: string): string {
  const heading = pageHeading(parseManualPageRoute(route))
  return `'use client'\n\nexport default function Page() {\n  return (\n    <main>\n      <h1>${heading}</h1>\n    </main>\n  )\n}\n`
}

export function nextPageIdempotencyKey(projectId: string, op: NextPageOp, route: string, jobId: string): string {
  return `pages:${projectId}:${op}:${route}:${jobId}`
}

function pagesByRoute(files: readonly SourceFile[]): Map<string, SourceFile[]> {
  const pages = new Map<string, SourceFile[]>()
  for (const file of files) {
    const route = sourcePathToPageRoute(file.path)
    if (!route) continue
    const list = pages.get(route) ?? []
    list.push(file)
    pages.set(route, list)
  }
  return pages
}

function bindNamedPage(name: string, pages: Map<string, SourceFile[]>): string | null {
  const slug = name.toLowerCase()
  if (!slug || slug === "/" || !new RegExp(`^${PAGE_SEGMENT}$`).test(slug)) return null
  const exact = `/${slug}`
  if (pages.has(exact) && exact !== "/") return exact
  const matches = [...pages.keys()].filter(route => route !== "/" && route.slice(1).split("/").at(-1) === slug)
  return matches.length === 1 ? matches[0] : null
}

function clauseHasRemoveVerb(prompt: string, index: number): boolean {
  return nearestPageVerb(prompt, index) === "remove"
}

function clauseHasAddVerb(prompt: string, index: number): boolean {
  return nearestPageVerb(prompt, index) === "add"
}

function explicitAddRoute(token: string): string | null {
  const route = token.startsWith("/") ? token.toLowerCase() : `/${token.toLowerCase()}`
  if (route === "/") return null
  const slug = route.slice(1).split("/").at(-1) ?? ""
  if (RESERVED_ADD_SLUGS.has(slug)) return null
  try {
    return parseManualPageRoute(route)
  } catch {
    return null
  }
}

/** Fail-closed: only explicit `/route` or a unique `sidan`-bind. Never `/`. */
export function classifyExplicitPageAdds(prompt: string, baseFiles: readonly SourceFile[]): string[] {
  if (!ADD_VERB.test(prompt)) return []
  const pages = pagesByRoute(baseFiles)
  const routes = new Set<string>()

  for (const match of prompt.matchAll(new RegExp(`\\/${PAGE_ROUTE_BODY}`, "gi"))) {
    if (match.index === undefined || !clauseHasAddVerb(prompt, match.index)) continue
    const route = explicitAddRoute(match[0])
    if (route && !pages.has(route)) routes.add(route)
  }

  for (const match of prompt.matchAll(new RegExp(`\\b(${PAGE_SEGMENT})-?sidan?\\b`, "gi"))) {
    if (match.index === undefined || !clauseHasAddVerb(prompt, match.index)) continue
    const route = explicitAddRoute(match[1])
    if (route && !pages.has(route)) routes.add(route)
  }

  for (const match of prompt.matchAll(new RegExp(`sidan\\s+(\\/?${PAGE_SEGMENT})\\b`, "gi"))) {
    if (match.index === undefined || !clauseHasAddVerb(prompt, match.index)) continue
    const route = explicitAddRoute(match[1])
    if (route && !pages.has(route)) routes.add(route)
  }

  return [...routes].map(pagePathForRoute).sort()
}

/** Fail-closed: only exact, uniquely bound page paths. Never `/`. */
export function classifyExplicitPageRemoves(prompt: string, baseFiles: readonly SourceFile[]): string[] {
  if (!REMOVE_VERB.test(prompt)) return []
  const pages = pagesByRoute(baseFiles)
  const routes = new Set<string>()

  for (const match of prompt.matchAll(new RegExp(`\\/${PAGE_ROUTE_BODY}`, "gi"))) {
    if (match.index === undefined || !clauseHasRemoveVerb(prompt, match.index)) continue
    const route = match[0].toLowerCase()
    if (route !== "/" && pages.has(route)) routes.add(route)
  }

  for (const match of prompt.matchAll(new RegExp(`\\b(${PAGE_SEGMENT})-?sidan\\b`, "gi"))) {
    if (match.index === undefined || !clauseHasRemoveVerb(prompt, match.index)) continue
    const bound = bindNamedPage(match[1], pages)
    if (bound) routes.add(bound)
  }

  for (const match of prompt.matchAll(new RegExp(`sidan\\s+(\\/?${PAGE_SEGMENT})\\b`, "gi"))) {
    if (match.index === undefined || !clauseHasRemoveVerb(prompt, match.index)) continue
    const token = match[1].toLowerCase()
    const bound = token.startsWith("/")
      ? (pages.has(token) && token !== "/" ? token : null)
      : bindNamedPage(token, pages)
    if (bound) routes.add(bound)
  }

  const paths = new Set<string>()
  for (const route of routes) {
    if (route === "/") continue
    for (const file of pages.get(route) ?? []) {
      if (!isHomePagePath(file.path)) paths.add(file.path)
    }
  }
  return [...paths].sort()
}

export function readOmittedBasePaths(value: unknown): string[] {
  if (!value || typeof value !== "object" || !("omittedBasePaths" in value)) return []
  const raw = (value as { omittedBasePaths: unknown }).omittedBasePaths
  if (!Array.isArray(raw)) return []
  return raw.filter((path): path is string => typeof path === "string" && path.length > 0 && path.length <= NEXT_SOURCE_PATH_MAX)
}

function omittedSourcePaths(baseFiles: readonly SourceFile[], generatedFiles: readonly SourceFile[], reported: readonly string[]): Set<string> {
  const generated = new Set(generatedFiles.map(file => file.path))
  const omitted = new Set<string>()
  for (const path of reported) {
    if (!generated.has(path) && !isControllerOwnedSourcePath(path)) omitted.add(path)
  }
  for (const file of baseFiles) {
    if (!generated.has(file.path) && !isControllerOwnedSourcePath(file.path)) omitted.add(file.path)
  }
  return omitted
}

export function mergeGeneratedSourceFiles(input: {
  baseFiles: readonly SourceFile[]
  generatedFiles: readonly SourceFile[]
  omittedBasePaths?: readonly string[]
  prompt: string
}): SourceFile[] {
  const generatedByPath = new Map(input.generatedFiles.map(file => [file.path, file] as const))
  const baseByPath = new Map(input.baseFiles.map(file => [file.path, file] as const))
  const explicitRemoves = new Set(classifyExplicitPageRemoves(input.prompt, input.baseFiles))
  const explicitAdds = new Set(classifyExplicitPageAdds(input.prompt, input.baseFiles))
  const omitted = omittedSourcePaths(input.baseFiles, input.generatedFiles, input.omittedBasePaths ?? [])

  const merged = new Map(generatedByPath)
  for (const path of omitted) {
    if (explicitRemoves.has(path)) continue
    const base = baseByPath.get(path)
    if (base) merged.set(path, base)
  }
  for (const path of explicitRemoves) merged.delete(path)
  for (const path of explicitAdds) {
    if (explicitRemoves.has(path) || merged.has(path)) continue
    const route = sourcePathToPageRoute(path)
    if (route) merged.set(path, { path, content: composeNextPageStub(route) })
  }

  const generatedHasHome = [...merged.keys()].some(isHomePagePath)
  if (!generatedHasHome) {
    const home = input.baseFiles.find(file => isHomePagePath(file.path))
    if (home) merged.set(home.path, home)
  }

  return validateSourceFiles([...merged.values()])
}

export function planNextPageMutation(input: {
  state: NextState | null
  sourceFiles: SourceFile[] | null
  op: NextPageOp
  route: string
  jobId: string
  sourceRevisionId: string
}): { files: SourceFile[]; rebuild: boolean; idempotencyKey: string } {
  if (!input.state) throw new Error("project_not_found")
  const accepted = input.state.accepted
  if (!accepted || !input.sourceFiles?.length) throw new Error("accepted_source_not_found")
  if (accepted.jobId !== input.jobId || accepted.sourceRevisionId !== input.sourceRevisionId) {
    throw new Error("accepted_revision_changed")
  }
  if (input.state.current?.status === "building" && Date.parse(input.state.current.expiresAt) > Date.now()) {
    throw new Error("project_busy")
  }
  const route = parseManualPageRoute(input.route)
  if (input.op === "remove" && route === "/") throw new Error("home_page_reserved")
  const files = validateSourceFiles(input.sourceFiles)
  const pages = pagesByRoute(files)
  const existing = pages.get(route) ?? []
  const idempotencyKey = nextPageIdempotencyKey(accepted.projectId, input.op, route, accepted.jobId)

  if (input.op === "add") {
    if (existing.length > 0) return { files, rebuild: false, idempotencyKey }
    const path = pagePathForRoute(route)
    return {
      files: validateSourceFiles([...files, { path, content: composeNextPageStub(route) }]),
      rebuild: true,
      idempotencyKey,
    }
  }

  if (existing.length === 0) return { files, rebuild: false, idempotencyKey }
  const remove = new Set(existing.map(file => file.path))
  return {
    files: validateSourceFiles(files.filter(file => !remove.has(file.path))),
    rebuild: true,
    idempotencyKey,
  }
}

export async function executeNextPageMutation(input: {
  state: NextState | null
  sourceFiles: SourceFile[] | null
  request: NextPageMutationRequest
  build: (files: SourceFile[], expectedAcceptedJobId: string | null) => Promise<NextState | null>
}): Promise<NextState | null> {
  const planned = planNextPageMutation({
    state: input.state,
    sourceFiles: input.sourceFiles,
    ...input.request,
  })
  if (!planned.rebuild) return input.state
  return input.build(planned.files, input.state?.accepted?.jobId ?? null)
}
