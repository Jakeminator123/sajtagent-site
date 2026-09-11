import { TextEffect } from '@/components/motion-primitives/text-effect'
import React from 'react'
import { transitionVariants } from '@/lib/utils'
import { AnimatedGroup } from '@/components/motion-primitives/animated-group'

export default function Agenda() {
  return (
    <section id="sa-fungerar-det" className="scroll-mt-24 scroll-py-16 py-16 md:scroll-py-32 md:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-y-12 px-2 lg:grid-cols-[1fr_auto]">
          <div className="text-center lg:text-left">
            <TextEffect
              triggerOnView
              preset="fade-in-blur"
              speedSegment={0.3}
              as="h2"
              className="mb-4 text-3xl font-semibold md:text-4xl"
            >
              Så arbetar Siteagent
            </TextEffect>
          </div>

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
            className="divide-y divide-dashed sm:mx-auto sm:max-w-lg lg:mx-0"
          >
            <div className="pb-6">
              <div className="space-x-2 font-medium">
                <span className="font-mono text-muted-foreground">01</span>
                <span>Beskriv sajten</span>
              </div>
              <p className="mt-4 text-muted-foreground">
                Berätta vad sidan ska göra, kännas som och innehålla. En mening räcker för att sätta igång.
              </p>
            </div>
            <div className="py-6">
              <div className="space-x-2 font-medium">
                <span className="font-mono text-muted-foreground">02</span>
                <span>Se den ta form</span>
              </div>
              <p className="mt-4 text-muted-foreground">
                Siteagent ritar struktur, skriver copy och visar preview i samma samtal.
              </p>
            </div>
            <div className="py-6">
              <div className="space-x-2 font-medium">
                <span className="font-mono text-muted-foreground">03</span>
                <span>Forma vidare</span>
              </div>
              <p className="mt-4 text-muted-foreground">
                Justera med en mening. Agenten gör om, du kör vidare.
              </p>
            </div>
          </AnimatedGroup>
        </div>
      </div>
    </section>
  )
}
