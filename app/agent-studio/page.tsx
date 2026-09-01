import type { Metadata } from "next"

import { AgentStudio } from "@/components/agent-studio/agent-studio"

export const metadata: Metadata = {
  title: "SiteAgent — Agent Studio",
  description:
    "Forma Sajtagentens själ, instruktioner och önskade verktyg innan profilen kopplas till en privat runtime.",
}

export default function AgentStudioPage() {
  return <AgentStudio />
}
