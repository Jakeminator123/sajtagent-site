import type { Metadata } from "next"
import { BuilderShell } from "@/components/builder-v2/builder-shell"

export const metadata: Metadata = {
  title: "Sajtmaskin — Builder v2",
  description: "AI-driven webbplatsbyggare i canvas-läge",
}

export default function BuilderPage() {
  return <BuilderShell />
}
