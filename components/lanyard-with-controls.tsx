"use client"

import Image from "next/image"
import { Rotate3D } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface LanyardWithControlsProps {
  position?: [number, number, number]
  containerClassName?: string
  /** Behålls för bakåtkompatibilitet med äldre delade länkar. */
  defaultName?: string
  defaultVariant?: "dark" | "light"
}

/**
 * SajtMaskins tvåsidiga byggkort. Kortet står fritt i hero-sektionen och kan
 * vändas med mus, touch eller tangentbord utan en distraherande lanyard.
 */
export default function LanyardWithControls({
  containerClassName,
}: LanyardWithControlsProps) {
  const [showBack, setShowBack] = useState(false)

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center px-8 py-24 md:px-12",
        containerClassName
      )}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-5">
        <button
          type="button"
          onClick={() => setShowBack((value) => !value)}
          aria-label={showBack ? "Visa kortets framsida" : "Visa kortets baksida"}
          aria-pressed={showBack}
          className="group block w-full rounded-[1.75rem] text-left outline-none focus-visible:ring-2 focus-visible:ring-workflow-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          style={{ perspective: "1400px" }}
        >
          <span
            className="relative block aspect-[2/3] w-full transition-transform duration-700 ease-[cubic-bezier(.2,.75,.2,1)] motion-reduce:transition-none"
            style={{
              transformStyle: "preserve-3d",
              transform: showBack ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            <span
              className="absolute inset-0 overflow-hidden rounded-[1.75rem] border border-workflow-border bg-background shadow-2xl shadow-background/70 transition-transform duration-500 group-hover:-translate-y-1"
              style={{ backfaceVisibility: "hidden" }}
            >
              <Image
                src="/images/sajtmaskin-card-front.png"
                alt="SajtMaskin byggkort med texten Prompt till produktion"
                fill
                priority
                sizes="(min-width: 1024px) 420px, 70vw"
                className="object-cover"
              />
            </span>

            <span
              className="absolute inset-0 overflow-hidden rounded-[1.75rem] border border-workflow-border bg-background shadow-2xl shadow-background/70 transition-transform duration-500 group-hover:-translate-y-1"
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            >
              <Image
                src="/images/sajtmaskin-card-back.png"
                alt="SajtMaskin OpenClaw-kort med QR-kod"
                fill
                sizes="(min-width: 1024px) 420px, 70vw"
                className="object-cover"
              />
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setShowBack((value) => !value)}
          className="flex items-center gap-2 rounded-full border border-workflow-border-subtle bg-workflow-node-input/70 px-4 py-2 font-mono text-xs text-workflow-text-muted transition-colors hover:border-workflow-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workflow-accent"
        >
          <Rotate3D className="size-4" aria-hidden="true" />
          {showBack ? "Visa framsidan" : "Vänd kortet"}
        </button>
      </div>
    </div>
  )
}
