/** Shared post-login destination. Keep password and magic-link exits aligned. */
export const LOGIN_SUCCESS_PATH = "/builder"

export type BuilderEntryParams = Record<string, string | string[] | undefined>

export function builderEntryPath(params: BuilderEntryParams): string {
  const query = new URLSearchParams()
  for (const key of ["project", "prompt", "mode"] as const) {
    const value = params[key]
    if (typeof value === "string" && value.trim()) query.set(key, value)
  }
  return query.size ? `${LOGIN_SUCCESS_PATH}?${query}` : LOGIN_SUCCESS_PATH
}

/** Only the Builder is a login destination. Query text is data, never a URL. */
export function authCallbackRedirectPath(requestedNext: string | null | undefined): string {
  if (!requestedNext) return LOGIN_SUCCESS_PATH
  const path = requestedNext.split(/[?#]/, 1)[0]
  // Exact matching also rejects encoded separators, backslashes, dot segments,
  // protocol-relative URLs and control characters before URL normalization.
  if (path !== LOGIN_SUCCESS_PATH) return LOGIN_SUCCESS_PATH
  const url = new URL(requestedNext, "https://sajtagent.invalid")
  return builderEntryPath(Object.fromEntries(url.searchParams))
}

export function loginPath(requestedNext?: string | null, failure: boolean | "auth_unavailable" = false): string {
  const query = new URLSearchParams({ next: authCallbackRedirectPath(requestedNext) })
  if (failure) query.set("error", failure === "auth_unavailable" ? failure : "auth_callback_failed")
  return `/login?${query}`
}

export function magicLinkRedirectTo(origin: string, requestedNext?: string): string {
  const url = new URL("/auth/callback", origin)
  url.searchParams.set("next", authCallbackRedirectPath(requestedNext))
  return url.href
}
