"use client"

// Canvas-ytan: tre förkopplade, flyttbara (ej raderbara) noder.
// Byggval -> Chat -> Preview. Minimappen är ersatt av AgentWidget.

import React, { useEffect, useMemo, useState } from "react"
import { useTheme } from "next-themes"
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeTypes,
  useReactFlow,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { BuildChoicesNode } from "./nodes/build-choices-node"
import { ChatNode } from "./nodes/chat-node"
import { PreviewNode } from "./nodes/preview-node"
import { AgentWidget } from "./agent-widget"

const nodeTypes: NodeTypes = {
  buildChoices: BuildChoicesNode,
  chat: ChatNode,
  preview: PreviewNode,
}

const initialNodes: Node[] = [
  {
    id: "choices",
    type: "buildChoices",
    position: { x: 0, y: 40 },
    data: {},
    deletable: false,
  },
  {
    id: "chat",
    type: "chat",
    position: { x: 420, y: 60 },
    data: {},
    deletable: false,
  },
  {
    id: "preview",
    type: "preview",
    position: { x: 900, y: 0 },
    data: {},
    deletable: false,
  },
]

const initialEdges: Edge[] = [
  { id: "choices-chat", source: "choices", target: "chat", animated: true, deletable: false },
  { id: "chat-preview", source: "chat", target: "preview", animated: true, deletable: false },
]

// Re-fittar vyn när canvasytan ändrar bredd (t.ex. när högerdrawern togglas).
function AutoRefit({ drawerOpen }: { drawerOpen: boolean }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    const t = setTimeout(() => {
      fitView({ padding: 0.2, maxZoom: 0.9, duration: 300 })
    }, 50)
    return () => clearTimeout(t)
  }, [drawerOpen, fitView])
  return null
}

export function BuilderCanvas({ drawerOpen = false }: { drawerOpen?: boolean }) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted ? resolvedTheme === "dark" : true

  const themedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        style: { strokeWidth: 2, stroke: isDark ? "#52525b" : "#a1a1aa" },
      })),
    [edges, isDark]
  )

  return (
    <div className="relative flex-1 h-full transition-colors duration-200">
      <ReactFlow
        nodes={nodes}
        edges={themedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 0.9 }}
        snapToGrid
        snapGrid={[16, 16]}
        nodesConnectable={false}
        deleteKeyCode={null}
        className="bg-workflow-bg transition-colors duration-200"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color={isDark ? "#27272a" : "#d4d4d8"}
        />
        <Controls showInteractive={false} position="bottom-left" />
        <AutoRefit drawerOpen={drawerOpen} />
      </ReactFlow>

      <AgentWidget />
    </div>
  )
}
