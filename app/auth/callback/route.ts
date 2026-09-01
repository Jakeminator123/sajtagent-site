import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "../../../lib/supabase/server"

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const requestedNext = requestUrl.searchParams.get("next")
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/builder"

  if (code) {
    const supabase = await createSupabaseServerClient()
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) return NextResponse.redirect(new URL(next, requestUrl.origin))
    }
  }

  const loginUrl = new URL("/login", requestUrl.origin)
  loginUrl.searchParams.set("error", "auth_callback_failed")
  return NextResponse.redirect(loginUrl)
}
