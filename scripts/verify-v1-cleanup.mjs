import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8")
}

function filesUnder(relativePath) {
  const absolutePath = resolve(root, relativePath)
  if (!existsSync(absolutePath)) return []
  return readdirSync(absolutePath, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
}

for (const legacyDirectory of [
  "components/workflow",
  "app/api/ai/generate",
  "app/api/execute",
  "app/api/github",
  "app/api/memory",
  "app/api/workflows",
]) {
  assert.deepEqual(
    filesUnder(legacyDirectory),
    [],
    `${legacyDirectory} must remain absent from the V1 surface`,
  )
}

for (const legacyFile of [
  "lib/workflow-types.ts",
  "lib/node-styles.ts",
  "scripts/001-create-workflow-tables.sql",
  "drizzle.config.ts",
  "lib/db/index.ts",
  "lib/db/schema.ts",
]) {
  assert.equal(
    existsSync(resolve(root, legacyFile)),
    false,
    `${legacyFile} must remain absent from the V1 surface`,
  )
}

const transcribeSource = source("app/api/ai/transcribe/route.ts")
const originGuardIndex = transcribeSource.indexOf("if (!isSameOriginMutation(request))")
const principalGuardIndex = transcribeSource.indexOf(
  "const principal = await resolveBuildPrincipalV1(request)",
)
const formDataIndex = transcribeSource.indexOf("await request.formData()")
const providerIndex = transcribeSource.indexOf("await transcribe({")

assert.ok(originGuardIndex >= 0, "transcribe must reject cross-origin mutations")
assert.ok(principalGuardIndex >= 0, "transcribe must resolve a verified Site principal")
assert.ok(principalGuardIndex > originGuardIndex, "origin must be checked before authentication")
assert.ok(formDataIndex > principalGuardIndex, "auth must run before parsing the upload")
assert.ok(providerIndex > principalGuardIndex, "auth must run before the provider call")
assert.match(transcribeSource, /const MAX_BYTES = 20 \* 1024 \* 1024/)
assert.match(transcribeSource, /file\.size > MAX_BYTES/)
assert.match(transcribeSource, /\{ error: "Transkribering misslyckades" \}/)
assert.doesNotMatch(
  transcribeSource,
  /error\.message|error instanceof Error/,
  "transcribe failures must not expose provider details",
)

const browserTranscriptionSource = source("lib/use-audio-transcription.ts")
assert.match(browserTranscriptionSource, /fetch\(['"]\/api\/ai\/transcribe['"]/)
assert.doesNotMatch(
  browserTranscriptionSource,
  /experimental_transcribe|openai\/whisper|generateText/,
  "browser transcription must call only the Site route",
)

const dbClientSource = source("lib/db/client.ts")
assert.match(dbClientSource, /import \{ Pool \} from "pg"/)
assert.match(dbClientSource, /export const dbConfigured = Boolean\(connectionString\)/)
assert.match(dbClientSource, /export \{ pool \}/)
assert.doesNotMatch(dbClientSource, /drizzle|\.\/schema/)

const packageJson = JSON.parse(source("package.json"))
for (const packageName of ["drizzle-orm", "drizzle-kit", "dotenv"]) {
  assert.equal(packageJson.dependencies?.[packageName], undefined)
  assert.equal(packageJson.devDependencies?.[packageName], undefined)
}
for (const scriptName of ["db:generate", "db:push", "db:studio"]) {
  assert.equal(packageJson.scripts?.[scriptName], undefined)
}

const packageLockSource = source("package-lock.json")
assert.doesNotMatch(
  packageLockSource,
  /node_modules\/(?:drizzle-orm|drizzle-kit|dotenv)"/,
  "the lockfile must not retain the removed direct database tooling",
)

console.log("V1 cleanup boundary: PASS (legacy absent, transcribe guarded, pg.Pool only)")
