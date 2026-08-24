"use client"

// Registret över tärningens sex sidor.
// column: vilken sida av scenen ytan öppnas på.

import type React from "react"
import { Blocks, Bot, Clock, Map, MessageSquare, SlidersHorizontal } from "lucide-react"
import { BuildChoicesFace } from "./build-choices-face"
import { ChatFace } from "./chat-face"
import { VersionsFace } from "./versions-face"
import { BlocksFace } from "./blocks-face"
import { AgentFace } from "./agent-face"
import { SitemapFace } from "./sitemap-face"
import { BlankBack, EngineBack, LogBack } from "./back-faces"

export type FaceId = "choices" | "chat" | "versions" | "blocks" | "map" | "agent"

export interface FaceDef {
  id: FaceId
  label: string
  icon: React.ComponentType<{ className?: string }>
  accent: string // header-textfärg
  edge: string // kantfärg på öppen yta
  column: "left" | "right"
  height: number // öppen höjd i px
  Component: React.ComponentType
  /** Baksida — gör kortet flippbart (180°) */
  Back?: React.ComponentType
  /** Rubrik på baksidan */
  backLabel?: string
}

export const FACES: FaceDef[] = [
  {
    id: "choices",
    label: "Byggval",
    icon: SlidersHorizontal,
    accent: "text-zinc-600 dark:text-zinc-300",
    edge: "border-zinc-500/50",
    column: "left",
    height: 380,
    Component: BuildChoicesFace,
    Back: EngineBack,
    backLabel: "Motorn",
  },
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
    accent: "text-blue-600 dark:text-blue-400",
    edge: "border-blue-500/50",
    column: "left",
    height: 440,
    Component: ChatFace,
    Back: LogBack,
    backLabel: "Logg",
  },
  {
    id: "versions",
    label: "Versioner",
    icon: Clock,
    accent: "text-emerald-600 dark:text-emerald-400",
    edge: "border-emerald-500/50",
    column: "right",
    height: 320,
    Component: VersionsFace,
  },
  {
    id: "blocks",
    label: "Blocks",
    icon: Blocks,
    accent: "text-amber-600 dark:text-amber-400",
    edge: "border-amber-500/50",
    column: "right",
    height: 300,
    Component: BlocksFace,
    Back: BlankBack,
    backLabel: "Baksida",
  },
  {
    id: "map",
    label: "Karta",
    icon: Map,
    accent: "text-violet-600 dark:text-violet-400",
    edge: "border-violet-500/50",
    column: "right",
    height: 280,
    Component: SitemapFace,
  },
  {
    id: "agent",
    label: "Sajtagenten",
    icon: Bot,
    accent: "text-rose-600 dark:text-rose-400",
    edge: "border-rose-500/50",
    column: "right",
    height: 380,
    Component: AgentFace,
  },
]
