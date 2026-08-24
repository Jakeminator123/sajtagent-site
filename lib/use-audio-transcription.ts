'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderStatus = 'idle' | 'recording' | 'transcribing' | 'error'

/** Format som Whisper känner igen, i fallande preferensordning. */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
}

function extensionFor(mimeType: string): string {
  const base = mimeType.split(';')[0]
  return EXTENSIONS[base] ?? 'webm'
}

/** Webbläsarens taligenkänning (Chrome/Safari), utan officiella TS-typer. */
function getSpeechRecognition(): any | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
}

interface Options {
  /** Anropas med transkriberad text när inspelningen är klar. */
  onTranscript: (text: string) => void
  /** Språktagg för igenkänningen. */
  lang?: string
}

/**
 * Diktering med två vägar:
 *  1. Webbläsarens SpeechRecognition — fungerar direkt utan API-nyckel.
 *  2. MediaRecorder + /api/ai/transcribe — används när (1) saknas.
 *
 * Serverrouten kräver OPENAI_API_KEY (AI Gateway proxyar inte ljud), så när
 * varken (1) eller nyckeln finns får användaren ett tydligt felmeddelande.
 */
export function useAudioTranscription({ onTranscript, lang = 'sv-SE' }: Options) {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)

  const recognitionRef = useRef<any>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  // Samlar ihop slutgiltiga fraser under en session.
  const transcriptRef = useRef('')

  // Håll callbacken i en ref så handlers aldrig blir stale.
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
  }, [])

  // Städa upp om komponenten unmountas mitt i en inspelning.
  useEffect(() => {
    return () => {
      releaseStream()
      try {
        recognitionRef.current?.abort()
      } catch {
        /* redan stoppad */
      }
      recognitionRef.current = null
    }
  }, [releaseStream])

  // Sekundräknare under inspelning.
  useEffect(() => {
    if (status !== 'recording') return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [status])

  /** Väg 1: webbläsarens inbyggda taligenkänning. */
  const startRecognition = useCallback(
    (Recognition: any) => {
      const recognition = new Recognition()
      recognition.lang = lang
      recognition.continuous = true
      recognition.interimResults = false

      transcriptRef.current = ''

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) {
            transcriptRef.current += `${result[0].transcript} `
          }
        }
      }

      recognition.onerror = (event: any) => {
        recognitionRef.current = null
        setStatus('error')
        setError(
          event?.error === 'not-allowed'
            ? 'Mikrofonåtkomst nekades.'
            : event?.error === 'no-speech'
              ? 'Inget tal uppfattades. Försök igen.'
              : 'Taligenkänningen misslyckades.'
        )
      }

      recognition.onend = () => {
        recognitionRef.current = null
        const text = transcriptRef.current.trim()
        if (text) onTranscriptRef.current(text)
        // Rör inte status om ett fel redan satt den.
        setStatus((prev) => (prev === 'error' ? prev : 'idle'))
      }

      recognitionRef.current = recognition
      recognition.start()
      setSeconds(0)
      setStatus('recording')
    },
    [lang]
  )

  /** Väg 2: spela in och låt servern transkribera. */
  const startRecording = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError('Inspelning stöds inte i den här webbläsaren.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = async () => {
        const type = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        releaseStream()

        if (blob.size === 0) {
          setStatus('idle')
          return
        }

        setStatus('transcribing')
        try {
          const body = new FormData()
          body.append('audio', blob, `inspelning.${extensionFor(type)}`)

          const res = await fetch('/api/ai/transcribe', { method: 'POST', body })
          const data = (await res.json().catch(() => ({}))) as {
            text?: string
            error?: string
            code?: string
          }

          if (res.status === 501 || data.code === 'not_configured') {
            throw new Error('Diktering stöds inte i den här webbläsaren ännu.')
          }
          if (!res.ok) throw new Error(data.error ?? 'Transkribering misslyckades')

          const text = data.text?.trim()
          if (text) onTranscriptRef.current(text)
          setStatus('idle')
        } catch (err) {
          setStatus('error')
          setError(err instanceof Error ? err.message : 'Transkribering misslyckades')
        }
      }

      recorder.start()
      setSeconds(0)
      setStatus('recording')
    } catch (err) {
      releaseStream()
      setStatus('error')
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Mikrofonåtkomst nekades.'
          : 'Kunde inte starta inspelningen.'
      )
    }
  }, [releaseStream])

  const start = useCallback(async () => {
    setError(null)
    const Recognition = getSpeechRecognition()
    if (Recognition) {
      try {
        startRecognition(Recognition)
        return
      } catch {
        // Faller igenom till inspelning nedan.
      }
    }
    await startRecording()
  }, [startRecognition, startRecording])

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        /* redan stoppad */
      }
      return
    }
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  const toggle = useCallback(() => {
    if (status === 'recording') stop()
    else if (status !== 'transcribing') void start()
  }, [status, start, stop])

  return { status, error, seconds, toggle }
}
