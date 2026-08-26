'use client'

import { FormEvent, KeyboardEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowUp,
  Globe2,
  LayoutTemplate,
  Loader2,
  Mic,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAudioTranscription } from '@/lib/use-audio-transcription'

const MODES = [
  { id: 'analyserad', label: 'Analyserad', icon: Search },
  { id: 'audit', label: 'Audit', icon: ShieldCheck },
  { id: 'template', label: 'Template', icon: LayoutTemplate },
  { id: 'fritext', label: 'Fritext', icon: Sparkles },
] as const

/** Platshållaren styrs av läget så det blir tydligt vad som förväntas. */
const PLACEHOLDERS: Record<(typeof MODES)[number]['id'], string> = {
  analyserad: 'Beskriv företaget, målgruppen och vad webbplatsen ska åstadkomma…',
  audit: 'Klistra in en befintlig webbadress för granskning av innehåll, SEO och tillgänglighet…',
  template: 'Välj utgångspunkt och beskriv vad som ska anpassas…',
  fritext: 'Skriv fritt — vi tolkar och bygger utifrån din text…',
}

function formatSeconds(total: number) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function HomePrompt() {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<(typeof MODES)[number]['id']>('analyserad')

  // Transkriberad text läggs till i stället för att skriva över det som redan står.
  const { status: recStatus, error: recError, seconds, toggle: toggleRecording } =
    useAudioTranscription({
      onTranscript: (text) =>
        setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text)),
    })

  const isRecording = recStatus === 'recording'
  const isTranscribing = recStatus === 'transcribing'

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
          <span className="ml-auto font-mono text-[10px] text-workflow-text-subtle">SiteAgent Builder</span>
        </div>

        <label htmlFor="site-prompt" className="sr-only">
          Beskriv webbplatsen du vill skapa
        </label>
        <textarea
          id="site-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={PLACEHOLDERS[mode]}
          rows={4}
          className="min-h-32 w-full resize-none bg-transparent px-4 py-4 text-base leading-relaxed text-workflow-text outline-none placeholder:text-workflow-text-subtle"
        />

        <div className="flex items-center gap-2 border-t border-workflow-border-subtle px-3 py-3">
          {/* Lägesväljaren får krympa och scrolla i sidled så åtgärderna
              till höger aldrig trycks ner på en egen rad. */}
          <div
            role="group"
            aria-label="Promptläge"
            className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {MODES.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id)}
                  aria-pressed={mode === item.id}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors',
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
          </div>

          <button
            type="button"
            onClick={toggleRecording}
            disabled={isTranscribing}
            aria-label={isRecording ? 'Stoppa inspelning' : 'Spela in och transkribera'}
            aria-pressed={isRecording}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors disabled:cursor-not-allowed',
              isRecording
                ? 'border-destructive bg-destructive/15 text-destructive'
                : 'border-workflow-border-subtle text-workflow-text-muted hover:border-workflow-border hover:text-workflow-text'
            )}
          >
            {isTranscribing ? (
              <>
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                Tolkar…
              </>
            ) : isRecording ? (
              <>
                <Square className="size-3 fill-current" aria-hidden="true" />
                {formatSeconds(seconds)}
              </>
            ) : (
              <>
                <Mic className="size-3" aria-hidden="true" />
                Spela in
              </>
            )}
          </button>

          <button
            type="submit"
            disabled={!prompt.trim()}
            aria-label="Skapa webbplats"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <p aria-live="polite" className="mt-2 font-mono text-[11px] text-workflow-text-subtle">
        {recError ? (
          <span className="text-destructive">{recError}</span>
        ) : isRecording ? (
          'Spelar in — tryck på stopp när du är klar'
        ) : isTranscribing ? (
          'Transkriberar inspelningen…'
        ) : (
          'Enter för att börja · Shift + Enter för ny rad'
        )}
      </p>
    </form>
  )
}
