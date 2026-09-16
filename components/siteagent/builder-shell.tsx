"use client"

// Skalet för /builder: provider + toppbar + kortscen (preview i bakgrunden,
// fem nedvikbara kort ovanpå). Layouten (nedvikta kort, storlekar, skala)
// sparas via use-layout-prefs. Toppbarens "Versioner" togglar Versioner-kortet.

import React from "react"
import { BuilderProvider } from "./builder-store"
import { BuilderHeader } from "./builder-header"
import { CubeStage } from "./cube-stage"
import { useLayoutPrefs } from "./use-layout-prefs"
import type { LandingDraft } from "@/lib/siteagent/landing-draft"

export function BuilderShell({ initialProjectId = null, initialDraft = null }: { initialProjectId?: string | null; initialDraft?: LandingDraft | null }) {
  const layout = useLayoutPrefs()

  return (
    <BuilderProvider key={initialProjectId ?? "default"} initialProjectId={initialProjectId} initialDraft={initialDraft}>
      <div className="h-screen flex flex-col bg-workflow-bg transition-colors duration-200">
        <BuilderHeader
          showDrawer={!layout.docked.has("versions")}
          onToggleDrawer={() => layout.toggleFace("versions")}
        />
        <main className="flex-1 flex min-h-0">
          <CubeStage
            docked={layout.docked}
            onToggle={layout.toggleFace}
            sizes={layout.sizes}
            resizeFace={layout.resizeFace}
            scaleFace={layout.scaleFace}
            resetFace={layout.resetFace}
            offsets={layout.offsets}
            moveFace={layout.moveFace}
            dockScale={layout.dockScale}
            setDockScale={layout.setDockScale}
            setStageSize={layout.setStageSize}
            resetLayout={layout.resetLayout}
          />
        </main>
      </div>
    </BuilderProvider>
  )
}
