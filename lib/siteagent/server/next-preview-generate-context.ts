export const GENERATE_CONTEXT_BUDGET_V1 = 18_000

const PAGE_FILE = /^app\/(?:(.+)\/)?page\.(tsx|jsx|js)$/

export function routeFromGenerateSourcePath(path: string): string | null {
  const match = PAGE_FILE.exec(path)
  if (!match) return null
  return match[1] ? `/${match[1]}` : "/"
}

export function generateSourceFileMentionedInPrompt(prompt: string, path: string): boolean {
  const hay = prompt.toLowerCase()
  if (hay.includes(path.toLowerCase())) return true
  const route = routeFromGenerateSourcePath(path)
  if (route && route !== "/" && hay.includes(route)) return true
  return false
}

function layoutRank(path: string): number | null {
  if (path === "app/layout.tsx" || path === "app/layout.jsx" || path === "app/layout.js") return 1
  return null
}

function homeRank(path: string): number | null {
  if (path === "app/page.tsx" || path === "app/page.jsx" || path === "app/page.js") return 2
  return null
}

function fileRank(prompt: string, path: string): number {
  if (generateSourceFileMentionedInPrompt(prompt, path)) return 0
  const layout = layoutRank(path)
  if (layout != null) return layout
  const home = homeRank(path)
  if (home != null) return home
  if (routeFromGenerateSourcePath(path)) return 3
  return 4
}

/**
 * Keep every path, send only the file bodies that fit the Site generate budget.
 * Site merge restores omitted bodies. Do not raise GENERATE_CONTEXT_BUDGET_V1.
 */
export function packGenerateBaseFiles<T extends { path: string; content: string }>(
  prompt: string,
  files: readonly T[],
  budget = GENERATE_CONTEXT_BUDGET_V1,
): { files: T[]; retainedBasePaths: string[]; tooLarge: boolean } {
  const retainedBasePaths = [...new Set(files.map((file) => file.path))].sort()
  const ordered = [...files].sort((left, right) => {
    const rank = fileRank(prompt, left.path) - fileRank(prompt, right.path)
    if (rank !== 0) return rank
    return left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  })
  const packed: T[] = []
  for (const file of ordered) {
    const trial = [...packed, file]
    if (JSON.stringify([prompt, trial, retainedBasePaths]).length > budget) continue
    packed.push(file)
  }
  return {
    files: packed,
    retainedBasePaths,
    tooLarge: files.length > 0 && packed.length === 0,
  }
}
