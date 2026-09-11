import HeroSection from '@/components/hero-section'
import Features from '@/components/features-3'
import CallToAction from '@/components/call-to-action'
import { PointerAtmosphere } from '@/components/landing/pointer-atmosphere'

export default function Home() {
  return (
    <PointerAtmosphere>
      <HeroSection />
      <Features />
      <CallToAction />
    </PointerAtmosphere>
  )
}
