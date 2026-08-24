import {TextEffect} from "@/components/motion-primitives/text-effect";
import React from "react";
import {transitionVariants} from "@/lib/utils";
import {AnimatedGroup} from "@/components/motion-primitives/animated-group";

export default function Agenda() {
    return (
        <section id="sa-fungerar-det" className="scroll-mt-24 scroll-py-16 py-16 md:scroll-py-24 md:py-24">
            <div className="mx-auto max-w-5xl px-6">
                <div className="grid gap-y-12 px-2 lg:grid-cols-[1fr_auto]">
                    <div className="text-center lg:text-left">
                        <TextEffect
                            triggerOnView
                            preset="fade-in-blur"
                            speedSegment={0.3}
                            as="h2"
                            className="mb-4 text-3xl font-semibold md:text-4xl">
                            Så arbetar Sajtmaskin
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
                            <div className="font-medium space-x-2">
                                <span className='text-muted-foreground font-mono '>01</span>
                                <span>Beskriv verksamheten</span>
                            </div>
                            <p className="text-muted-foreground mt-4">Berätta vad ni erbjuder, vem sidan är till för och vilket resultat ni vill nå.</p>
                        </div>
                        <div className="py-6">
                            <div className="font-medium space-x-2">
                                <span className='text-muted-foreground font-mono '>02</span>
                                <span>Granska planen</span>
                            </div>
                            <p className="text-muted-foreground mt-4">Sajtmaskin föreslår struktur och byggval innan den första generationen börjar.</p>
                        </div>
                        <div className="py-6">
                            <div className="font-medium space-x-2">
                                <span className='text-muted-foreground font-mono '>03</span>
                                <span>Se sidan ta form</span>
                            </div>
                            <p className="text-muted-foreground mt-4">Följ bygget i realtid och ge återkoppling direkt i arbetsytan.</p>
                        </div>
                        <div className="py-6">
                            <div className="font-medium space-x-2">
                                <span className='text-muted-foreground font-mono '>04</span>
                                <span>Forma och publicera</span>
                            </div>
                            <p className="text-muted-foreground mt-4">Justera innehåll och layout tills sidan är redo att möta kunderna.</p>
                        </div>
                    </AnimatedGroup>
                </div>
            </div>
        </section>
    )
}
