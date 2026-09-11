'use client'

import { useEffect, type RefObject } from 'react'

type AtmosphereTarget = {
  x: number
  y: number
  scroll: number
}

const INITIAL: AtmosphereTarget = { x: 0.58, y: 0.38, scroll: 0 }

function writeAtmosphereVars(el: HTMLElement, state: AtmosphereTarget, reduced: boolean) {
  const px = state.x - 0.5
  const py = state.y - 0.5
  const sx = reduced ? 0 : px
  const sy = reduced ? 0 : py
  const scroll = reduced ? 0 : state.scroll

  el.style.setProperty('--spot-x', `${(state.x * 100).toFixed(2)}%`)
  el.style.setProperty('--spot-y', `${(state.y * 100).toFixed(2)}%`)
  el.style.setProperty('--far-x', `${(sx * 28).toFixed(2)}px`)
  el.style.setProperty('--far-y', `${(sy * 16 - scroll * 0.05).toFixed(2)}px`)
  el.style.setProperty('--mid-x', `${(sx * 52).toFixed(2)}px`)
  el.style.setProperty('--mid-y', `${(sy * 28 - scroll * 0.1).toFixed(2)}px`)
  el.style.setProperty('--near-x', `${(sx * 78).toFixed(2)}px`)
  el.style.setProperty('--near-y', `${(sy * 42 - scroll * 0.18).toFixed(2)}px`)
}

export function usePointerAtmosphere(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const target = { ...INITIAL }
    const current = { ...INITIAL }
    let frame = 0

    const readPointer = (event: PointerEvent) => {
      const width = window.innerWidth || 1
      const height = window.innerHeight || 1
      target.x = Math.min(1, Math.max(0, event.clientX / width))
      target.y = Math.min(1, Math.max(0, event.clientY / height))
    }

    const readScroll = () => {
      target.scroll = window.scrollY
    }

    const tick = () => {
      const ease = reducedMotion.matches ? 1 : 0.11
      current.x += (target.x - current.x) * ease
      current.y += (target.y - current.y) * ease
      current.scroll += (target.scroll - current.scroll) * ease
      writeAtmosphereVars(root, current, reducedMotion.matches)
      frame = window.requestAnimationFrame(tick)
    }

    readScroll()
    writeAtmosphereVars(root, current, reducedMotion.matches)
    window.addEventListener('pointermove', readPointer, { passive: true })
    window.addEventListener('scroll', readScroll, { passive: true })
    frame = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', readPointer)
      window.removeEventListener('scroll', readScroll)
    }
  }, [rootRef])
}
