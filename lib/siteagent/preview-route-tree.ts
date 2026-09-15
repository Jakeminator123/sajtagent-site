export type PreviewRouteNode = {
  route: string
  children: PreviewRouteNode[]
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

/** Nest accepted preview routes. Missing parents are not invented. */
export function buildPreviewRouteTree(routes: readonly string[]): PreviewRouteNode[] {
  const unique = [...new Set(routes)]
  const known = new Set(unique)
  const nodes = new Map<string, PreviewRouteNode>()
  for (const route of unique) {
    nodes.set(route, { route, children: [] })
  }

  const roots: PreviewRouteNode[] = []
  const ordered = [...unique].sort((left, right) => {
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
