"use client"

// Skalet för /siteagent: provider + toppbar + kortscen (preview i bakgrunden,
// sex nedvikbara kort ovanpå). Layouten (nedvikta kort, storlekar, skala)
// sparas via use-layout-prefs. Toppbarens "Versioner" togglar Versioner-kortet.

import React from "react"
import { BuilderProvider } from "./builder-store"
import { BuilderHeader } from "./builder-header"
import { CubeStage } from "./cube-stage"
import { useLayoutPrefs } from "./use-layout-prefs"
import { LandingPromptHandoff } from "./landing-prompt-handoff"

export function BuilderShell() {
  const layout = useLayoutPrefs()

  return (
    <BuilderProvider>
      <LandingPromptHandoff />
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
            resetLayout={layout.resetLayout}
          />
        </main>
      </div>
    </BuilderProvider>
  )
}
