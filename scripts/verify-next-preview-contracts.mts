import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"

import {
  DeploymentContractNameV2Schema,
  DeploymentContractSchemasV2,
  validateDeploymentWaveTransitionV2,
} from "../contracts/deployment-v2.ts"
import {
  PreviewAccessContractNameV2Schema,
  PreviewAccessContractSchemasV2,
  validatePreviewAccessDecisionV2,
} from "../contracts/preview-access-v2.ts"

const EXPECTED_MIRRORED_CONTRACT_DIGEST =
  "76e758a204196a86810927b9c43127ba69b9efc6483b62a52ad629c0b5391bfd"

const NextPreviewSchemaNameV2Schema = z.union([
  DeploymentContractNameV2Schema,
  PreviewAccessContractNameV2Schema,
])

const NextPreviewContractSchemasV2 = {
  ...DeploymentContractSchemasV2,
  ...PreviewAccessContractSchemasV2,
}

const FixtureManifestSchema = z
  .object({
    schemaCases: z.array(
      z
        .object({
          name: z.string().min(1),
          schema: NextPreviewSchemaNameV2Schema,
          expectValid: z.boolean(),
          value: z.unknown(),
        })
        .strict(),
    ),
    accessCases: z.array(
      z
        .object({
          name: z.string().min(1),
          expectValid: z.boolean(),
          access: z.unknown(),
          principal: z.unknown(),
          expectedDecision: z.unknown(),
        })
        .strict(),
    ),
    waveCases: z.array(
      z
        .object({
          name: z.string().min(1),
          expectValid: z.boolean(),
          previous: z.unknown(),
          next: z.unknown(),
        })
        .strict(),
    ),
  })
  .strict()

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const deploymentContractPath = resolve(
  scriptDirectory,
  "../contracts/deployment-v2.ts",
)
const accessContractPath = resolve(
  scriptDirectory,
  "../contracts/preview-access-v2.ts",
)
const fixturePath = resolve(
  scriptDirectory,
  "../contracts/fixtures/next-preview-v2.fixtures.json",
)

const deploymentSource = readFileSync(deploymentContractPath, "utf8")
const accessSource = readFileSync(accessContractPath, "utf8")
const fixtureSource = readFileSync(fixturePath, "utf8")
const fixtures = FixtureManifestSchema.parse(JSON.parse(fixtureSource))

const failures: string[] = []
let assertionCount = 0

for (const fixture of fixtures.schemaCases) {
  const result = NextPreviewContractSchemasV2[fixture.schema].safeParse(
    fixture.value,
  )
  assertionCount += 1
  if (result.success !== fixture.expectValid) {
    failures.push(
      `${fixture.name}: expected valid=${fixture.expectValid}, received valid=${result.success}`,
    )
  }
}

for (const fixture of fixtures.accessCases) {
  const result = validatePreviewAccessDecisionV2(
    fixture.access,
    fixture.principal,
    fixture.expectedDecision,
  )
  assertionCount += 1
  if (result.success !== fixture.expectValid) {
    failures.push(
      `${fixture.name}: expected valid=${fixture.expectValid}, received valid=${result.success}${result.success ? "" : ` (${result.error})`}`,
    )
  }
}

for (const fixture of fixtures.waveCases) {
  const result = validateDeploymentWaveTransitionV2(
    fixture.previous,
    fixture.next,
  )
  assertionCount += 1
  if (result.success !== fixture.expectValid) {
    failures.push(
      `${fixture.name}: expected valid=${fixture.expectValid}, received valid=${result.success}${result.success ? "" : ` (${result.error})`}`,
    )
  }
}

const digest = createHash("sha256")
  .update(deploymentSource)
  .update("\0")
  .update(accessSource)
  .update("\0")
  .update(fixtureSource)
  .digest("hex")
assertionCount += 1
if (digest !== EXPECTED_MIRRORED_CONTRACT_DIGEST) {
  failures.push(
    `mirrored contract digest: expected ${EXPECTED_MIRRORED_CONTRACT_DIGEST}, received ${digest}`,
  )
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL ${failure}`)
  }
  process.exitCode = 1
} else {
  console.log(`PASS next-preview contract v2: ${assertionCount} assertions`)
  console.log(`next-preview-v2-contract-fixture-sha256 ${digest}`)
}
