/** Shared post-login destination. Keep password and magic-link exits aligned. */
export const LOGIN_SUCCESS_PATH = "/builder"

export function authCallbackRedirectPath(requestedNext: string | null | undefined): string {
  return requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : LOGIN_SUCCESS_PATH
}

export function magicLinkRedirectTo(origin: string): string {
  return `${origin}/auth/callback?next=${LOGIN_SUCCESS_PATH}`
}
