'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useBuilder } from './builder-store'

/**
 * Bryggan mellan förstasidans promptdock och buildern.
 * URL-parametern konsumeras exakt en gång per sidladdning och skickas därefter
 * genom samma sendMessage-flöde som Chat-kortet använder.
 *
 * useSearchParams() kräver en Suspense-gräns vid prerendering, därför ligger
 * själva läsningen i en inre komponent som wrappas nedan.
 */
function LandingPromptHandoffInner() {
  const params = useSearchParams()
  const { sendMessage, isStreaming, messages } = useBuilder()
  const consumed = useRef(false)
  const prompt = params.get('prompt')?.trim() ?? ''
  const mode = params.get('mode')?.trim() || undefined
  const rawMetadata = params.get('meta')
  const metadata = useMemo<Record<string, string> | undefined>(() => {
    if (!rawMetadata) return undefined
    try {
      const parsed: unknown = JSON.parse(rawMetadata)
      return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : undefined
    } catch {
      return undefined
    }
  }, [rawMetadata])

  useEffect(() => {
    if (consumed.current || !prompt || isStreaming || messages.length > 0) return
    consumed.current = true
    void sendMessage(prompt, { mode, metadata })
  }, [prompt, mode, metadata, isStreaming, messages.length, sendMessage])

  return null
}

export function LandingPromptHandoff() {
  return (
    <Suspense fallback={null}>
      <LandingPromptHandoffInner />
    </Suspense>
  )
}
