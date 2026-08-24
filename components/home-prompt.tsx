'use client'

import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  ArrowUp,
  BriefcaseBusiness,
  Building2,
  Check,
  FileSearch,
  Globe2,
  LayoutTemplate,
  Loader2,
  MapPin,
  Mic,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAudioTranscription } from '@/lib/use-audio-transcription'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const MODES = [
  { id: 'analyserad', label: 'Analyserad', description: 'Guidad brief', icon: Search },
  { id: 'template', label: 'Template', description: 'Välj startpunkt', icon: LayoutTemplate },
  { id: 'audit', label: 'Audit', description: 'Granska befintlig sida', icon: ShieldCheck },
  { id: 'fritext', label: 'Fritext', description: 'Beskriv med egna ord', icon: Sparkles },
] as const

type Mode = (typeof MODES)[number]['id']
const INDUSTRIES = ['Tjänsteföretag', 'Restaurang', 'Butik', 'Kreatör', 'Tech / SaaS', 'Annat']
const TEMPLATES = [
  { id: 'landing', label: 'Landningssida', description: 'En sida för ett erbjudande' },
  { id: 'ecommerce', label: 'E-handel', description: 'Produkter och köpflöde' },
  { id: 'portfolio', label: 'Portfolio', description: 'Arbeten och case' },
  { id: 'dashboard', label: 'Dashboard', description: 'Data och verktyg' },
  { id: 'blog', label: 'Blogg', description: 'Artiklar och innehåll' },
] as const

interface Brief { name: string; industry: string; location: string; website: string }
const EMPTY_BRIEF: Brief = { name: '', industry: '', location: '', website: '' }

function formatSeconds(total: number) {
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    return url.hostname.includes('.') && !url.hostname.includes(' ') ? url.toString() : ''
  } catch {
    return ''
  }
}

function buildBriefPrompt(brief: Brief) {
  const details = [
    `Företag/projekt: ${brief.name}`,
    brief.industry && `Bransch: ${brief.industry}`,
    brief.location && `Ort: ${brief.location}`,
    brief.website && `Befintlig webbplats: ${normalizeUrl(brief.website) || brief.website}`,
  ].filter(Boolean)
  return `Skapa en genomarbetad webbplats utifrån följande brief. ${details.join('. ')}. Analysera målgrupp, informationsstruktur och viktigaste konverteringsmål innan du bygger.`
}

export function HomePrompt() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('analyserad')
  const [prompt, setPrompt] = useState('')
  const [auditUrl, setAuditUrl] = useState('')
  const [auditTouched, setAuditTouched] = useState(false)
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]['id'] | ''>('')
  const [brief, setBrief] = useState<Brief>(EMPTY_BRIEF)
  const [briefOpen, setBriefOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const auditRef = useRef<HTMLInputElement>(null)

  const { status: recStatus, error: recError, seconds, toggle: toggleRecording } = useAudioTranscription({
    onTranscript: (text) => setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text)),
  })
  const validAuditUrl = useMemo(() => normalizeUrl(auditUrl), [auditUrl])
  const isRecording = recStatus === 'recording'
  const isTranscribing = recStatus === 'transcribing'
  const canSubmit = mode === 'audit' ? Boolean(validAuditUrl) : mode === 'template' ? Boolean(template || prompt.trim()) : Boolean(prompt.trim())

  function selectMode(nextMode: Mode) {
    setMode(nextMode)
    if (nextMode === 'analyserad') {
      setBriefOpen(true)
      return
    }
    requestAnimationFrame(() => nextMode === 'audit' ? auditRef.current?.focus() : textareaRef.current?.focus())
  }

  function completeBrief() {
    if (!brief.name.trim()) return
    setPrompt(buildBriefPrompt(brief))
    setMode('analyserad')
    setBriefOpen(false)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) {
      if (mode === 'audit') setAuditTouched(true)
      return
    }
    let finalPrompt = prompt.trim()
    const metadata: Record<string, string> = {}
    if (mode === 'audit') {
      metadata.auditUrl = validAuditUrl
      finalPrompt = `Förbered en audit av ${validAuditUrl}. Granska innehåll, informationsstruktur, grundläggande SEO och tillgänglighet. Sammanfatta nuläget och föreslå en prioriterad plan innan någon sida byggs om.`
    } else if (mode === 'template') {
      const selected = TEMPLATES.find((item) => item.id === template)
      if (selected) metadata.template = selected.id
      finalPrompt = `Använd ${selected?.label.toLowerCase() ?? 'en lämplig template'} som startpunkt.${prompt.trim() ? ` Anpassning: ${prompt.trim()}` : ''}`
    } else if (mode === 'analyserad') {
      metadata.brief = JSON.stringify(brief)
    }
    const params = new URLSearchParams({ prompt: finalPrompt, mode })
    if (Object.keys(metadata).length) params.set('meta', JSON.stringify(metadata))
    router.push(`/builder?${params.toString()}`)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <>
      <form onSubmit={submit} className="mt-10 w-full max-w-2xl" aria-label="Starta ett webbprojekt">
        <div className="overflow-hidden rounded-2xl border border-workflow-border-subtle bg-workflow-surface shadow-2xl shadow-background/50">
          <div className="grid grid-cols-2 border-b border-workflow-border-subtle md:grid-cols-4">
            {MODES.map((item) => {
              const Icon = item.icon
              const active = mode === item.id
              return (
                <button key={item.id} type="button" onClick={() => selectMode(item.id)} aria-pressed={active} className={cn('flex min-w-0 items-start gap-2 border-workflow-border-subtle px-3 py-3 text-left transition-colors md:border-r md:last:border-r-0', active ? 'bg-foreground text-background' : 'text-workflow-text-muted hover:bg-workflow-surface-elevated hover:text-workflow-text')}>
                  <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-5">{item.label}</span>
                    <span className={cn('block truncate font-mono text-[10px]', active ? 'text-background/65' : 'text-workflow-text-subtle')}>{item.description}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="p-4">
            {mode === 'audit' ? (
              <div className="flex flex-col gap-3">
                <label htmlFor="audit-url" className="flex items-center gap-2 text-sm font-medium text-workflow-text"><FileSearch className="size-4 text-primary" />Vilken webbplats ska granskas?</label>
                <div className={cn('flex items-center gap-2 rounded-xl border bg-background px-3', auditTouched && !validAuditUrl ? 'border-destructive' : 'border-workflow-border-subtle focus-within:border-primary')}>
                  <Globe2 className="size-4 shrink-0 text-workflow-text-subtle" />
                  <input ref={auditRef} id="audit-url" type="text" inputMode="url" value={auditUrl} onChange={(event) => setAuditUrl(event.target.value)} onBlur={() => setAuditTouched(true)} onKeyDown={handleKeyDown} placeholder="exempel.se" aria-invalid={auditTouched && !validAuditUrl} aria-describedby="audit-help" className="h-12 min-w-0 flex-1 bg-transparent text-sm text-workflow-text outline-none placeholder:text-workflow-text-subtle" />
                  {validAuditUrl && <Check className="size-4 text-primary" aria-label="Giltig webbadress" />}
                </div>
                <p id="audit-help" aria-live="polite" className={cn('font-mono text-[11px]', auditTouched && !validAuditUrl ? 'text-destructive' : 'text-workflow-text-subtle')}>
                  {auditTouched && !validAuditUrl ? 'Ange en giltig webbadress, till exempel sajtmaskin.se' : 'Vi förbereder en granskning av innehåll, struktur, SEO och tillgänglighet.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {mode === 'template' && (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm font-medium text-workflow-text">Välj en startpunkt</legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {TEMPLATES.map((item) => (
                        <button key={item.id} type="button" onClick={() => setTemplate(item.id)} aria-pressed={template === item.id} className={cn('rounded-lg border px-2 py-2 text-left transition-colors', template === item.id ? 'border-primary bg-primary/10 text-workflow-text' : 'border-workflow-border-subtle text-workflow-text-muted hover:border-workflow-border')}>
                          <span className="block text-xs font-medium">{item.label}</span>
                          <span className="mt-1 hidden font-mono text-[9px] leading-3 text-workflow-text-subtle lg:block">{item.description}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
                <label htmlFor="site-prompt" className="sr-only">{mode === 'template' ? 'Beskriv hur templaten ska anpassas' : 'Beskriv webbplatsen'}</label>
                <textarea ref={textareaRef} id="site-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={handleKeyDown} rows={mode === 'template' ? 2 : 4} placeholder={mode === 'template' ? 'Valfritt: färger, innehåll eller funktioner…' : mode === 'analyserad' ? 'Öppna den guidade briefen eller beskriv projektet här…' : 'Beskriv vad du vill bygga…'} className="w-full resize-none bg-transparent text-sm leading-relaxed text-workflow-text outline-none placeholder:text-workflow-text-subtle" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-workflow-border-subtle px-3 py-3">
            {mode === 'analyserad' && <button type="button" onClick={() => setBriefOpen(true)} className="flex items-center gap-1.5 rounded-full border border-workflow-border-subtle px-3 py-1.5 font-mono text-[11px] text-workflow-text-muted transition-colors hover:border-primary hover:text-workflow-text"><BriefcaseBusiness className="size-3.5" />{brief.name ? 'Redigera brief' : 'Starta guidad brief'}</button>}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {mode !== 'audit' && <button type="button" onClick={toggleRecording} disabled={isTranscribing} aria-label={isRecording ? 'Stoppa inspelning' : 'Spela in och transkribera'} aria-pressed={isRecording} className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 font-mono text-[11px] transition-colors disabled:cursor-not-allowed', isRecording ? 'border-destructive bg-destructive/15 text-destructive' : 'border-workflow-border-subtle text-workflow-text-muted hover:border-workflow-border hover:text-workflow-text')}>
                {isTranscribing ? <Loader2 className="size-3.5 animate-spin" /> : isRecording ? <Square className="size-3 fill-current" /> : <Mic className="size-3.5" />}
                {isTranscribing ? 'Tolkar…' : isRecording ? formatSeconds(seconds) : <span className="hidden sm:inline">Spela in</span>}
              </button>}
              <button type="submit" disabled={!canSubmit} aria-label={mode === 'audit' ? 'Förbered audit' : 'Skapa webbplats'} className="flex h-9 items-center gap-2 rounded-lg bg-foreground px-3 text-sm font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-30"><span className="hidden sm:inline">{mode === 'audit' ? 'Förbered audit' : 'Fortsätt'}</span><ArrowUp className="size-4" /></button>
            </div>
          </div>
        </div>
        <p aria-live="polite" className="mt-2 font-mono text-[11px] text-workflow-text-subtle">{recError ? <span className="text-destructive">{recError}</span> : isRecording ? 'Spelar in — tryck på stopp när du är klar' : isTranscribing ? 'Transkriberar inspelningen…' : 'Enter för att börja · Shift + Enter för ny rad'}</p>
      </form>

      <Dialog open={briefOpen} onOpenChange={setBriefOpen}>
        <DialogContent className="max-w-xl border-workflow-border bg-workflow-surface p-0 text-workflow-text">
          <DialogHeader className="border-b border-workflow-border-subtle px-6 py-5">
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-primary"><span>Analyserad</span><span className="h-px flex-1 bg-workflow-border-subtle" /><span>Steg 1 av 1</span></div>
            <DialogTitle className="text-balance text-xl">Ge oss riktningen. Vi analyserar resten.</DialogTitle>
            <DialogDescription>Fyra korta svar ger buildern en betydligt skarpare startpunkt.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 px-6 py-5">
            <label className="grid gap-2 text-sm font-medium"><span className="flex items-center gap-2"><Building2 className="size-4 text-primary" />Företag eller projekt</span><input autoFocus value={brief.name} onChange={(event) => setBrief((prev) => ({ ...prev, name: event.target.value }))} placeholder="Exempelvis Nordgrens Bageri" className="h-11 rounded-lg border border-workflow-border-subtle bg-background px-3 text-sm outline-none focus:border-primary" /></label>
            <fieldset className="grid gap-2"><legend className="text-sm font-medium">Bransch</legend><div className="flex flex-wrap gap-2">{INDUSTRIES.map((industry) => <button key={industry} type="button" onClick={() => setBrief((prev) => ({ ...prev, industry }))} aria-pressed={brief.industry === industry} className={cn('rounded-full border px-3 py-1.5 text-xs transition-colors', brief.industry === industry ? 'border-primary bg-primary/10 text-workflow-text' : 'border-workflow-border-subtle text-workflow-text-muted hover:border-workflow-border')}>{industry}</button>)}</div></fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium"><span className="flex items-center gap-2"><MapPin className="size-4 text-primary" />Ort <span className="font-normal text-workflow-text-subtle">(valfritt)</span></span><input value={brief.location} onChange={(event) => setBrief((prev) => ({ ...prev, location: event.target.value }))} placeholder="Uppsala" className="h-11 rounded-lg border border-workflow-border-subtle bg-background px-3 text-sm outline-none focus:border-primary" /></label>
              <label className="grid gap-2 text-sm font-medium"><span className="flex items-center gap-2"><Globe2 className="size-4 text-primary" />Nuvarande webb <span className="font-normal text-workflow-text-subtle">(valfritt)</span></span><input value={brief.website} onChange={(event) => setBrief((prev) => ({ ...prev, website: event.target.value }))} placeholder="exempel.se" className="h-11 rounded-lg border border-workflow-border-subtle bg-background px-3 text-sm outline-none focus:border-primary" /></label>
            </div>
          </div>
          <DialogFooter className="border-t border-workflow-border-subtle px-6 py-4"><button type="button" onClick={completeBrief} disabled={!brief.name.trim()} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background disabled:opacity-30">Använd brief<ArrowRight className="size-4" /></button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
