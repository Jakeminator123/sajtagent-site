import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { TextEffect } from './motion-primitives/text-effect'
import { AnimatedGroup } from '@/components/motion-primitives/animated-group'
import { transitionVariants } from '@/lib/utils'

export default function CallToAction() {
  return (
    <section className="mx-2 py-16">
      <div
        className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-workflow-border-subtle px-6 py-12 md:py-20 lg:py-28"
        style={{ transform: 'translate3d(var(--mid-x), calc(var(--mid-y) * 0.4), 0)' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(520px circle at var(--spot-x) var(--spot-y), hsl(219 100% 60% / 0.12), transparent 55%)',
          }}
        />
        <div className="relative text-center">
          <TextEffect
            triggerOnView
            preset="fade-in-blur"
            speedSegment={0.3}
            as="h2"
            className="text-balance text-4xl font-semibold lg:text-5xl"
          >
            Ge agenten något att bygga.
          </TextEffect>
          <TextEffect
            triggerOnView
            preset="fade-in-blur"
            speedSegment={0.3}
            delay={0.3}
            as="p"
            className="mt-4 text-muted-foreground"
          >
            Öppna Buildern och skriv första meningen. Siteagent tar det därifrån.
          </TextEffect>
          <AnimatedGroup
            triggerOnView
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
            className="mt-12 flex flex-wrap justify-center gap-4"
          >
            <Button asChild size="lg">
              <Link href="/builder">
                <span>Öppna Buildern</span>
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">
                <span>Logga in</span>
              </Link>
            </Button>
          </AnimatedGroup>
        </div>
      </div>
    </section>
  )
}
