'use client'

import { useRef, type ReactNode } from 'react'
import { usePointerAtmosphere } from '@/hooks/use-pointer-atmosphere'

export function PointerAtmosphere({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  usePointerAtmosphere(rootRef)

  return (
    <div
      ref={rootRef}
      className="relative isolate overflow-x-hidden bg-background [--far-x:0px] [--far-y:0px] [--mid-x:0px] [--mid-y:0px] [--near-x:0px] [--near-y:0px] [--spot-x:58%] [--spot-y:38%]"
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -left-24 top-[-12%] size-[42rem] rounded-full bg-[hsl(219_100%_60%/0.16)] blur-3xl"
          style={{ transform: 'translate3d(var(--far-x), var(--far-y), 0)' }}
        />
        <div
          className="absolute right-[-8%] top-[8%] size-[34rem] rounded-full bg-[hsl(152_45%_50%/0.12)] blur-3xl"
          style={{ transform: 'translate3d(var(--mid-x), var(--mid-y), 0)' }}
        />
        <div
          className="absolute bottom-[-10%] left-[28%] size-[28rem] rounded-full bg-[hsl(219_80%_48%/0.1)] blur-3xl"
          style={{ transform: 'translate3d(var(--near-x), var(--near-y), 0)' }}
        />
        <div
          className="absolute inset-0 opacity-80"
          style={{
            background:
              'radial-gradient(640px circle at var(--spot-x) var(--spot-y), hsl(219 100% 60% / 0.16), transparent 58%)',
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,hsl(var(--background)/0.45)_78%)]" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  )
}
