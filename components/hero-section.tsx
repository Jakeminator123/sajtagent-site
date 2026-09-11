import Link from 'next/link'
import { InfiniteSlider } from '@/components/ui/infinite-slider'
import { ProgressiveBlur } from '@/components/ui/progressive-blur'
import { TextEffect } from '@/components/motion-primitives/text-effect'
import { AnimatedGroup } from '@/components/motion-primitives/animated-group'
import DecryptedText from '@/components/DecryptedText'
import { transitionVariants } from '@/lib/utils'
import { HomePrompt } from '@/components/home-prompt'
import { LandingHeader } from '@/components/landing-header'
import { FormingPreview } from '@/components/landing/forming-preview'

export default function HeroSection() {
  return (
    <main className="overflow-x-hidden">
      <LandingHeader />
      <section id="top" className="relative lg:min-h-screen">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 pt-28 md:pb-28 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-32 lg:pt-36">
          <div id="skapa" className="relative mx-auto max-w-2xl scroll-mt-28 text-center lg:mx-0 lg:text-left">
            <div className="mt-2 inline-flex rounded-md bg-workflow-node-input px-2 py-1 lg:mt-4">
              <DecryptedText
                text="SITEAGENT · LOKAL BETA"
                animateOn="view"
                revealDirection="start"
                sequential
                useOriginalCharsOnly={false}
                speed={70}
                className="font-mono text-xs tracking-[0.18em] text-workflow-text-muted uppercase"
              />
            </div>
            <TextEffect
              per="line"
              preset="fade-in-blur"
              speedSegment={0.3}
              as="h1"
              className="mt-6 max-w-2xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl"
            >
              {'Beskriv sajten.\nSe den ta form.'}
            </TextEffect>
            <TextEffect
              per="line"
              preset="fade-in-blur"
              speedSegment={0.3}
              delay={0.45}
              as="p"
              className="mt-8 max-w-2xl text-pretty text-lg leading-relaxed text-workflow-text-muted"
            >
              Siteagent är den smarta agenten som tar samtalet och sätter igång. Du ger riktningen. Den skriver, ritar och visar sidan medan den växer — i en lokal beta.
            </TextEffect>
            <AnimatedGroup
              variants={{
                container: {
                  visible: {
                    transition: {
                      staggerChildren: 0.06,
                      delayChildren: 0.7,
                    },
                  },
                },
                ...transitionVariants,
              }}
              className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
            >
              <Link
                href="/builder"
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Öppna Buildern
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-workflow-border-subtle bg-background/40 px-5 py-2.5 text-sm text-workflow-text-muted transition-colors hover:border-workflow-border hover:text-foreground"
              >
                Logga in
              </Link>
            </AnimatedGroup>
            <HomePrompt />
          </div>

          <div
            className="relative w-full will-change-transform"
            style={{ transform: 'translate3d(var(--near-x), var(--near-y), 0)' }}
          >
            <FormingPreview />
          </div>
        </div>
      </section>

      <section className="bg-transparent pb-16 md:pb-24">
        <AnimatedGroup
          variants={{
            container: {
              visible: {
                transition: {
                  staggerChildren: 0.05,
                  delayChildren: 0.75,
                },
              },
            },
            ...transitionVariants,
          }}
          className="group relative m-auto max-w-6xl px-6"
        >
          <div className="flex flex-col items-center border-y border-workflow-border-subtle md:flex-row">
            <div className="py-5 md:max-w-52 md:border-r md:border-workflow-border-subtle md:pr-8">
              <p className="text-center font-mono text-xs uppercase leading-relaxed tracking-widest text-workflow-text-muted md:text-right">
                Fria händer
                <br />
                En konversation
              </p>
            </div>
            <div className="relative overflow-hidden py-6 md:w-[calc(100%-13rem)]">
              <InfiniteSlider speedOnHover={20} speed={36} gap={64}>
                {[
                  { actor: 'Du', action: 'beskriver sajten' },
                  { actor: 'Siteagent', action: 'ritar strukturen' },
                  { actor: 'Siteagent', action: 'skriver copy' },
                  { actor: 'Du', action: 'ger en mening till' },
                  { actor: 'Siteagent', action: 'visar nästa version' },
                  { actor: 'Du', action: 'kör vidare' },
                ].map(({ actor, action }) => (
                  <span key={action} className="flex items-baseline gap-2 whitespace-nowrap font-mono text-sm">
                    <span className={actor === 'Du' ? 'text-foreground' : 'text-workflow-text-muted'}>{actor}</span>
                    <span aria-hidden className="text-workflow-border-subtle">
                      /
                    </span>
                    <span className="text-workflow-text-muted">{action}</span>
                  </span>
                ))}
              </InfiniteSlider>
              <div className="absolute inset-y-0 left-0 w-20 bg-linear-to-r from-background" />
              <div className="absolute inset-y-0 right-0 w-20 bg-linear-to-l from-background" />
              <ProgressiveBlur
                className="pointer-events-none absolute left-0 top-0 h-full w-20"
                direction="left"
                blurIntensity={1}
              />
              <ProgressiveBlur
                className="pointer-events-none absolute right-0 top-0 h-full w-20"
                direction="right"
                blurIntensity={1}
              />
            </div>
          </div>
        </AnimatedGroup>
      </section>
    </main>
  )
}
