// Builder v2 — adapterlager.
// ALLA backend-anrop går genom denna fil. Varje funktion har samma
// API-vägar som sajtmaskin använder, med en tunn simulering som fallback
// när endpointen inte finns (t.ex. i v0-förhandsvisningen).
//
// Merge-karta (sajtmaskin-hook -> adapterfunktion):
//   useCreateChat / useSendMessage  -> streamChat()   (POST /api/engine/chats/stream)
//   prompt-assist-knappen           -> promptAssist() (POST /api/ai/prompt-assist)
//   useBuilderDeployActions         -> publish()
//   ZIP-nedladdning                 -> downloadZip()

import type { BuildChoices } from "./build-choices"
import type { StreamEvent } from "./types"

export interface StreamChatParams {
  chatId: string | null
  message: string
  choices: BuildChoices
  planMode?: boolean
  /** Modellval från chatkortet (t.ex. "fast" | "standard" | "max") */
  model?: string
  /** Promptläge från förstasidans dock: analyserad | audit | template | fritext */
  mode?: string
  /** Strukturerat underlag från lägets UI, t.ex. audit-URL eller vald template. */
  metadata?: Record<string, string>
  onEvent: (event: StreamEvent) => void
  signal?: AbortSignal
}

/**
 * Init + follow-up mot chat-motorn.
 * Motsvarar useCreateChat/useSendMessage i sajtmaskin.
 * Läser SSE-events (text/preview/done/error) från /api/engine/chats/stream.
 */
export async function streamChat(params: StreamChatParams): Promise<void> {
  const { chatId, message, choices, planMode, model, mode, metadata, onEvent, signal } = params

  try {
    const res = await fetch("/api/engine/chats/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message, meta: { choices, planMode, model, mode, ...metadata } }),
      signal,
    })

    if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE-format: "data: {json}\n\n"
      const parts = buffer.split("\n\n")
      buffer = parts.pop() ?? ""
      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith("data:")) continue
        const payload = line.slice(5).trim()
        if (payload === "[DONE]") {
          onEvent({ type: "done" })
          continue
        }
        try {
          onEvent(JSON.parse(payload) as StreamEvent)
        } catch {
          // ignorera trasiga chunkar
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) return
    // Fallback: endpointen finns inte här — kör tunn simulering så UI:t går att klicka igenom.
    await simulateStream(message, choices, onEvent, signal)
  }
}

/**
 * Prompt-assist. Motsvarar POST /api/ai/prompt-assist i sajtmaskin.
 */
export async function promptAssist(text: string): Promise<string> {
  try {
    const res = await fetch("/api/ai/prompt-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: text }),
    })
    if (!res.ok) throw new Error(`assist failed: ${res.status}`)
    const data = (await res.json()) as { prompt?: string; text?: string }
    return data.prompt ?? data.text ?? text
  } catch {
    // Tunn fallback så knappen gör något synligt.
    return `${text}\n\nMålgrupp: småföretag. Ton: professionell men varm. Inkludera hero, tjänster, omdömen och kontaktformulär.`
  }
}

/**
 * Publicera. Stub — pekas mot useBuilderDeployActions vid merge.
 */
export async function publish(): Promise<{ ok: boolean; url?: string }> {
  await delay(1200)
  return { ok: true }
}

/**
 * Ladda ner ZIP för en version. Stub — pekas mot befintlig ZIP-export vid merge.
 */
export async function downloadZip(versionId: string): Promise<void> {
  console.log("[builder-v2] downloadZip stub, versionId:", versionId)
}

// ---------------------------------------------------------------------------
// Simulering (endast fallback — tas bort/ignoreras vid merge)
// ---------------------------------------------------------------------------

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => {
      clearTimeout(t)
      resolve()
    })
  })
}

const SWATCH_HEX: Record<string, string> = {
  ocean: "#0284c7",
  forest: "#059669",
  amber: "#f59e0b",
  brick: "#e11d48",
  flower: "#f472b6",
  plum: "#9333ea",
  mustard: "#ca8a04",
}

async function simulateStream(
  message: string,
  choices: BuildChoices,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal
) {
  const reply =
    "Jag bygger ett utkast utifrån din beskrivning och dina byggval. " +
    "En första version med hero, innehållssektioner och kontakt genereras nu…"

  for (const word of reply.split(" ")) {
    if (signal?.aborted) return
    onEvent({ type: "text", delta: word + " " })
    await delay(35, signal)
  }

  await delay(500, signal)
  if (signal?.aborted) return

  const accent = SWATCH_HEX[choices.color] ?? "#0284c7"
  const dark = choices.colorMode === "dark"
  const pages = ["Hem", "Om oss", "Kontakt"].slice(
    0,
    choices.pageCount > 0 ? choices.pageCount : 3
  )

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;font-family:system-ui,sans-serif;background:${dark ? "#0a0a0a" : "#fafafa"};color:${dark ? "#fafafa" : "#171717"}}
    header{padding:16px 32px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${dark ? "#262626" : "#e5e5e5"}}
    nav{display:flex;gap:20px;font-size:14px;color:${dark ? "#a3a3a3" : "#525252"}}
    .hero{padding:96px 32px;text-align:center}
    .hero h1{font-size:44px;margin:0 0 16px;max-width:640px;margin-inline:auto;line-height:1.15}
    .hero p{color:${dark ? "#a3a3a3" : "#525252"};max-width:480px;margin:0 auto 32px;line-height:1.5}
    .cta{background:${accent};color:#fff;border:none;padding:14px 32px;border-radius:8px;font-size:16px;cursor:pointer}
    .cards{display:flex;gap:16px;padding:0 32px 96px;max-width:960px;margin:0 auto}
    .card{flex:1;border:1px solid ${dark ? "#262626" : "#e5e5e5"};border-radius:12px;padding:24px}
    .card h3{margin:0 0 8px;font-size:16px}.card p{margin:0;font-size:14px;color:${dark ? "#a3a3a3" : "#525252"};line-height:1.5}
  </style></head><body>
  <header><strong>Din sajt</strong><nav>${pages.map((p) => `<span>${p}</span>`).join("")}</nav></header>
  <div class="hero"><h1>${escapeHtml(message.slice(0, 80) || "Din nya sajt")}</h1>
  <p>Genererad förhandsvisning (simulering). Efter merge visas den riktiga preview-sessionen här.</p>
  <button class="cta">Kom igång</button></div>
  <div class="cards"><div class="card"><h3>Snabbt</h3><p>Byggd på dina byggval.</p></div>
  <div class="card"><h3>Flexibelt</h3><p>Fortsätt förbättra via chatten.</p></div>
  <div class="card"><h3>Redo</h3><p>Publicera när du är nöjd.</p></div></div>
  </body></html>`

  onEvent({ type: "preview", srcDoc, pages })
  await delay(400, signal)
  onEvent({ type: "done" })
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
