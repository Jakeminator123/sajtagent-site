'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useBuilder } from './builder-store'

/**
 * Bryggan mellan förstasidans promptdock och buildern.
 * URL-parametern konsumeras exakt en gång per sidladdning och skickas därefter
 * genom samma sendMessage-flöde som Chat-kortet använder.
 */
export function LandingPromptHandoff() {
  const params = useSearchParams()
  const { sendMessage, isStreaming, messages } = useBuilder()
  const consumed = useRef(false)
  const prompt = params.get('prompt')?.trim() ?? ''

  useEffect(() => {
    if (consumed.current || !prompt || isStreaming || messages.length > 0) return
    consumed.current = true
    void sendMessage(prompt)
  }, [prompt, isStreaming, messages.length, sendMessage])

  return null
}
