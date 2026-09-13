import type { Metadata } from "next"

import { BuilderShell } from "@/components/siteagent/builder-shell"

export const metadata: Metadata = {
  title: "Sajtagent — Builder",
  description: "Bygg och förhandsgranska webbplatser i Sajtagents Builder.",
}

export default function BuilderPage() {
  return <BuilderShell />
}
