'use client'

import { useRef, type ReactNode } from 'react'
import { usePointerAtmosphere } from '@/hooks/use-pointer-atmosphere'

export function PointerAtmosphere({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  usePointerAtmosphere(rootRef)

  return (
    <div
      ref={rootRef}
      className="relative isolate overflow-x-hidden bg-background [--far-x:0px] [--far-y:0px] [--mid-x:0px] [--mid-y:0px] [--near-x:0px] [--near-y:0px] [--spot-x:62%] [--spot-y:36%]"
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute inset-[-20%] opacity-[0.22]"
          style={{
            backgroundImage:
              'linear-gradient(to right, hsl(219 100% 70% / 0.16) 1px, transparent 1px), linear-gradient(to bottom, hsl(219 100% 70% / 0.16) 1px, transparent 1px)',
            backgroundSize: '72px 72px',
            transform: 'translate3d(var(--far-x), var(--far-y), 0)',
          }}
        />
        <div
          className="absolute -left-16 top-[-18%] size-[46rem] rounded-full blur-3xl"
          style={{
            background: 'radial-gradient(circle, hsl(219 100% 60% / 0.38) 0%, transparent 68%)',
            transform: 'translate3d(var(--far-x), var(--far-y), 0)',
          }}
        />
        <div
          className="absolute right-[-10%] top-[4%] size-[38rem] rounded-full blur-3xl"
          style={{
            background: 'radial-gradient(circle, hsl(152 55% 48% / 0.3) 0%, transparent 70%)',
            transform: 'translate3d(var(--mid-x), var(--mid-y), 0)',
          }}
        />
        <div
          className="absolute bottom-[-8%] left-[22%] size-[32rem] rounded-full blur-3xl"
          style={{
            background: 'radial-gradient(circle, hsl(219 90% 58% / 0.24) 0%, transparent 70%)',
            transform: 'translate3d(var(--near-x), var(--near-y), 0)',
          }}
        />
        <div
          className="absolute size-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen"
          style={{
            left: 'var(--spot-x)',
            top: 'var(--spot-y)',
            background:
              'radial-gradient(circle, hsl(219 100% 68% / 0.34) 0%, hsl(152 60% 50% / 0.12) 28%, transparent 64%)',
          }}
        />
        <div
          className="absolute hidden size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_24px_8px_hsl(219_100%_60%/0.55)] [@media(pointer:fine)]:block"
          style={{ left: 'var(--spot-x)', top: 'var(--spot-y)' }}
        />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  )
}
