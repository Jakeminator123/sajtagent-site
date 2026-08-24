"use client"

import { useRef } from "react"
import Lanyard from "@/components/ui/lanyard"

interface LanyardWithControlsProps {
  position?: [number, number, number]
  containerClassName?: string
  /** Behålls för bakåtkompatibilitet med delade lanyard-länkar. */
  defaultName?: string
  defaultVariant?: "dark" | "light"
}

/**
 * SajtMaskins fasta tvåsidiga byggkort.
 * Den tidigare v0-personaliseringen är medvetet borttagen, medan WebGL-fysik,
 * dragbarhet och lanyardens responsiva beteende är oförändrade.
 */
export default function LanyardWithControls({
  position = [0, 0, 20],
  containerClassName,
}: LanyardWithControlsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  return (
    <Lanyard
      position={position}
      containerClassName={containerClassName}
      frontTextureUrl="/images/sajtmaskin-card-front.png"
      backTextureUrl="/images/sajtmaskin-card-back.png"
      canvasRef={canvasRef}
    />
  )
}
