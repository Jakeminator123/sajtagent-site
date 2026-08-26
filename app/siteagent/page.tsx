import type { Metadata } from "next"
import { BuilderShell } from "@/components/siteagent/builder-shell"

export const metadata: Metadata = {
  title: "Siteagent — AI-studio",
  description: "AI-driven webbplatsbyggare i canvas-läge",
}

export default function SiteagentPage() {
  return <BuilderShell />
}
