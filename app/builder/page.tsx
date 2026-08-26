import type { Metadata } from "next"

import { BuilderShell } from "@/components/siteagent/builder-shell"

export const metadata: Metadata = {
  title: "SiteAgent — Builder",
  description: "Bygg och förhandsgranska webbplatser i SiteAgents Builder.",
}

export default function BuilderPage() {
  return <BuilderShell />
}
