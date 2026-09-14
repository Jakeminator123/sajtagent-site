import { NextResponse } from "next/server"

import { authCallbackRedirectPath, loginPath } from "../../../lib/supabase/auth-paths"
import { createSupabaseServerClient } from "../../../lib/supabase/server"

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const next = authCallbackRedirectPath(requestUrl.searchParams.get("next"))

  if (code) {
    const supabase = await createSupabaseServerClient()
    if (supabase) {
      const result = await supabase.auth.exchangeCodeForSession(code).catch(() => null)
      if (result && !result.error) return NextResponse.redirect(new URL(next, requestUrl.origin))
    }
  }

  return NextResponse.redirect(new URL(loginPath(next, true), requestUrl.origin))
}
