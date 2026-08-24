'use client'

import { FormEvent, KeyboardEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, Globe2, LayoutTemplate, Search, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const MODES = [
  { id: 'analyserad', label: 'Analyserad', icon: Search },
  { id: 'template', label: 'Template', icon: LayoutTemplate },
  { id: 'fritext', label: 'Fritext', icon: Sparkles },
] as const

export function HomePrompt() {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<(typeof MODES)[number]['id']>('analyserad')

  function submit(event?: FormEvent) {
    event?.preventDefault()
    const value = prompt.trim()
    if (!value) return
    const params = new URLSearchParams({ prompt: value, mode })
    router.push(`/builder?${params.toString()}`)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form onSubmit={submit} className="mt-10 w-full max-w-xl" aria-label="Skapa din webbplats">
      <div className="overflow-hidden rounded-xl border border-workflow-border bg-workflow-node-bg shadow-2xl shadow-background/40">
        <div className="flex items-center gap-2 border-b border-workflow-border-subtle px-3 py-2">
          <Globe2 className="size-4 text-workflow-text-muted" aria-hidden="true" />
          <span className="font-mono text-xs font-medium uppercase tracking-wide text-workflow-text-muted">
            Skapa din sida
          </span>
          <span className="ml-auto font-mono text-[10px] text-workflow-text-subtle">Sajtmaskin studio</span>
        </div>

        <label htmlFor="site-prompt" className="sr-only">
          Beskriv webbplatsen du vill skapa
        </label>
        <textarea
          id="site-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Beskriv företaget, målgruppen och vad webbplatsen ska åstadkomma…"
          rows={4}
          className="min-h-32 w-full resize-none bg-transparent px-4 py-4 text-base leading-relaxed text-workflow-text outline-none placeholder:text-workflow-text-subtle"
        />

        <div className="flex flex-wrap items-center gap-2 border-t border-workflow-border-subtle px-3 py-3">
          {MODES.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors',
                  mode === item.id
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-workflow-border-subtle text-workflow-text-muted hover:border-workflow-border hover:text-workflow-text'
                )}
              >
                <Icon className="size-3" aria-hidden="true" />
                {item.label}
              </button>
            )
          })}
          <button
            type="submit"
            disabled={!prompt.trim()}
            aria-label="Skapa webbplats"
            className="ml-auto flex size-9 items-center justify-center rounded-lg bg-foreground text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="mt-2 font-mono text-[11px] text-workflow-text-subtle">
        Enter för att börja · Shift + Enter för ny rad
      </p>
    </form>
  )
}
