'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowRight, Blocks, Check, Code2, ImagePlus, Mic, MousePointer2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const LanyardScene = dynamic(() => import('./lanyard-scene'), {
  ssr: false,
  loading: () => <div className="h-full min-h-[430px] animate-pulse bg-muted/20" />,
})

const modes = ['Analyserad', 'Template', 'Audit', 'Fritext'] as const

export function LandingPage() {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<(typeof modes)[number]>('Analyserad')

  const submit = () => {
    const value = prompt.trim()
    if (!value) return
    const params = new URLSearchParams({ prompt: value, mode: mode.toLowerCase() })
    router.push(`/siteagent?${params.toString()}`)
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6">
          <a href="#top" className="font-mono text-sm font-semibold tracking-tight">SITEAGENT</a>
          <nav className="hidden items-center gap-6 font-mono text-xs text-muted-foreground md:flex" aria-label="Huvudnavigation">
            <a href="#studio" className="hover:text-foreground">Studio</a>
            <a href="#sa-funkar-det" className="hover:text-foreground">Så fungerar det</a>
            <a href="/siteagent" className="hover:text-foreground">Öppna Siteagent</a>
          </nav>
          <a href="#studio" className="rounded-md border border-border bg-card px-3 py-1.5 font-mono text-xs hover:bg-muted">Skapa webbplats</a>
        </div>
      </header>

      <section id="top" className="mx-auto grid min-h-[760px] max-w-7xl items-center gap-4 px-4 pb-12 pt-20 md:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative order-2 flex flex-col gap-8 lg:order-1 lg:pr-8">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Svensk AI-webbplatsstudio
          </div>
          <div className="flex flex-col gap-5">
            <h1 className="max-w-3xl text-balance font-sans text-5xl font-semibold leading-[0.98] tracking-[-0.05em] md:text-7xl">
              Beskriv sajten.<br />Se den ta form.
            </h1>
            <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
              Från första idé till en redigerbar webbplats. Siteagent planerar, bygger och visar arbetet medan det händer.
            </p>
          </div>
          <div className="grid max-w-xl grid-cols-3 gap-2 border-t border-border pt-5 font-mono text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" />Ingen kod</span>
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" />Live preview</span>
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" />Redigerbar</span>
          </div>
        </div>

        <div className="order-1 min-h-[430px] overflow-hidden rounded-xl border border-border bg-[#0d0f10] shadow-2xl lg:order-2 lg:min-h-[620px]">
          <LanyardScene />
        </div>
      </section>

      <section id="studio" className="border-y border-border bg-card/40 px-4 py-16 md:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          <div className="flex flex-col gap-2 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Starta ett bygge</p>
            <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">Vad vill du skapa?</h2>
            <p className="text-muted-foreground">Skriv fritt eller välj hur Siteagent ska tolka uppdraget.</p>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3">
              {modes.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMode(item)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 font-mono text-xs transition-colors',
                    mode === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {item}
                </button>
              ))}
              <span className="ml-auto hidden items-center gap-1.5 font-mono text-[10px] text-muted-foreground sm:flex">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> Prompt-assist aktiv
              </span>
            </div>
            <label htmlFor="landing-prompt" className="sr-only">Beskriv webbplatsen du vill bygga</label>
            <textarea
              id="landing-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                  event.preventDefault()
                  submit()
                }
              }}
              rows={5}
              placeholder="Exempel: Bygg en varm, modern webbplats för ett bageri i Uppsala med meny, kontakt och bokning…"
              className="w-full resize-none bg-transparent px-5 py-5 text-base leading-relaxed outline-none placeholder:text-muted-foreground/60 md:text-lg"
            />
            <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-3">
              <div className="flex items-center gap-1">
                <button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Lägg till bild"><ImagePlus className="h-4 w-4" /></button>
                <button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Lägg till block"><Blocks className="h-4 w-4" /></button>
                <button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Röstinmatning"><Mic className="h-4 w-4" /></button>
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={!prompt.trim()}
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-mono text-sm text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Bygg min sajt <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <p className="text-center font-mono text-[11px] text-muted-foreground">Enter för att starta · Shift + Enter för ny rad</p>
        </div>
      </section>

      <section id="sa-funkar-det" className="mx-auto max-w-7xl px-4 py-20 md:px-6">
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
          {[
            { icon: MousePointer2, title: 'Beskriv', text: 'Skriv vad sidan ska göra, kännas som och innehålla.' },
            { icon: Code2, title: 'Följ bygget', text: 'Se resonemang, logg, versioner och preview i Siteagent.' },
            { icon: Sparkles, title: 'Forma vidare', text: 'Flytta kort, byt modell och iterera utan att börja om.' },
          ].map(({ icon: Icon, title, text }) => (
            <article key={title} className="flex min-h-52 flex-col justify-between gap-8 bg-background p-6">
              <Icon className="h-5 w-5 text-primary" />
              <div className="flex flex-col gap-2">
                <h3 className="font-mono text-sm font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
