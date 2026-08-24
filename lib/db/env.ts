/**
 * Connection-string-upplösning, speglad från sajtmaskins `src/lib/db/env.ts`
 * så att builder-v2 läser samma variabler i samma prioritetsordning.
 *
 * POSTGRES_URL* kommer från Vercels Supabase-integration. DATABASE_URL ligger
 * sist kvar som fallback för äldre lokala uppsättningar.
 */
export const DB_ENV_VARS = [
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "STORAGE_POSTGRES_URL",
  "STORAGE_POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
] as const;

type ResolveDbEnvOptions = {
  warnOnUninterpolated?: boolean;
};

function sanitizeDbEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const stripped = trimmed.slice(1, -1).trim();
    return stripped || undefined;
  }
  return trimmed;
}

function normalizeDbEnvUrl(
  value: string | undefined,
  varName?: string,
  options: ResolveDbEnvOptions = {},
): string | undefined {
  const sanitized = sanitizeDbEnvValue(value);
  if (!sanitized) return undefined;

  // En variabel som aldrig interpolerats ("${POSTGRES_URL}") är värdelös som
  // connection string och ska inte tas för en giltig konfiguration.
  const isUninterpolated =
    /^\$\{[A-Z0-9_]+\}$/.test(sanitized) || /^\$[A-Z0-9_]+$/.test(sanitized);
  if (isUninterpolated) {
    if (options.warnOnUninterpolated && varName) {
      console.warn(
        `[db/env] ${varName} innehåller en icke-interpolerad referens "${sanitized}". ` +
          "Den ignoreras. Sätt connection-stringen direkt eller använd POSTGRES_URL.",
      );
    }
    return undefined;
  }

  return sanitized;
}

export function resolveConfiguredDbEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: ResolveDbEnvOptions = {},
): {
  name: (typeof DB_ENV_VARS)[number];
  connectionString: string;
} | null {
  for (const name of DB_ENV_VARS) {
    const value = normalizeDbEnvUrl(env[name], name, options);
    if (value) {
      return { name, connectionString: value };
    }
  }
  return null;
}
