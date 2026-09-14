import type { Metadata } from "next"

import { LoginForm } from "./login-form"
import { authCallbackRedirectPath, type BuilderEntryParams } from "@/lib/supabase/auth-paths"

export const metadata: Metadata = {
  title: "Sajtagent — Logga in",
  description: "Logga in till Sajtagents Builder.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<BuilderEntryParams>
}) {
  const params = await searchParams
  const error = Array.isArray(params.error) ? params.error[0] : params.error
  return <LoginForm callbackFailed={error === "auth_callback_failed"} authUnavailable={error === "auth_unavailable"} returnTo={authCallbackRedirectPath(typeof params.next === "string" ? params.next : null)} />
}
