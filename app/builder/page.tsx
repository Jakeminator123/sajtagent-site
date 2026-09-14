import type { Metadata } from "next"

import { BuilderShell } from "@/components/siteagent/builder-shell"

export const metadata: Metadata = {
  title: "Sajtagent — Builder",
  description: "Bygg och förhandsgranska webbplatser i Sajtagents Builder.",
}

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>
}) {
  const { project } = await searchParams
  const projectId = typeof project === "string" ? project : null
  return <BuilderShell key={projectId ?? "default"} initialProjectId={projectId} />
}
