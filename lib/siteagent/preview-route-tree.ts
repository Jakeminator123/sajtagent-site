export type PreviewRouteNode = {
  route: string
  children: PreviewRouteNode[]
  virtual?: boolean
}

function ancestorRoutes(route: string): string[] {
  if (route === "/") return []
  const parts = route.split("/").filter(Boolean)
  const ancestors = ["/"]
  for (let length = 1; length < parts.length; length += 1) {
    ancestors.push(`/${parts.slice(0, length).join("/")}`)
  }
  return ancestors
}

function nearestExistingAncestor(route: string, routes: ReadonlySet<string>): string | null {
  if (route === "/") return null
  const parts = route.split("/").filter(Boolean)
  for (let length = parts.length - 1; length >= 1; length -= 1) {
    const candidate = `/${parts.slice(0, length).join("/")}`
    if (routes.has(candidate)) return candidate
  }
  return routes.has("/") ? "/" : null
}

/** Nest page routes. Missing parents become virtual group nodes. */
export function buildPreviewRouteTree(routes: readonly string[]): PreviewRouteNode[] {
  const unique = [...new Set(routes)]
  const known = new Set(unique)
  const virtual = new Set<string>()
  for (const route of unique) {
    for (const ancestor of ancestorRoutes(route)) {
      if (!known.has(ancestor)) {
        known.add(ancestor)
        virtual.add(ancestor)
      }
    }
  }
  const nodes = new Map<string, PreviewRouteNode>()
  for (const route of known) {
    nodes.set(route, virtual.has(route) ? { route, children: [], virtual: true } : { route, children: [] })
  }

  const roots: PreviewRouteNode[] = []
  const ordered = [...known].sort((left, right) => {
    if (left === "/") return -1
    if (right === "/") return 1
    return left < right ? -1 : left > right ? 1 : 0
  })

  for (const route of ordered) {
    const node = nodes.get(route)
    if (!node) continue
    const parent = nearestExistingAncestor(route, known)
    if (parent) {
      nodes.get(parent)?.children.push(node)
      continue
    }
    roots.push(node)
  }

  return roots
}

export function previewRouteLabel(route: string): string {
  if (route === "/") return "/"
  return route.slice(route.lastIndexOf("/") + 1)
}

/** Browser add-form input → `/slug`. Lowercase, one leading slash, no trailing slash. */
export function normalizeManualPageRouteInput(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return ""
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  const collapsed = withSlash.replace(/\/+/g, "/")
  if (collapsed !== "/" && collapsed.endsWith("/")) return collapsed.replace(/\/+$/g, "")
  return collapsed
}

/** After add/remove/generate, keep the current page or open the new one. */
export function nextPreviewRouteAfterChange(input: {
  previousRoutes: readonly string[]
  nextRoutes: readonly string[]
  currentRoute: string
  pendingRoute?: string | null
}): string {
  const next = input.nextRoutes
  if (next.length === 0) return "/"
  if (input.pendingRoute && next.includes(input.pendingRoute)) return input.pendingRoute
  const added = next.filter(
    (route) => route !== "/" && !input.previousRoutes.includes(route),
  )
  if (input.previousRoutes.length > 0 && added.length > 0) return added[0] ?? "/"
  if (next.includes(input.currentRoute)) return input.currentRoute
  return next[0] ?? "/"
}
