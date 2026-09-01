import { z } from "zod"

import { BuilderIntentV1Schema } from "../../../contracts/builder-v1.ts"

const IdentifierV1Schema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)

export const CreateBuildJobRequestV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: IdentifierV1Schema,
    baseRevisionId: IdentifierV1Schema,
    idempotencyKey: IdentifierV1Schema,
    intent: BuilderIntentV1Schema,
  })
  .strict()

export type CreateBuildJobRequestV1 = z.infer<typeof CreateBuildJobRequestV1Schema>

export const BuildPrincipalV1Schema = z
  .object({
    userId: z.string().uuid(),
    tenantId: IdentifierV1Schema,
  })
  .strict()

export type BuildPrincipalV1 = z.infer<typeof BuildPrincipalV1Schema>
