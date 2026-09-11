'use client'

import { TiltSurface } from '@/components/landing/tilt-surface'

const LINES = [
  { who: 'Du', text: 'Varm sajt för ett bageri i Uppsala.' },
  { who: 'Siteagent', text: 'Då ritar jag hero, meny och bokning.' },
  { who: 'Du', text: 'Gör heron mjukare. Behåll farten.' },
]

export function FormingPreview() {
  return (
    <TiltSurface className="relative mx-auto w-full max-w-xl lg:max-w-none" intensity={6}>
      <div className="relative overflow-hidden rounded-2xl border border-workflow-border-subtle bg-card/80 shadow-[0_30px_80px_-40px_hsl(219_100%_60%/0.55)] backdrop-blur-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(420px circle at var(--shine-x, 70%) var(--shine-y, 24%), hsl(219 100% 60% / 0.14), transparent 46%)',
          }}
        />

        <div className="relative flex items-center gap-2 border-b border-workflow-border-subtle px-4 py-3">
          <span className="size-2.5 rounded-full bg-destructive/70" />
          <span className="size-2.5 rounded-full bg-brand-amber/80" />
          <span className="size-2.5 rounded-full bg-brand-teal/80" />
          <span className="ml-3 truncate font-mono text-[11px] text-workflow-text-subtle">
            siteagent · live preview
          </span>
          <span className="ml-auto hidden font-mono text-[10px] uppercase tracking-[0.18em] text-brand-teal sm:inline">
            tar form
          </span>
        </div>

        <div className="relative grid gap-0 md:grid-cols-[0.86fr_1.14fr]">
          <div className="flex flex-col gap-3 border-b border-workflow-border-subtle p-4 md:border-b-0 md:border-r">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-workflow-text-subtle">Samtal</p>
            {LINES.map((line, index) => (
              <div
                key={line.text}
                className="rounded-xl border border-workflow-border-subtle bg-workflow-node-input/70 px-3 py-2"
                style={{ transform: `translate3d(var(--near-x), calc(var(--near-y) * ${0.15 + index * 0.08}), 0)` }}
              >
                <p className="font-mono text-[10px] uppercase tracking-wide text-workflow-text-subtle">{line.who}</p>
                <p className="mt-1 text-sm leading-relaxed text-workflow-text">{line.text}</p>
              </div>
            ))}
          </div>

          <div className="relative min-h-64 p-4">
            <div
              className="overflow-hidden rounded-xl border border-workflow-border-subtle bg-background"
              style={{ transform: 'translate3d(var(--mid-x), var(--mid-y), 0)' }}
            >
              <div className="border-b border-workflow-border-subtle px-4 py-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand-teal">Bageriet</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">Doften innan du hinner beställa.</p>
                <div className="mt-4 flex gap-2">
                  <span className="rounded-md bg-primary px-2.5 py-1 font-mono text-[11px] text-primary-foreground">
                    Boka bord
                  </span>
                  <span className="rounded-md border border-workflow-border-subtle px-2.5 py-1 font-mono text-[11px] text-workflow-text-muted">
                    Se menyn
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-px bg-workflow-border-subtle">
                {['Surdegsbröd', 'Fika', 'Catering'].map((item) => (
                  <div key={item} className="bg-card px-3 py-4">
                    <div className="mb-2 h-8 rounded-md bg-gradient-to-br from-primary/25 to-brand-teal/10" />
                    <p className="text-xs font-medium">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </TiltSurface>
  )
}
