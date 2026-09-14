import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { BuilderShell } from "@/components/siteagent/builder-shell"
import { builderEntryPath, loginPath, type BuilderEntryParams } from "@/lib/supabase/auth-paths"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { landingDraftFromParams } from "@/lib/siteagent/landing-draft"

export const metadata: Metadata = {
  title: "Sajtagent — Builder",
  description: "Bygg och förhandsgranska webbplatser i Sajtagents Builder.",
}

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<BuilderEntryParams>
}) {
  const params = await searchParams
  const supabase = await createSupabaseServerClient()
  const result = supabase ? await supabase.auth.getUser().catch(() => null) : null
  // Normal signed-out navigation never mounts the protected session/provider.
  // Project authorization remains in each existing API route.
  if (!result?.data.user || result.error) {
    const unavailable = !result || Boolean(result.error && result.error.name !== "AuthSessionMissingError" && (!result.error.status || result.error.status >= 500))
    redirect(loginPath(builderEntryPath(params), unavailable ? "auth_unavailable" : false))
  }
  const { project } = params
  const projectId = typeof project === "string" ? project : null
  return <BuilderShell key={projectId ?? "default"} initialProjectId={projectId} initialDraft={landingDraftFromParams(params)} />
}
