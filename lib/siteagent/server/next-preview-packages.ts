import type { SourceFile } from "./next-preview-model.ts"

/**
 * Pins must match `sajtagent-sprites/src/next-packages-v2.ts`. Site rewrites
 * package.json after merge so restored pages keep the imports they already have.
 */
export const NEXT_BASE_DEPENDENCIES = {
  next: "16.3.3",
  react: "19.2.3",
  "react-dom": "19.2.3",
} as const

export const NEXT_BASE_DEV_DEPENDENCIES = {
  typescript: "5.7.3",
  "@types/react": "19.2.2",
  "@types/node": "22.19.1",
} as const

export const NEXT_OPTIONAL_PACKAGES = {
  clsx: "2.1.1",
  "lucide-react": "1.45.0",
} as const

const SOURCE_SCAN_EXTENSION = /\.(?:c|m)?[jt]sx?$|\.css$/i
const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
const SPECIFIER = /(?:from\s+|import\s*\(|require\s*\(|@import\s+(?:url\(\s*)?)\s*['"]([^'"]+)['"]/g

function pinnedAllowlist(): Record<string, string> {
  return {
    ...NEXT_BASE_DEPENDENCIES,
    ...NEXT_BASE_DEV_DEPENDENCIES,
    ...NEXT_OPTIONAL_PACKAGES,
  }
}

export function packageNameFromSpecifier(specifier: string): { kind: "skip" } | { kind: "package"; name: string } {
  const spec = specifier.trim()
  if (!spec) return { kind: "skip" }
  if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("#") || spec.startsWith("@/")) {
    return { kind: "skip" }
  }
  if (spec.startsWith("node:")) return { kind: "skip" }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(spec)) return { kind: "package", name: spec }
  if (spec.startsWith("@")) {
    const parts = spec.split("/")
    if (parts.length < 2 || parts[0] === "@" || !parts[1]) return { kind: "skip" }
    const name = `${parts[0]}/${parts[1]}`
    return NPM_NAME.test(name) ? { kind: "package", name } : { kind: "skip" }
  }
  const name = spec.split("/")[0] || ""
  return NPM_NAME.test(name) ? { kind: "package", name } : { kind: "skip" }
}

export function scanAcceptedSourcePackages(
  files: readonly SourceFile[],
): { ok: true; optional: string[] } | { ok: false; code: "unsupported_package" } {
  const selected = new Set<string>()
  const base = new Set(Object.keys({ ...NEXT_BASE_DEPENDENCIES, ...NEXT_BASE_DEV_DEPENDENCIES }))
  for (const file of files) {
    if (file.path === "package.json" || !SOURCE_SCAN_EXTENSION.test(file.path)) continue
    SPECIFIER.lastIndex = 0
    for (const match of file.content.matchAll(SPECIFIER)) {
      const resolved = packageNameFromSpecifier(match[1] ?? "")
      if (resolved.kind === "skip") continue
      if (base.has(resolved.name)) continue
      if (Object.hasOwn(NEXT_OPTIONAL_PACKAGES, resolved.name)) {
        selected.add(resolved.name)
        continue
      }
      return { ok: false, code: "unsupported_package" }
    }
  }
  return { ok: true, optional: [...selected].sort() }
}

export function compileAcceptedPackageManifest(optionalNames: readonly string[]): {
  private: true
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
} {
  const dependencies: Record<string, string> = { ...NEXT_BASE_DEPENDENCIES }
  for (const name of [...optionalNames].sort()) {
    if (!Object.hasOwn(NEXT_OPTIONAL_PACKAGES, name)) throw new Error("unsupported_package")
    dependencies[name] = NEXT_OPTIONAL_PACKAGES[name as keyof typeof NEXT_OPTIONAL_PACKAGES]
  }
  return {
    private: true,
    dependencies,
    devDependencies: { ...NEXT_BASE_DEV_DEPENDENCIES },
  }
}

export function compileAcceptedPackageJson(
  optionalNames: readonly string[],
  scripts?: Record<string, string>,
): string {
  return `${JSON.stringify(
    scripts
      ? { ...compileAcceptedPackageManifest(optionalNames), scripts }
      : compileAcceptedPackageManifest(optionalNames),
    null,
    2,
  )}\n`
}

/** After Site merge/nav, rewrite package.json from the files that will actually build. */
export function applyAcceptedPackageManifest(files: readonly SourceFile[]): SourceFile[] {
  const scanned = scanAcceptedSourcePackages(files)
  if (!scanned.ok) throw new Error(scanned.code)
  const byPath = new Map(files.map((file) => [file.path, file] as const))
  byPath.set("package.json", {
    path: "package.json",
    content: compileAcceptedPackageJson(scanned.optional),
  })
  return [...byPath.values()]
}

export function exportPackageJsonFromSource(files: readonly SourceFile[]): string {
  const scanned = scanAcceptedSourcePackages(files)
  if (!scanned.ok) throw new Error(scanned.code)
  return compileAcceptedPackageJson(scanned.optional, { dev: "next dev", build: "next build" })
}

export function isPinnedAllowedPackage(name: string, version: string): boolean {
  return pinnedAllowlist()[name] === version
}
