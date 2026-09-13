import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"

import {
  authorizeBindProjectWorkerV2,
  parseCreateProjectRequestV2,
  PROJECT_CONTRACT_VERSION_V2,
  ProjectContractNameV2Schema,
  ProjectContractSchemasV2,
  projectOwnerFromPrincipalV2,
  sameProjectOwnerV2,
} from "../contracts/project-v2.ts"
import { DeploymentOwnerV2Schema } from "../contracts/deployment-v2.ts"
import type { BuildPrincipalV1 } from "../lib/siteagent/server/build-job-input.ts"
import {
  MemoryPersonalProjectRepositoryV1,
  personalStarterIdsV1,
} from "../lib/siteagent/server/project-repository.ts"
import { MemoryProjectRepositoryV2 } from "../lib/siteagent/server/project-v2-repository.ts"

const EXPECTED_MIRRORED_CONTRACT_DIGEST =
  "fbd4f72978be02d95b6af0942afaec89ff971053d7c504856112f262026518eb"

const FixtureManifestSchema = z
  .object({
    schemaCases: z.array(
      z
        .object({
          name: z.string().min(1),
          schema: ProjectContractNameV2Schema,
          expectValid: z.boolean(),
          value: z.unknown(),
        })
        .strict(),
    ),
    createCases: z.array(
      z
        .object({
          name: z.string().min(1),
          expectValid: z.boolean(),
          value: z.unknown(),
        })
        .strict(),
    ),
    bindCases: z.array(
      z
        .object({
          name: z.string().min(1),
          expectValid: z.boolean(),
          principal: z.unknown(),
          project: z.unknown(),
          workerSpriteId: z.string(),
          occupiedBy: z.unknown(),
        })
        .strict(),
    ),
  })
  .strict()

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const contractPath = resolve(scriptDirectory, "../contracts/project-v2.ts")
const fixturePath = resolve(
  scriptDirectory,
  "../contracts/fixtures/project-v2.fixtures.json",
)
const listRoutePath = resolve(scriptDirectory, "../app/api/siteagent/projects/route.ts")
const openRoutePath = resolve(
  scriptDirectory,
  "../app/api/siteagent/projects/[projectId]/route.ts",
)
const defaultRoutePath = resolve(
  scriptDirectory,
  "../app/api/siteagent/projects/default/route.ts",
)
const resetRoutePath = resolve(
  scriptDirectory,
  "../app/api/siteagent/projects/default/reset/route.ts",
)

const contractSource = readFileSync(contractPath, "utf8")
const fixtureSource = readFileSync(fixturePath, "utf8")
const fixtures = FixtureManifestSchema.parse(JSON.parse(fixtureSource))
const listRouteSource = readFileSync(listRoutePath, "utf8")
const openRouteSource = readFileSync(openRoutePath, "utf8")
const defaultRouteSource = readFileSync(defaultRoutePath, "utf8")
const resetRouteSource = readFileSync(resetRoutePath, "utf8")

const failures: string[] = []
let assertionCount = 0

function fail(message: string): void {
  failures.push(message)
}

for (const fixture of fixtures.schemaCases) {
  const result = ProjectContractSchemasV2[fixture.schema].safeParse(fixture.value)
  assertionCount += 1
  if (result.success !== fixture.expectValid) {
    fail(
      `${fixture.name}: expected valid=${fixture.expectValid}, received valid=${result.success}`,
    )
  }
}

for (const fixture of fixtures.createCases) {
  const result = parseCreateProjectRequestV2(fixture.value)
  assertionCount += 1
  if (result.success !== fixture.expectValid) {
    fail(
      `${fixture.name}: expected valid=${fixture.expectValid}, received valid=${result.success}${result.success ? "" : ` (${result.error})`}`,
    )
  }
}

for (const fixture of fixtures.bindCases) {
  const occupiedBy = fixture.occupiedBy === null
    ? null
    : fixture.occupiedBy
  const result = authorizeBindProjectWorkerV2({
    principal: fixture.principal as never,
    project: fixture.project as never,
    workerSpriteId: fixture.workerSpriteId,
    occupiedBy: occupiedBy as never,
  })
  assertionCount += 1
  if (result.success !== fixture.expectValid) {
    fail(
      `${fixture.name}: expected valid=${fixture.expectValid}, received valid=${result.success}${result.success ? "" : ` (${result.error})`}`,
    )
  }
}

const principal: BuildPrincipalV1 = {
  userId: "11111111-1111-4111-8111-111111111111",
  tenantId: "personal:11111111-1111-4111-8111-111111111111",
}
const otherPrincipal: BuildPrincipalV1 = {
  userId: "22222222-2222-4222-8222-222222222222",
  tenantId: "personal:22222222-2222-4222-8222-222222222222",
}

const owner = projectOwnerFromPrincipalV2(
  { tenantId: principal.tenantId, principalId: principal.userId },
  "project:one",
)
assertionCount += 1
if (!DeploymentOwnerV2Schema.safeParse(owner).success) {
  fail("project owner must satisfy DeploymentOwnerV2")
}
assertionCount += 1
if (
  !sameProjectOwnerV2(owner, {
    tenantId: principal.tenantId,
    projectId: "project:one",
    principalId: principal.userId,
  })
) {
  fail("project owner must stay tenant+project+principal")
}

const repository = new MemoryProjectRepositoryV2()
const created = await repository.createProject(principal, {
  schemaVersion: PROJECT_CONTRACT_VERSION_V2,
  name: "Bakery",
})
const listed = await repository.listProjects(principal)
const opened = await repository.openProject(principal, created.projectId)
assertionCount += 1
if (listed.length !== 1 || listed[0]?.projectId !== created.projectId) {
  fail("list must return only the signed-in principal projects")
}
assertionCount += 1
if (opened?.projectId !== created.projectId || opened.workerSpriteId !== null) {
  fail("open must return the owned unbound project")
}
assertionCount += 1
if ((await repository.listProjects(otherPrincipal)).length !== 0) {
  fail("other principal must not list someone else's project")
}
assertionCount += 1
if ((await repository.openProject(otherPrincipal, created.projectId)) !== null) {
  fail("other principal must not open someone else's project")
}

const otherProject = await repository.createProject(otherPrincipal, {
  schemaVersion: PROJECT_CONTRACT_VERSION_V2,
})
assertionCount += 1
if (otherProject.owner.principalId !== otherPrincipal.userId) {
  fail("create must bind owner.principalId to the signed-in user")
}

await assert.rejects(
  repository.createProject(principal, {
    schemaVersion: PROJECT_CONTRACT_VERSION_V2,
    workerSpriteId: "sprite:stolen",
  } as never),
  /worker_sprite_id_client_forbidden/,
)
assertionCount += 1

const bound = await repository.bindProjectWorker(
  principal,
  created.projectId,
  "sprite:owner-one",
)
assertionCount += 1
if (bound.workerSpriteId !== "sprite:owner-one") {
  fail("server bind must set workerSpriteId for the owner")
}
await assert.rejects(
  repository.bindProjectWorker(otherPrincipal, created.projectId, "sprite:owner-two"),
  /project_ownership_conflict/,
)
assertionCount += 1
await assert.rejects(
  repository.bindProjectWorker(principal, otherProject.projectId, "sprite:owner-one"),
  /project_ownership_conflict/,
)
assertionCount += 1
const secondOwned = await repository.createProject(principal, {
  schemaVersion: PROJECT_CONTRACT_VERSION_V2,
  name: "Andra",
})
await assert.rejects(
  repository.bindProjectWorker(principal, secondOwned.projectId, "sprite:owner-one"),
  /worker_bound_to_other_project|worker_owned_by_other_principal/,
)
assertionCount += 1

const starterRepository = new MemoryPersonalProjectRepositoryV1()
const starter = await starterRepository.ensurePersonalStarterProject(principal)
assert.deepEqual(starter, personalStarterIdsV1(principal.userId))
assert.deepEqual(
  await starterRepository.resetPersonalStarterProject(principal),
  personalStarterIdsV1(principal.userId),
)
assertionCount += 2

assertionCount += 1
if (!listRouteSource.includes("parseCreateProjectRequestV2")) {
  fail("create route must parse the V2 client contract")
}
assertionCount += 1
if (!listRouteSource.includes("listProjects") || !listRouteSource.includes("createProject")) {
  fail("projects route must list and create for the authenticated principal")
}
assertionCount += 1
if (
  listRouteSource.includes("bindProjectWorker") ||
  openRouteSource.includes("bindProjectWorker")
) {
  fail("HTTP project routes must not expose worker bind")
}
assertionCount += 1
if (
  !defaultRouteSource.includes("ensurePersonalStarterProject") ||
  !resetRouteSource.includes("resetPersonalStarterProject")
) {
  fail("personal starter and reset routes must stay in place")
}
assertionCount += 1
if (
  /workerSpriteId\s*:/.test(listRouteSource) ||
  /workerSpriteId\s*:/.test(openRouteSource)
) {
  fail("HTTP handlers must not assign workerSpriteId from the client")
}

const digest = createHash("sha256")
  .update(contractSource)
  .update("\0")
  .update(fixtureSource)
  .digest("hex")
assertionCount += 1
if (digest !== EXPECTED_MIRRORED_CONTRACT_DIGEST) {
  fail(
    `mirrored contract digest: expected ${EXPECTED_MIRRORED_CONTRACT_DIGEST}, received ${digest}`,
  )
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL ${failure}`)
  }
  process.exitCode = 1
} else {
  console.log(`PASS project contract v2: ${assertionCount} assertions`)
  console.log(`project-v2-contract-fixture-sha256 ${digest}`)
}
