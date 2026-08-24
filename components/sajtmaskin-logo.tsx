'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

const FULL_TEXT = 'SajtMaskin'
const SCRAMBLE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz0123456789'
const BOOST_PARTICLES = [
  { size: 3.1, opacity: 0.48, bottom: -2, left: 14.6, duration: 0.34, delay: 0 },
  { size: 4.2, opacity: 0.62, bottom: 1, left: 17.8, duration: 0.46, delay: 0.08 },
  { size: 3.7, opacity: 0.72, bottom: 4, left: 19.2, duration: 0.39, delay: 0.16 },
  { size: 5.1, opacity: 0.57, bottom: 7, left: 16.3, duration: 0.53, delay: 0.24 },
]

export function SajtmaskinLogo() {
  const [display, setDisplay] = useState('')
  const [isHovering, setIsHovering] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [rocketPhase, setRocketPhase] = useState<'launch' | 'idle' | 'boost'>('launch')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const frameRef = useRef(0)

  useEffect(() => {
    let i = 0
    const timer = setInterval(() => {
      i += 1
      setDisplay(FULL_TEXT.slice(0, i))
      if (i >= FULL_TEXT.length) {
        clearInterval(timer)
        setHasLoaded(true)
        setTimeout(() => setRocketPhase('idle'), 300)
      }
    }, 80)
    return () => clearInterval(timer)
  }, [])

  const startScramble = useCallback(() => {
    if (!hasLoaded) return
    setIsHovering(true)
    setRocketPhase('boost')
    frameRef.current = 0
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      frameRef.current += 1
      const revealed = Math.min(Math.floor(frameRef.current / 2), FULL_TEXT.length)
      setDisplay(FULL_TEXT.split('').map((char, index) => index < revealed ? char : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]).join(''))
      if (revealed >= FULL_TEXT.length) {
        if (intervalRef.current) clearInterval(intervalRef.current)
        setDisplay(FULL_TEXT)
        setIsHovering(false)
        setRocketPhase('idle')
      }
    }, 35)
  }, [hasLoaded])

  return (
    <>
      <style jsx global>{`
        @keyframes rocket-float { 0%,100% { transform:translateY(0) rotate(0deg) } 25% { transform:translateY(-2px) rotate(-1.5deg) } 75% { transform:translateY(1.5px) rotate(1deg) } }
        @keyframes rocket-glow-pulse { 0%,100% { filter:drop-shadow(0 0 6px rgba(45,212,191,.4)) } 50% { filter:drop-shadow(0 0 14px rgba(45,212,191,.7)) } }
        @keyframes rocket-shake { 0%,100% { transform:translate(0,0) rotate(-6deg) } 25% { transform:translate(-1px,.5px) rotate(-7deg) } 50% { transform:translate(1px,-.5px) rotate(-5deg) } 75% { transform:translate(-.5px,.5px) rotate(-6.5deg) } }
        @keyframes exhaust-particle { 0% { transform:translateY(0) scale(1); opacity:.7 } 100% { transform:translateY(12px) scale(0); opacity:0 } }
      `}</style>
      <Link href="/" aria-label="SajtMaskin — startsida" className="inline-flex items-center gap-2 select-none group" onMouseEnter={startScramble}>
      <span className="relative flex size-9 shrink-0 items-center justify-center">
        <span className={`absolute inset-0 rounded-xl transition-all duration-700 ${rocketPhase === 'launch' ? 'scale-0 opacity-0' : rocketPhase === 'boost' ? 'scale-125 opacity-100' : 'scale-100 opacity-60'}`} style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.25) 0%, transparent 70%)', filter: 'blur(6px)' }} />
        <span className={`relative z-10 block transition-all duration-500 ease-out ${rocketPhase === 'launch' ? 'translate-y-3 rotate-12 scale-75 opacity-0' : rocketPhase === 'boost' ? '-translate-y-0.5 -rotate-6 scale-110' : 'translate-y-0 rotate-0 scale-100'}`} style={{ animation: rocketPhase === 'idle' ? 'rocket-float 3s ease-in-out infinite, rocket-glow-pulse 2s ease-in-out infinite' : rocketPhase === 'boost' ? 'rocket-shake 0.1s ease-in-out infinite' : 'none' }}>
          <Image src="/images/rocket-logo.webp" alt="" width={36} height={36} className="size-9 object-contain drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]" priority />
        </span>
        {rocketPhase === 'boost' && BOOST_PARTICLES.map((particle, index) => <span key={index} className="absolute rounded-full" style={{ width: particle.size, height: particle.size, background: `rgba(45,212,191,${particle.opacity})`, bottom: particle.bottom, left: particle.left, animation: `exhaust-particle ${particle.duration}s ease-out ${particle.delay}s infinite`, filter: 'blur(1px)' }} />)}
      </span>
      <span className={`font-sans text-base font-semibold tracking-tight transition-colors duration-200 ${isHovering ? 'text-workflow-accent' : 'text-foreground'}`}>{display}</span>
      {!hasLoaded && <span className="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-workflow-accent" />}
      </Link>
    </>
  )
}
