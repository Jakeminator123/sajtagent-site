"use client"

// Layoutinställningar för Siteagent — vilka kort som är nedvikta,
// kortens storlekar och kortlekens skala. Sparas i localStorage så att
// användarens setup överlever omladdning. "Återställ layout" nollställer allt.

import { useCallback, useEffect, useRef, useState } from "react"
import { FACES, type FaceId } from "./faces/face-defs"

const STORAGE_KEY = "siteagent:layout:v3"

export interface FaceSize {
  w: number
  h: number
}

export const SIZE_LIMITS = { minW: 260, maxW: 680, minH: 180, maxH: 820 }

// V1 öppnar Byggval och OpenClaw-chatten sida vid sida. Övriga kort kan
// plockas upp från kortleken när användaren behöver dem.
const DEFAULT_DOCKED: FaceId[] = ["versions", "blocks", "map", "agent"]

function defaultSizes(): Record<FaceId, FaceSize> {
  const sizes = {} as Record<FaceId, FaceSize>
  for (const f of FACES) {
    sizes[f.id] = { w: f.column === "left" ? 360 : 340, h: f.height }
  }
  return sizes
}

export interface FaceOffset {
  x: number
  y: number
}

function defaultOffsets(): Record<FaceId, FaceOffset> {
  const offsets = {} as Record<FaceId, FaceOffset>
  for (const f of FACES) offsets[f.id] = { x: 0, y: 0 }
  return offsets
}

interface PersistedLayout {
  docked: FaceId[]
  sizes: Record<FaceId, FaceSize>
  dockScale: number
  offsets?: Record<FaceId, FaceOffset>
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function useLayoutPrefs() {
  const [docked, setDocked] = useState<Set<FaceId>>(() => new Set(DEFAULT_DOCKED))
  const [sizes, setSizes] = useState<Record<FaceId, FaceSize>>(defaultSizes)
  const [offsets, setOffsets] = useState<Record<FaceId, FaceOffset>>(defaultOffsets)
  const [dockScale, setDockScale] = useState(1)
  const hydratedRef = useRef(false)

  // Läs sparad layout vid mount (endast klient)
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const saved = JSON.parse(raw) as Partial<PersistedLayout>
          if (Array.isArray(saved.docked)) setDocked(new Set(saved.docked))
          if (saved.sizes) {
            const base = defaultSizes()
            for (const f of FACES) {
              const s = saved.sizes[f.id]
              if (s && typeof s.w === "number" && typeof s.h === "number") {
                base[f.id] = {
                  w: clamp(s.w, SIZE_LIMITS.minW, SIZE_LIMITS.maxW),
                  h: clamp(s.h, SIZE_LIMITS.minH, SIZE_LIMITS.maxH),
                }
              }
            }
            setSizes(base)
          }
          if (typeof saved.dockScale === "number") setDockScale(clamp(saved.dockScale, 0.6, 1.6))
          if (saved.offsets) {
            const base = defaultOffsets()
            for (const f of FACES) {
              const o = saved.offsets[f.id]
              if (o && typeof o.x === "number" && typeof o.y === "number") {
                base[f.id] = { x: clamp(o.x, -1200, 1200), y: clamp(o.y, -1200, 1200) }
              }
            }
            setOffsets(base)
          }
        }
      } catch {
        // korrupt data — ignorera, kör default
      }
      hydratedRef.current = true
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  // Spara vid ändring (efter hydrering)
  useEffect(() => {
    if (!hydratedRef.current) return
    try {
      const payload: PersistedLayout = { docked: Array.from(docked), sizes, dockScale, offsets }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // storage fullt/blockerat — layouten funkar ändå, bara utan persistens
    }
  }, [docked, sizes, dockScale, offsets])

  const toggleFace = useCallback((id: FaceId) => {
    setDocked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const resizeFace = useCallback((id: FaceId, dw: number, dh: number) => {
    setSizes((prev) => ({
      ...prev,
      [id]: {
        w: clamp(prev[id].w + dw, SIZE_LIMITS.minW, SIZE_LIMITS.maxW),
        h: clamp(prev[id].h + dh, SIZE_LIMITS.minH, SIZE_LIMITS.maxH),
      },
    }))
  }, [])

  const scaleFace = useCallback((id: FaceId, factor: number) => {
    setSizes((prev) => ({
      ...prev,
      [id]: {
        w: clamp(Math.round(prev[id].w * factor), SIZE_LIMITS.minW, SIZE_LIMITS.maxW),
        h: clamp(Math.round(prev[id].h * factor), SIZE_LIMITS.minH, SIZE_LIMITS.maxH),
      },
    }))
  }, [])

  const resetFace = useCallback((id: FaceId) => {
    setSizes((prev) => ({ ...prev, [id]: defaultSizes()[id] }))
    setOffsets((prev) => ({ ...prev, [id]: { x: 0, y: 0 } }))
  }, [])

  const moveFace = useCallback((id: FaceId, x: number, y: number) => {
    setOffsets((prev) => ({
      ...prev,
      [id]: { x: clamp(x, -1200, 1200), y: clamp(y, -1200, 1200) },
    }))
  }, [])

  const resetLayout = useCallback(() => {
    setDocked(new Set(DEFAULT_DOCKED))
    setSizes(defaultSizes())
    setOffsets(defaultOffsets())
    setDockScale(1)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignorera
    }
  }, [])

  return {
    docked,
    toggleFace,
    sizes,
    resizeFace,
    scaleFace,
    resetFace,
    offsets,
    moveFace,
    dockScale,
    setDockScale,
    resetLayout,
  }
}
