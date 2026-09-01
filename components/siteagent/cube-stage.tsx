"use client"

// Kortscenen: sex kort som flyter över preview-scenen.
// - Kort kan vikas ner till kortleken (bara främsta syns), resizas och dras runt.
// - Kort med baksida kan flippas 180°: Sajtagent → logg, Blocks → reserverad,
//   Byggval → "Motorn". Byggval låses efter första genereringen och
//   auto-flippas till motor-strömmen.
// Layouten (dock, storlek, position) sparas i localStorage.

import React, { useCallback, useEffect, useRef, useState } from "react"
import { LayoutGroup, motion, useDragControls, useMotionValue } from "motion/react"
import { FlipHorizontal2, GripVertical, Lock, Maximize2, Minimize2, Minus, Plus, RotateCcw, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { FACES, type FaceDef, type FaceId } from "./faces/face-defs"
import { PreviewStage } from "./preview-stage"
import { useBuilder } from "./builder-store"
import type { FaceOffset, FaceSize } from "./use-layout-prefs"

const spring = { type: "spring" as const, stiffness: 300, damping: 30 }

interface CubeStageProps {
  docked: Set<FaceId>
  onToggle: (id: FaceId) => void
  sizes: Record<FaceId, FaceSize>
  resizeFace: (id: FaceId, dw: number, dh: number) => void
  scaleFace: (id: FaceId, factor: number) => void
  resetFace: (id: FaceId) => void
  offsets: Record<FaceId, FaceOffset>
  moveFace: (id: FaceId, x: number, y: number) => void
  dockScale: number
  setDockScale: (fn: (s: number) => number) => void
  resetLayout: () => void
}

/** Ett öppet kort: dragbart i headern, resize-kanter, ev. flippbart. */
function FaceCard({
  face,
  size,
  offset,
  column,
  flipped,
  locked,
  onFlip,
  onToggle,
  resizeFace,
  scaleFace,
  resetFace,
  moveFace,
}: {
  face: FaceDef
  size: FaceSize
  offset: FaceOffset
  column: "left" | "right"
  flipped: boolean
  locked: boolean
  onFlip: (id: FaceId) => void
  onToggle: (id: FaceId) => void
  resizeFace: (id: FaceId, dw: number, dh: number) => void
  scaleFace: (id: FaceId, factor: number) => void
  resetFace: (id: FaceId) => void
  moveFace: (id: FaceId, x: number, y: number) => void
}) {
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const [resizing, setResizing] = useState(false)
  const dragControls = useDragControls()
  const x = useMotionValue(offset.x)
  const y = useMotionValue(offset.y)

  // Synka in sparad position (hydrering/reset) när vi inte drar
  useEffect(() => {
    x.set(offset.x)
    y.set(offset.y)
  }, [offset.x, offset.y, x, y])

  // Drag i kant: horisontellt växer kortet inåt scenen
  const startResize = useCallback(
    (axis: "x" | "y" | "xy") => (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)
      dragRef.current = { x: e.clientX, y: e.clientY }
      setResizing(true)

      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current) return
        const dxRaw = ev.clientX - dragRef.current.x
        const dy = ev.clientY - dragRef.current.y
        const dx = column === "left" ? dxRaw : -dxRaw
        dragRef.current = { x: ev.clientX, y: ev.clientY }
        resizeFace(face.id, axis === "y" ? 0 : dx, axis === "x" ? 0 : dy)
      }
      const onUp = () => {
        dragRef.current = null
        setResizing(false)
        target.releasePointerCapture?.(e.pointerId)
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [column, face.id, resizeFace]
  )

  const canFlip = Boolean(face.Back)
  const headerLabel = flipped && face.backLabel ? face.backLabel : face.label

  // Dra från vilken "tom" yta som helst på kortet — men aldrig från
  // interaktiva element (knappar, textfält, länkar, resize-handtag).
  const startBodyDrag = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement
      if (
        target.closest(
          "button, textarea, input, select, a, iframe, [role='separator'], [data-no-drag]"
        )
      ) {
        return
      }
      dragControls.start(e)
    },
    [dragControls]
  )

  const header = (
    <div
      data-face-header={flipped ? `${face.id}-back` : face.id}
      onPointerDown={(e) => dragControls.start(e)}
      className={cn(
        "flex items-center gap-2 px-3 py-2 border-b border-workflow-border-subtle shrink-0 cursor-grab active:cursor-grabbing select-none touch-none",
        face.accent
      )}
    >
      <GripVertical className="w-3.5 h-3.5 text-workflow-text-subtle -ml-1" />
      <face.icon className="w-4 h-4" />
      <span className="font-mono text-sm font-medium text-workflow-text">{headerLabel}</span>
      {face.id === "choices" && locked && <Lock className="w-3 h-3 text-workflow-text-subtle" />}
      <div
        className="ml-auto flex items-center gap-0.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {canFlip && (
          <button
            type="button"
            onClick={() => onFlip(face.id)}
            className="p-1 rounded text-workflow-text-subtle hover:text-workflow-text transition-colors duration-150"
            aria-label={`Vänd ${face.label}`}
            title={flipped ? "Vänd till framsidan" : "Vänd till baksidan"}
          >
            <FlipHorizontal2 className="w-3 h-3" />
          </button>
        )}
        <button
          type="button"
          onClick={() => scaleFace(face.id, 0.88)}
          className="p-1 rounded text-workflow-text-subtle hover:text-workflow-text transition-colors duration-150"
          aria-label={`Förminska ${face.label}`}
          title="Mindre"
        >
          <Minimize2 className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => scaleFace(face.id, 1.14)}
          className="p-1 rounded text-workflow-text-subtle hover:text-workflow-text transition-colors duration-150"
          aria-label={`Förstora ${face.label}`}
          title="Större"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => resetFace(face.id)}
          className="p-1 rounded text-workflow-text-subtle hover:text-workflow-text transition-colors duration-150"
          aria-label={`Återställ ${face.label}`}
          title="Återställ storlek och position"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => onToggle(face.id)}
          className="p-1 rounded text-workflow-text-muted hover:text-workflow-text transition-colors duration-150"
          aria-label={`Vik ner ${face.label} till kortleken`}
          title="Vik ner till kortleken"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )

  return (
    <motion.div
      layoutId={`face-${face.id}`}
      transition={resizing ? { duration: 0 } : spring}
      drag
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragElastic={0.08}
      onDragEnd={() => moveFace(face.id, x.get(), y.get())}
      onPointerDown={startBodyDrag}
      style={{ width: size.w, height: size.h, x, y, perspective: 1400 }}
      className={cn(
        "relative pointer-events-auto shrink-0",
        face.id === "agent" && "mt-auto"
      )}
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={spring}
        style={{ transformStyle: "preserve-3d" }}
        className="relative w-full h-full"
      >
        {/* Framsida — pointer-events stängs av när den är bortvänd */}
        <div
          style={{ backfaceVisibility: "hidden", pointerEvents: flipped ? "none" : "auto" }}
          className={cn(
            "absolute inset-0 rounded-lg border-2 bg-workflow-node-bg shadow-xl flex flex-col overflow-hidden",
            face.edge
          )}
        >
          {header}
          <div className="flex-1 min-h-0 relative">
            <face.Component />
            {/* Byggval låses efter första genereringen */}
            {face.id === "choices" && locked && (
              <div className="absolute inset-0 bg-workflow-node-bg/70 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 z-10">
                <Lock className="w-4 h-4 text-workflow-text-muted" />
                <p className="font-mono text-[10px] text-workflow-text-muted text-center px-4 leading-relaxed">
                  Byggvalen låstes när första genereringen startade.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Baksida */}
        {face.Back && (
          <div
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              pointerEvents: flipped ? "auto" : "none",
            }}
            className={cn(
              "absolute inset-0 rounded-lg border-2 bg-workflow-node-bg shadow-xl flex flex-col overflow-hidden",
              face.edge
            )}
          >
            {header}
            <div className="flex-1 min-h-0">
              <face.Back />
            </div>
          </div>
        )}
      </motion.div>

      {/* Resize-handtag */}
      <div
        role="separator"
        aria-label={`Ändra bredd på ${face.label}`}
        onPointerDown={startResize("x")}
        className={cn(
          "absolute top-2 bottom-2 w-1.5 cursor-ew-resize rounded-full hover:bg-workflow-border transition-colors duration-150 z-20",
          column === "left" ? "right-0" : "left-0"
        )}
      />
      <div
        role="separator"
        aria-label={`Ändra höjd på ${face.label}`}
        onPointerDown={startResize("y")}
        className="absolute left-2 right-2 bottom-0 h-1.5 cursor-ns-resize rounded-full hover:bg-workflow-border transition-colors duration-150 z-20"
      />
      <div
        role="separator"
        aria-label={`Ändra storlek på ${face.label}`}
        onPointerDown={startResize("xy")}
        className={cn(
          "absolute bottom-0 w-3 h-3 z-20",
          column === "left" ? "right-0 cursor-nwse-resize" : "left-0 cursor-nesw-resize"
        )}
      />
    </motion.div>
  )
}

export function CubeStage({
  docked,
  onToggle,
  sizes,
  resizeFace,
  scaleFace,
  resetFace,
  offsets,
  moveFace,
  dockScale,
  setDockScale,
  resetLayout,
}: CubeStageProps) {
  const [fanned, setFanned] = useState(false)
  const [flipped, setFlipped] = useState<Partial<Record<FaceId, boolean>>>({})
  const { versions, isStreaming } = useBuilder()

  // Byggval låses när första genereringen startar — och auto-flippas
  // till baksidan ("Motorn") som strömmar vad LLM:erna gör och bygger.
  const choicesLocked = versions.length > 0 || isStreaming
  const autoFlippedRef = useRef(false)
  useEffect(() => {
    if (choicesLocked && !autoFlippedRef.current) {
      autoFlippedRef.current = true
      setFlipped((prev) => ({ ...prev, choices: true }))
    }
  }, [choicesLocked])

  const toggleFlip = useCallback((id: FaceId) => {
    setFlipped((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const openLeft = FACES.filter((f) => f.column === "left" && !docked.has(f.id))
  const openRight = FACES.filter((f) => f.column === "right" && !docked.has(f.id))
  const dockedFaces = FACES.filter((f) => docked.has(f.id))

  const cardProps = {
    onToggle,
    resizeFace,
    scaleFace,
    resetFace,
    moveFace,
    onFlip: toggleFlip,
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <PreviewStage />

      <LayoutGroup>
        {/* Öppna kort — vänster kolumn */}
        <div className="absolute left-4 top-4 bottom-4 flex flex-col items-start gap-3 pointer-events-none z-10">
          {openLeft.map((face) => (
            <FaceCard
              key={face.id}
              face={face}
              size={sizes[face.id]}
              offset={offsets[face.id]}
              column="left"
              flipped={Boolean(flipped[face.id])}
              locked={face.id === "choices" && choicesLocked}
              {...cardProps}
            />
          ))}
        </div>

        {/* Öppna kort — höger kolumn (lämnar plats för kortleken nertill) */}
        <div className="absolute right-4 top-4 bottom-40 flex flex-col items-end gap-3 pointer-events-none z-10 overflow-visible">
          {openRight.map((face) => (
            <FaceCard
              key={face.id}
              face={face}
              size={sizes[face.id]}
              offset={offsets[face.id]}
              column="right"
              flipped={Boolean(flipped[face.id])}
              locked={false}
              {...cardProps}
            />
          ))}
        </div>

        {/* Kortleken — nedvikta kort BAKOM varandra, bara främsta syns. */}
        {dockedFaces.length > 0 && (
          <div
            className="absolute bottom-4 right-4 z-20 flex flex-col items-end gap-1.5"
            style={{ transform: `scale(${dockScale})`, transformOrigin: "bottom right" }}
            onMouseLeave={() => setFanned(false)}
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDockScale((s) => Math.max(0.6, Math.round((s - 0.2) * 10) / 10))}
                className="p-1 rounded bg-workflow-surface border border-workflow-border text-workflow-text-muted hover:text-workflow-text transition-colors duration-150"
                aria-label="Förminska kortleken"
              >
                <Minus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setDockScale((s) => Math.min(1.6, Math.round((s + 0.2) * 10) / 10))}
                className="p-1 rounded bg-workflow-surface border border-workflow-border text-workflow-text-muted hover:text-workflow-text transition-colors duration-150"
                aria-label="Förstora kortleken"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={resetLayout}
                className="p-1 rounded bg-workflow-surface border border-workflow-border text-workflow-text-muted hover:text-workflow-text transition-colors duration-150"
                aria-label="Återställ hela layouten"
                title="Återställ layout"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
            {/* Ytan reserverar bara plats för ETT kort — resten ligger bakom */}
            <div className="relative w-[96px] h-[96px]">
              {dockedFaces.map((face, i) => {
                const behind = i
                return (
                  <motion.button
                    key={face.id}
                    layoutId={`face-${face.id}`}
                    transition={spring}
                    type="button"
                    onClick={() => {
                      if (!fanned && dockedFaces.length > 1) {
                        setFanned(true)
                      } else {
                        setFanned(false)
                        onToggle(face.id)
                      }
                    }}
                    animate={
                      fanned
                        ? { x: 0, y: -behind * 104, scale: 1, opacity: 1 }
                        : { x: behind * 3, y: -behind * 3, scale: 1 - behind * 0.02, opacity: 1 }
                    }
                    style={{ zIndex: dockedFaces.length - behind }}
                    className={cn(
                      "absolute inset-0 w-[96px] h-[96px] rounded-lg border-2 bg-workflow-node-bg shadow-lg flex flex-col items-center justify-center gap-1.5 hover:bg-workflow-surface-hover transition-colors duration-150",
                      face.edge
                    )}
                    aria-label={`Öppna ${face.label}`}
                    title={`Öppna ${face.label}`}
                  >
                    <face.icon className={cn("w-5 h-5", face.accent)} />
                    <span className="font-mono text-[9px] text-workflow-text-muted leading-none">
                      {face.label}
                    </span>
                    {behind === 0 && !fanned && dockedFaces.length > 1 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-workflow-surface border border-workflow-border font-mono text-[9px] text-workflow-text-muted flex items-center justify-center leading-none">
                        {dockedFaces.length}
                      </span>
                    )}
                  </motion.button>
                )
              })}
            </div>
          </div>
        )}
      </LayoutGroup>
    </div>
  )
}
