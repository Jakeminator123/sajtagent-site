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

interface Options {
  /** Anropas med transkriberad text när inspelningen är klar. */
  onTranscript: (text: string) => void
}

/**
 * Spelar in mikrofonljud och skickar det till /api/ai/transcribe.
 * Strömmen stängs alltid ned, även vid fel, så mikrofonindikatorn inte hänger kvar.
 */
export function useAudioTranscription({ onTranscript }: Options) {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  // Håll callbacken i en ref så stop-handlern aldrig blir stale.
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
  }, [])

  // Städa upp om komponenten unmountas mitt i en inspelning.
  useEffect(() => releaseStream, [releaseStream])

  // Sekundräknare under inspelning.
  useEffect(() => {
    if (status !== 'recording') return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [status])

  const start = useCallback(async () => {
    setError(null)

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
          const data = (await res.json()) as { text?: string; error?: string }

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

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  const toggle = useCallback(() => {
    if (status === 'recording') stop()
    else if (status !== 'transcribing') void start()
  }, [status, start, stop])

  return { status, error, seconds, toggle }
}
