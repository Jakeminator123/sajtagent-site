import React from 'react'
import { InfiniteSlider } from '@/components/ui/infinite-slider'
import { ProgressiveBlur } from '@/components/ui/progressive-blur'
import { TextEffect } from "@/components/motion-primitives/text-effect";
import { AnimatedGroup } from "@/components/motion-primitives/animated-group";
import DecryptedText from "@/components/DecryptedText";
import { transitionVariants } from "@/lib/utils";
import LanyardWithControls from "@/components/lanyard-with-controls";
import { HomePrompt } from "@/components/home-prompt";
import { LandingHeader } from "@/components/landing-header";

export default function HeroSection() {
    return (
        <main className="overflow-x-hidden">
            <LandingHeader />
            <section id="top" className='lg:min-h-screen'>
                <div
                    className="pb-24 pt-12 md:pb-32 lg:pb-56 lg:pt-44 lg:grid lg:grid-cols-2 lg:grid-rows-1 grid-cols-1 grid-rows-2">
                    <div className="relative mx-auto flex max-w-xl flex-col px-6 lg:block">
                        <div id="skapa" className="mx-auto max-w-2xl scroll-mt-28 text-center lg:ml-0 lg:text-left">
                            <div className='mt-8 lg:mt-16'>
                                <DecryptedText
                                    text="AI-STUDIO FÖR SVENSKA FÖRETAG"
                                    animateOn="view"
                                    revealDirection="start"
                                    sequential
                                    useOriginalCharsOnly={false}
                                    speed={70}
                                    className='rounded-md bg-workflow-node-input px-1 font-mono text-workflow-text-muted uppercase'
                                />
                            </div>
                            <TextEffect
                                preset="fade-in-blur"
                                speedSegment={0.3}
                                as="h1"
                                className="max-w-2xl text-balance text-6xl font-semibold md:text-7xl xl:text-8xl">
                                Från idé till
                            </TextEffect>
                            <TextEffect
                                preset="fade-in-blur"
                                speedSegment={0.3}
                                as="h1"
                                className="max-w-2xl text-balance text-6xl font-semibold md:text-7xl xl:text-8xl">
                                färdig webbplats
                            </TextEffect>
                            <TextEffect
                                per="line"
                                preset="fade-in-blur"
                                speedSegment={0.3}
                                delay={0.5}
                                as="p"
                                className="mt-8 max-w-2xl text-pretty text-lg leading-relaxed text-workflow-text-muted">
                                Maskinen skriver, skissar och bygger. Du styr, stryker och godkänner. Halvautomatiskt på riktigt — ingen sida lämnar Sajtmaskin utan att en människa har tittat på den.
                            </TextEffect>
                            <HomePrompt />
                        </div>
                    </div>
                    <LanyardWithControls
                        position={[0, 0, 20]}
                        containerClassName='lg:absolute lg:top-0 lg:right-0 lg:w-1/2 relative w-full h-screen bg-radial lg:from-transparent lg:to-transparent from-muted to-background select-none'
                        defaultName="" />
                </div>
            </section>
            <section className="bg-background pb-16 md:pb-32">
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
                            <p className="text-center font-mono text-xs uppercase leading-relaxed tracking-widest text-workflow-text-muted md:text-right">Maskinen turas om<br />med människan</p>
                        </div>
                        <div className="relative overflow-hidden py-6 md:w-[calc(100%-13rem)]">
                            <InfiniteSlider speedOnHover={20} speed={36} gap={64}>
                                {[
                                    { actor: 'Maskin', action: 'läser din bransch' },
                                    { actor: 'Du', action: 'rättar det som inte stämmer' },
                                    { actor: 'Maskin', action: 'skriver texten och bygger sidan' },
                                    { actor: 'Du', action: 'stryker, flyttar, skärper tonen' },
                                    { actor: 'Maskin', action: 'gör om på tio sekunder' },
                                    { actor: 'Du', action: 'säger när den är klar' },
                                ].map(({ actor, action }) => (
                                    <span key={action} className="flex items-baseline gap-2 whitespace-nowrap font-mono text-sm">
                                        <span className={actor === 'Du' ? 'text-foreground' : 'text-workflow-text-muted'}>{actor}</span>
                                        <span aria-hidden className="text-workflow-border-subtle">/</span>
                                        <span className="text-workflow-text-muted">{action}</span>
                                    </span>
                                ))}
                            </InfiniteSlider>
                            <div className="bg-linear-to-r from-background absolute inset-y-0 left-0 w-20" />
                            <div className="bg-linear-to-l from-background absolute inset-y-0 right-0 w-20" />
                            <ProgressiveBlur className="pointer-events-none absolute left-0 top-0 h-full w-20" direction="left" blurIntensity={1} />
                            <ProgressiveBlur className="pointer-events-none absolute right-0 top-0 h-full w-20" direction="right" blurIntensity={1} />
                        </div>
                    </div>
                </AnimatedGroup>
            </section>
        </main>
    )
}
