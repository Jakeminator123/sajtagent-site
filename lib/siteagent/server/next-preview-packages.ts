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

function isIdentChar(c: string | undefined): boolean {
  return c !== undefined && /[A-Za-z0-9_$]/.test(c)
}

/** Same import walk as `sajtagent-sprites/src/next-packages-v2.ts`. */
function collectBareSpecifiers(source: string, css: boolean): string[] {
  const specifiers: string[] = []
  const n = source.length
  let i = 0

  const readString = (quote: string): string | undefined => {
    i++
    let value = ""
    while (i < n) {
      const c = source[i]
      if (c === "\\") {
        i += 2
        return undefined
      }
      if (c === quote) {
        i++
        return value
      }
      if (c === "\n" && quote !== "`") return undefined
      value += c
      i++
    }
    return undefined
  }

  const skipLineComment = () => {
    while (i < n && source[i] !== "\n") i++
  }

  const skipBlockComment = () => {
    i += 2
    while (i + 1 < n && !(source[i] === "*" && source[i + 1] === "/")) i++
    if (i + 1 < n) i += 2
  }

  const skipTemplate = () => {
    i++
    while (i < n) {
      const c = source[i]
      if (c === "\\") { i += 2; continue }
      if (c === "`") { i++; return }
      if (c === "$" && source[i + 1] === "{") {
        i += 2
        skipTemplateExpression()
        continue
      }
      i++
    }
  }

  const skipTemplateExpression = () => {
    let depth = 1
    while (i < n && depth > 0) {
      const c = source[i]
      if (c === "/" && source[i + 1] === "/") { skipLineComment(); continue }
      if (c === "/" && source[i + 1] === "*") { skipBlockComment(); continue }
      if (c === "'" || c === "\"") { readString(c); continue }
      if (c === "`") { skipTemplate(); continue }
      if (c === "{") depth++
      else if (c === "}") {
        depth--
        if (depth === 0) { i++; return }
      }
      i++
    }
  }

  const skipSpace = () => {
    while (i < n && /[ \t\r\n]/.test(source[i]!)) i++
  }

  const atKeyword = (word: string) => {
    if (source.startsWith(word, i) && !isIdentChar(source[i + word.length]) && !isIdentChar(source[i - 1])) {
      i += word.length
      return true
    }
    return false
  }

  const takeSpecifier = (value: string | undefined) => {
    if (value) specifiers.push(value)
  }

  const parseFromSpecifier = (limit: number) => {
    let depth = 0
    while (i < n && i < limit) {
      const c = source[i]
      if (c === "/" && source[i + 1] === "/") { skipLineComment(); continue }
      if (c === "/" && source[i + 1] === "*") { skipBlockComment(); continue }
      if (c === "'" || c === "\"") { readString(c); continue }
      if (c === "`") { skipTemplate(); continue }
      if (c === "{") { depth++; i++; continue }
      if (c === "}") { if (depth) depth--; i++; continue }
      if (depth === 0 && c === ";") return
      if (depth === 0 && (c === "'" || c === "\"")) return
      if (depth === 0 && atKeyword("from")) {
        skipSpace()
        if (source[i] === "'" || source[i] === "\"") takeSpecifier(readString(source[i]!))
        return
      }
      if (depth === 0 && (atKeyword("function") || atKeyword("class") || atKeyword("const") || atKeyword("let") || atKeyword("var"))) return
      i++
    }
  }

  while (i < n) {
    const c = source[i]
    if (c === "/" && source[i + 1] === "/") { skipLineComment(); continue }
    if (c === "/" && source[i + 1] === "*") { skipBlockComment(); continue }
    if (c === "'" || c === "\"") { readString(c); continue }
    if (!css && c === "`") { skipTemplate(); continue }
    if (css && c === "@" && /(^|[\n;])[ \t]*$/.test(source.slice(Math.max(0, i - 24), i)) && source.startsWith("@import", i)) {
      i += 7
      skipSpace()
      if (source.startsWith("url(", i)) {
        i += 4
        skipSpace()
      }
      if (source[i] === "'" || source[i] === "\"") takeSpecifier(readString(source[i]!))
      continue
    }
    if (!css && (source[i] === "i" || source[i] === "e" || source[i] === "r")) {
      const statementStart = (() => {
        let j = i - 1
        while (j >= 0 && (source[j] === " " || source[j] === "\t")) j--
        return j < 0 || source[j] === "\n" || source[j] === "\r" || source[j] === ";"
      })()
      if (statementStart && atKeyword("import")) {
        skipSpace()
        if (source.startsWith("type", i) && !isIdentChar(source[i + 4]) && (source[i + 4] === " " || source[i + 4] === "\t" || source[i + 4] === "{")) {
          i += 4
          skipSpace()
        }
        if (source[i] === "'" || source[i] === "\"") takeSpecifier(readString(source[i]!))
        else if (source[i] === "(") {
          i++
          skipSpace()
          if (source[i] === "'" || source[i] === "\"") takeSpecifier(readString(source[i]!))
        } else if (source[i] !== ".") parseFromSpecifier(i + 2000)
        continue
      }
      if (statementStart && atKeyword("export")) {
        parseFromSpecifier(i + 2000)
        continue
      }
      if (atKeyword("require")) {
        skipSpace()
        if (source[i] === "(") {
          i++
          skipSpace()
          if (source[i] === "'" || source[i] === "\"") takeSpecifier(readString(source[i]!))
        }
        continue
      }
      if (!statementStart && atKeyword("import")) {
        skipSpace()
        if (source[i] === "(") {
          i++
          skipSpace()
          if (source[i] === "'" || source[i] === "\"") takeSpecifier(readString(source[i]!))
        }
        continue
      }
    }
    i++
  }
  return specifiers
}

export function scanAcceptedSourcePackages(
  files: readonly SourceFile[],
): { ok: true; optional: string[] } | { ok: false; code: "unsupported_package" } {
  const selected = new Set<string>()
  const base = new Set(Object.keys({ ...NEXT_BASE_DEPENDENCIES, ...NEXT_BASE_DEV_DEPENDENCIES }))
  for (const file of files) {
    if (file.path === "package.json" || !SOURCE_SCAN_EXTENSION.test(file.path)) continue
    const css = file.path.toLowerCase().endsWith(".css")
    for (const specifier of collectBareSpecifiers(file.content, css)) {
      const resolved = packageNameFromSpecifier(specifier)
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
