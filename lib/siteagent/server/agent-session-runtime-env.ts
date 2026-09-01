import "server-only"

import {
  SignedAgentSessionRuntimeClientV1,
  resolveAgentSessionRuntimeConfigurationV1,
} from "./agent-session-runtime-client.ts"

export function createAgentSessionRuntimeClientV1(
  env: NodeJS.ProcessEnv = process.env,
): SignedAgentSessionRuntimeClientV1 | null {
  const configuration = resolveAgentSessionRuntimeConfigurationV1(env)
  return configuration
    ? new SignedAgentSessionRuntimeClientV1(
        configuration.baseUrl,
        configuration.signingKey,
      )
    : null
}
