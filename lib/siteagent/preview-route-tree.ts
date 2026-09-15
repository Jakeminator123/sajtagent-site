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

/** Prefill the add field so a tree node can grow a child, including under `/`. */
export function draftRouteUnderParent(parentRoute: string): string {
  if (!parentRoute || parentRoute === "/") return "/"
  return parentRoute.endsWith("/") ? parentRoute : `${parentRoute}/`
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

export const SAJTAGENT_PREVIEW_ROUTE_MESSAGE_TYPE = "sajtagent.preview.route"

const ADD_HINT = /(?:lägg(?:a)?\s+till|skapa|add)\b/i
const PROMPT_ROUTE_TOKEN = /\/[a-z0-9]+(?:\/[a-z0-9]+)*/gi

/** Static export path → owner route. `/om/` and `/om` are the same page. */
export function previewRouteFromPathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/"
  return pathname.replace(/\/+$/, "") || "/"
}

/** Parent window only accepts a typed route from the preview origin. */
export function previewRouteFromFrameMessage(
  data: unknown,
  previewableRoutes: readonly string[],
): string | null {
  if (!data || typeof data !== "object") return null
  const record = data as { type?: unknown; route?: unknown }
  if (record.type !== SAJTAGENT_PREVIEW_ROUTE_MESSAGE_TYPE) return null
  if (typeof record.route !== "string") return null
  const route = previewRouteFromPathname(record.route)
  return previewableRoutes.includes(route) ? route : null
}

/** One explicit add-route in the prompt, so preview can open it after the turn. */
export function pendingPreviewRouteFromPrompt(message: string): string | null {
  if (!ADD_HINT.test(message)) return null
  const matches = message.toLowerCase().match(PROMPT_ROUTE_TOKEN)
  if (!matches || matches.length !== 1) return null
  const route = normalizeManualPageRouteInput(matches[0])
  return route && route !== "/" ? route : null
}

/** Address-bar path. Iframe and chrome may only open export-backed routes. */
export function previewChromeRoute(
  previewableRoutes: readonly string[],
  previewRoute: string,
): string {
  if (previewableRoutes.includes(previewRoute)) return previewRoute
  return previewableRoutes[0] ?? "/"
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
