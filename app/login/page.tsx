import type { Metadata } from "next"

import { LoginForm } from "./login-form"

export const metadata: Metadata = {
  title: "Sajtagent — Logga in",
  description: "Logga in till Sajtagents Builder.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const error = Array.isArray(params.error) ? params.error[0] : params.error
  return <LoginForm callbackFailed={error === "auth_callback_failed"} />
}
