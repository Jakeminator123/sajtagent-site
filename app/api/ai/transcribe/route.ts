// AI SDK 6 exporterar transkribering under experimental_-prefixet.
import { experimental_transcribe as transcribe } from "ai"
import { NextResponse } from "next/server"

// Ljudinspelning -> text. Körs på node-runtime (aldrig edge med AI SDK).
export const runtime = "nodejs"
export const maxDuration = 60

// Håll uppladdningen liten — promptdiktering är korta klipp, inte poddavsnitt.
const MAX_BYTES = 20 * 1024 * 1024

export async function POST(request: Request) {
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

    const audio = new Uint8Array(await file.arrayBuffer())

    const result = await transcribe({
      model: "openai/whisper-1",
      audio,
      providerOptions: {
        openai: {
          // Svensk prompt-diktering är standardfallet i Siteagent.
          language: "sv",
          temperature: 0,
        },
      },
    })

    return NextResponse.json({
      text: result.text,
      durationInSeconds: result.durationInSeconds ?? null,
    })
  } catch (error) {
    console.error("[v0] transcribe error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transkribering misslyckades" },
      { status: 500 }
    )
  }
}
