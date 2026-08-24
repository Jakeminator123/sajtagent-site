import { NextResponse } from "next/server"

// Ljudinspelning -> text. Körs på node-runtime.
export const runtime = "nodejs"
export const maxDuration = 60

// Håll uppladdningen liten — promptdiktering är korta klipp, inte poddavsnitt.
const MAX_BYTES = 20 * 1024 * 1024

/**
 * OBS: Vercel AI Gateway proxyar INTE ljudtranskribering (/v1/audio/transcriptions
 * ger 404) och @ai-sdk/gateway saknar `transcriptionModel`. Serversidig
 * transkribering kräver därför en egen OPENAI_API_KEY. Saknas den svarar vi 501
 * så klienten kan falla tillbaka på webbläsarens inbyggda taligenkänning.
 */
export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Serversidig transkribering är inte konfigurerad",
        code: "not_configured",
      },
      { status: 501 }
    )
  }

  try {
    const form = await request.formData()
    const file = form.get("audio")

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Ingen ljudfil bifogad" }, { status: 400 })
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Ljudfilen är tom" }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Inspelningen är för lång. Håll den under 20 MB." },
        { status: 413 }
      )
    }

    // Filnamn krävs av OpenAI för att gissa formatet.
    const upstream = new FormData()
    upstream.append("file", file, "recording.webm")
    upstream.append("model", "whisper-1")
    upstream.append("language", "sv")
    upstream.append("temperature", "0")

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    })

    if (!res.ok) {
      const detail = await res.text()
      console.error("[v0] transcribe upstream error:", res.status, detail)
      return NextResponse.json({ error: "Transkriberingen misslyckades" }, { status: 502 })
    }

    const data = (await res.json()) as { text?: string }
    return NextResponse.json({ text: data.text ?? "" })
  } catch (error) {
    console.error("[v0] transcribe error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transkribering misslyckades" },
      { status: 500 }
    )
  }
}
