"use client"

// Layoutinställningar för Sajtagent — vilka kort som är nedvikta,
// kortens storlekar och kortlekens skala. Sparas i localStorage så att
// användarens setup överlever omladdning. "Återställ layout" nollställer allt.

import { useCallback, useEffect, useRef, useState } from "react"
import { FACES, type FaceId } from "./faces/face-defs"
import {
  FACE_OFFSET_MIN_LIMIT,
  LAYOUT_DEFAULTS_REVISION,
  LAYOUT_STORAGE_KEY,
  clampFaceOffset,
  migrateAgentDefaultSize,
  migrateDockedFaces,
} from "./layout-prefs"

const STORAGE_KEY = LAYOUT_STORAGE_KEY

export interface FaceSize {
  w: number
  h: number
}

export const SIZE_LIMITS = { minW: 260, maxW: 680, minH: 180, maxH: 820 }

// Default: bara Sajtagent öppet. Byggval och övriga kort ligger i kortleken.
const DEFAULT_DOCKED: FaceId[] = ["choices", "versions", "blocks", "map"]
const KNOWN_FACE_IDS = FACES.map((face) => face.id)

function defaultSizes(): Record<FaceId, FaceSize> {
  const sizes = {} as Record<FaceId, FaceSize>
  for (const f of FACES) {
    sizes[f.id] = {
      w: f.id === "agent" ? 380 : f.column === "left" ? 360 : 340,
      h: f.height,
    }
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
  defaultsRevision?: number
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function resolveStageSize(measured: { width: number; height: number }): {
  width: number
  height: number
} {
  if (measured.width > 0 && measured.height > 0) return measured
  if (typeof window !== "undefined") {
    return { width: window.innerWidth, height: window.innerHeight }
  }
  return { width: FACE_OFFSET_MIN_LIMIT, height: FACE_OFFSET_MIN_LIMIT }
}

export function useLayoutPrefs() {
  const [docked, setDocked] = useState<Set<FaceId>>(() => new Set(DEFAULT_DOCKED))
  const [sizes, setSizes] = useState<Record<FaceId, FaceSize>>(defaultSizes)
  const [offsets, setOffsets] = useState<Record<FaceId, FaceOffset>>(defaultOffsets)
  const [dockScale, setDockScale] = useState(1)
  const hydratedRef = useRef(false)
  const sizesRef = useRef(sizes)
  const stageSizeRef = useRef({ width: 0, height: 0 })
  const pendingResizeRef = useRef<Partial<Record<FaceId, { dw: number; dh: number }>>>({})
  const resizeRafRef = useRef<number | null>(null)
  sizesRef.current = sizes

  const setStageSize = useCallback((width: number, height: number) => {
    if (width <= 0 || height <= 0) return
    stageSizeRef.current = { width, height }
  }, [])

  // Läs sparad layout vid mount (endast klient)
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        if (stageSizeRef.current.width <= 0) {
          stageSizeRef.current = {
            width: window.innerWidth,
            height: window.innerHeight,
          }
        }
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const saved = JSON.parse(raw) as Partial<PersistedLayout>
          const defaultsRevision =
            typeof saved.defaultsRevision === "number" ? saved.defaultsRevision : undefined
          if (Array.isArray(saved.docked)) {
            setDocked(
              new Set(
                migrateDockedFaces(saved.docked, KNOWN_FACE_IDS, defaultsRevision),
              ),
            )
          }
          const resolvedSizes = defaultSizes()
          if (saved.sizes) {
            for (const f of FACES) {
              const s = saved.sizes[f.id]
              if (s && typeof s.w === "number" && typeof s.h === "number") {
                resolvedSizes[f.id] = {
                  w: clamp(s.w, SIZE_LIMITS.minW, SIZE_LIMITS.maxW),
                  h: clamp(s.h, SIZE_LIMITS.minH, SIZE_LIMITS.maxH),
                }
              }
            }
            resolvedSizes.agent = migrateAgentDefaultSize(
              resolvedSizes.agent,
              defaultSizes().agent,
              defaultsRevision,
            )
            setSizes(resolvedSizes)
          }
          if (typeof saved.dockScale === "number") setDockScale(clamp(saved.dockScale, 0.6, 1.6))
          if (saved.offsets) {
            const base = defaultOffsets()
            const stage = resolveStageSize(stageSizeRef.current)
            for (const f of FACES) {
              const o = saved.offsets[f.id]
              if (o && typeof o.x === "number" && typeof o.y === "number") {
                base[f.id] = clampFaceOffset(o.x, o.y, stage, resolvedSizes[f.id])
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

  useEffect(() => {
    return () => {
      if (resizeRafRef.current != null) {
        window.cancelAnimationFrame(resizeRafRef.current)
      }
    }
  }, [])

  // Spara vid ändring (efter hydrering)
  useEffect(() => {
    if (!hydratedRef.current) return
    try {
      const payload: PersistedLayout = {
        docked: Array.from(docked),
        sizes,
        dockScale,
        offsets,
        defaultsRevision: LAYOUT_DEFAULTS_REVISION,
      }
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
    const pending = pendingResizeRef.current
    const prev = pending[id] ?? { dw: 0, dh: 0 }
    pending[id] = { dw: prev.dw + dw, dh: prev.dh + dh }
    if (resizeRafRef.current != null) return
    resizeRafRef.current = window.requestAnimationFrame(() => {
      resizeRafRef.current = null
      const batch = pendingResizeRef.current
      pendingResizeRef.current = {}
      setSizes((current) => {
        let next = current
        for (const face of FACES) {
          const delta = batch[face.id]
          if (!delta) continue
          const w = clamp(current[face.id].w + delta.dw, SIZE_LIMITS.minW, SIZE_LIMITS.maxW)
          const h = clamp(current[face.id].h + delta.dh, SIZE_LIMITS.minH, SIZE_LIMITS.maxH)
          if (w === current[face.id].w && h === current[face.id].h) continue
          if (next === current) next = { ...current }
          next[face.id] = { w, h }
        }
        return next
      })
    })
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
    const card = sizesRef.current[id] ?? defaultSizes()[id]
    const next = clampFaceOffset(x, y, resolveStageSize(stageSizeRef.current), card)
    setOffsets((prev) => ({ ...prev, [id]: next }))
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
    setStageSize,
    resetLayout,
  }
}
