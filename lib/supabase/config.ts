export type SupabasePublicConfig = {
  url: string
  publishableKey: string
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1"
  } catch {
    return false
  }
}

/** Public Supabase settings only. Secret and service-role keys are never read here. */
export function getSupabasePublicConfig(
  env: NodeJS.ProcessEnv = process.env,
): SupabasePublicConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !publishableKey || !validHttpUrl(url)) return null
  return { url, publishableKey }
}
