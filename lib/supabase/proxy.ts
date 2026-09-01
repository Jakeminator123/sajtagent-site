import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { getSupabasePublicConfig } from "./config"

export async function refreshSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const config = getSupabasePublicConfig()
  const continueRequest = () =>
    NextResponse.next({
      request: { headers: request.headers },
    })
  if (!config) return continueRequest()

  let response = continueRequest()
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = continueRequest()
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // getClaims validates the token and refreshes it when required. Public pages
  // stay readable if the auth service is temporarily unreachable; protected
  // Route Handlers still resolve no principal and fail closed.
  try {
    await supabase.auth.getClaims()
  } catch {
    return response
  }
  return response
}
