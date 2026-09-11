'use client'

import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type TiltSurfaceProps = {
  children: ReactNode
  className?: string
  intensity?: number
}

export function TiltSurface({ children, className, intensity = 14 }: TiltSurfaceProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reducedMotionRef = useRef(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      reducedMotionRef.current = media.matches
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  function reset() {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--tilt-x', '0deg')
    el.style.setProperty('--tilt-y', '0deg')
    el.style.setProperty('--shine-x', '50%')
    el.style.setProperty('--shine-y', '50%')
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el || reducedMotionRef.current) return
    const rect = el.getBoundingClientRect()
    const x = (event.clientX - rect.left) / (rect.width || 1) - 0.5
    const y = (event.clientY - rect.top) / (rect.height || 1) - 0.5
    el.style.setProperty('--tilt-x', `${(-y * intensity).toFixed(2)}deg`)
    el.style.setProperty('--tilt-y', `${(x * intensity).toFixed(2)}deg`)
    el.style.setProperty('--shine-x', `${((x + 0.5) * 100).toFixed(1)}%`)
    el.style.setProperty('--shine-y', `${((y + 0.5) * 100).toFixed(1)}%`)
  }

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      className={cn(
        'relative transform-gpu [transform:perspective(900px)_rotateX(var(--tilt-x,0deg))_rotateY(var(--tilt-y,0deg))] transition-transform duration-150 ease-out',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit]"
        style={{
          background:
            'radial-gradient(460px circle at var(--shine-x, 70%) var(--shine-y, 20%), hsl(219 100% 70% / 0.2), transparent 48%)',
        }}
      />
      {children}
    </div>
  )
}
