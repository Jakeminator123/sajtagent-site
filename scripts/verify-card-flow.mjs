import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const modelPath = resolve(root, "system-model/card-flow-v1.json")
const registryPath = resolve(root, "components/siteagent/faces/face-defs.tsx")
const docsPath = resolve(root, "docs/card-flow.md")

const model = JSON.parse(readFileSync(modelPath, "utf8"))
const failures = []

const duplicateValues = (values) => {
  const seen = new Set()
  const duplicates = new Set()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates]
}

if (model.schemaVersion !== 1) failures.push("schemaVersion must be 1")
for (const key of ["nodes", "edges", "views", "registryCards"]) {
  if (!Array.isArray(model[key]) || model[key].length === 0) {
    failures.push(`${key} must be a non-empty array`)
  }
}

const nodeById = new Map(model.nodes.map((node) => [node.id, node]))
const edgeById = new Map(model.edges.map((edge) => [edge.id, edge]))
const knownOwners = new Set(model.owners ?? [])
const knownStatuses = new Set(model.statuses ?? [])
const knownLayers = new Set((model.layers ?? []).map((layer) => layer.id))
for (const [kind, values] of [
  ["node", model.nodes.map((node) => node.id)],
  ["edge", model.edges.map((edge) => edge.id)],
  ["view", model.views.map((view) => view.id)],
  ["failure", model.nodes.map((node) => node.failure?.code)],
]) {
  for (const value of duplicateValues(values)) failures.push(`duplicate ${kind}: ${value}`)
}

for (const node of model.nodes) {
  for (const key of ["id", "label", "kind", "owner", "status", "summary"]) {
    if (typeof node[key] !== "string" || node[key].length === 0) {
      failures.push(`node ${node.id ?? "<missing>"} is missing ${key}`)
    }
  }
  if (!knownOwners.has(node.owner)) failures.push(`node ${node.id} has unknown owner ${node.owner}`)
  if (!knownStatuses.has(node.status)) failures.push(`node ${node.id} has unknown status ${node.status}`)
  if (!knownLayers.has(node.layer)) failures.push(`node ${node.id} has unknown layer ${node.layer}`)
  for (const key of ["code", "symptom", "detectedBy"]) {
    if (typeof node.failure?.[key] !== "string" || node.failure[key].length === 0) {
      failures.push(`node ${node.id} failure is missing ${key}`)
    }
  }
}

for (const edge of model.edges) {
  if (!nodeById.has(edge.from)) failures.push(`edge ${edge.id} has unknown from ${edge.from}`)
  if (!nodeById.has(edge.to)) failures.push(`edge ${edge.id} has unknown to ${edge.to}`)
  if (!(edge.channel in model.channels)) failures.push(`edge ${edge.id} has unknown channel`)
  if (typeof edge.contract !== "string" || edge.contract.length === 0) {
    failures.push(`edge ${edge.id} has no contract`)
  }
}

const hasCycle = (edges) => {
  const adjacency = new Map()
  for (const edge of edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to])
  }
  const visiting = new Set()
  const visited = new Set()
  const visit = (nodeId) => {
    if (visiting.has(nodeId)) return true
    if (visited.has(nodeId)) return false
    visiting.add(nodeId)
    if ((adjacency.get(nodeId) ?? []).some(visit)) return true
    visiting.delete(nodeId)
    visited.add(nodeId)
    return false
  }
  return [...adjacency.keys()].some(visit)
}

for (const view of model.views) {
  if (!["TB", "BT", "LR", "RL"].includes(view.orientation)) {
    failures.push(`view ${view.id} has invalid orientation`)
  }
  const edges = []
  for (const edgeId of view.edgeIds ?? []) {
    if (!edgeById.has(edgeId)) failures.push(`view ${view.id} has unknown edge ${edgeId}`)
    else edges.push(edgeById.get(edgeId))
  }
  if (edges.length === 0) failures.push(`view ${view.id} has no edges`)
  else if (hasCycle(edges)) failures.push(`view ${view.id} must be acyclic`)
}

const registrySource = readFileSync(registryPath, "utf8")
const registryCards = [...registrySource.matchAll(/\{\s*\n\s*id:\s*"([^"]+)"[\s\S]*?\n\s*label:\s*"([^"]+)"/g)].map(
  ([, id, label]) => ({ id, label }),
)
const expectedRegistry = JSON.stringify(model.registryCards)
const actualRegistry = JSON.stringify(registryCards)
if (actualRegistry !== expectedRegistry) {
  failures.push(`card registry drift: expected ${expectedRegistry}, received ${actualRegistry}`)
}

const cardNodes = model.nodes.filter((node) => node.kind === "card")
const modeledRegistryIds = cardNodes.map((node) => node.card?.registryId).sort()
const registryIds = model.registryCards.map((card) => card.id).sort()
if (JSON.stringify(modeledRegistryIds) !== JSON.stringify(registryIds)) {
  failures.push("every registry card must have exactly one card node")
}
const expectedCurrentV1CardIds = ["agent", "blocks", "choices", "map", "versions"]
const actualCurrentV1CardIds = [...(model.currentV1CardIds ?? [])].sort()
if (JSON.stringify(actualCurrentV1CardIds) !== JSON.stringify(expectedCurrentV1CardIds)) {
  failures.push("current registry must contain exactly Byggval, Blocks, Versioner, Karta and Sajtagent")
}
if (JSON.stringify(actualCurrentV1CardIds) !== JSON.stringify(registryIds)) {
  failures.push("currentV1CardIds must match the executable card registry")
}
const expectedTargetCardIds = ["agent", "blocks", "choices", "map", "versions"]
const actualTargetCardIds = [...(model.targetCardIds ?? [])].sort()
if (JSON.stringify(actualTargetCardIds) !== JSON.stringify(expectedTargetCardIds)) {
  failures.push("five-card target must contain exactly Byggval, Blocks, Versioner, Karta and Sajtagent")
}
const retiredCardIds = [...(model.retiredCardIds ?? [])].sort()
if (JSON.stringify(retiredCardIds) !== JSON.stringify(["chat"])) {
  failures.push("Chat must be the only retired card after Sajtagent absorption")
}
if (registryIds.includes("chat") || nodeById.has("card.chat")) {
  failures.push("Chat must not remain in the executable registry or card graph")
}
if (!nodeById.get("card.agent")?.card?.produces?.includes("AgentTurnRequestV1")) {
  failures.push("Sajtagent must produce AgentTurnRequestV1 after absorbing Chat")
}
const targetAbsorptions = model.targetAbsorptions ?? []
if (
  targetAbsorptions.length !== 1 ||
  targetAbsorptions[0]?.from !== "chat" ||
  targetAbsorptions[0]?.into !== "agent" ||
  targetAbsorptions[0]?.status !== "implemented"
) {
  failures.push("Chat-to-Sajtagent absorption must be implemented")
}
if (model.edges.some((edge) => edge.channel === "migration")) {
  failures.push("planned card absorption belongs in targetAbsorptions, not the active V1 graph")
}
for (const edge of model.edges.filter((item) => item.channel === "intent")) {
  const source = nodeById.get(edge.from)
  if (source?.kind === "card" && edge.to !== "ui.intent-adapter") {
    failures.push(`card intent ${edge.id} must target the thin intent adapter`)
  }
}

const mermaidId = (value) => `n_${value.replace(/[^a-zA-Z0-9_]/g, "_")}`
const renderMermaid = (view) => {
  const lines = [`flowchart ${view.orientation}`]
  const emitted = new Set()
  for (const edgeId of view.edgeIds) {
    const edge = edgeById.get(edgeId)
    for (const nodeId of [edge.from, edge.to]) {
      if (emitted.has(nodeId)) continue
      const node = nodeById.get(nodeId)
      lines.push(`    ${mermaidId(nodeId)}["${node.label}<br/>${node.owner} · ${node.status}"]`)
      emitted.add(nodeId)
    }
    lines.push(`    ${mermaidId(edge.from)} -->|"${edge.contract}"| ${mermaidId(edge.to)}`)
  }
  return lines
}

const renderDocs = () => {
  const lines = [
    "# Builderkortens flöde",
    "",
    "<!-- Generated by scripts/verify-card-flow.mjs from system-model/card-flow-v1.json. -->",
    "",
    "Den maskinläsbara modellen skiljer på dagens prototyp och målarkitekturen. `face-defs.tsx` är fortfarande det körbara registret; CI stoppar drift mellan registret och modellen.",
    "",
  ]
  for (const view of model.views) {
    lines.push(`## ${view.label}`, "", "```mermaid", ...renderMermaid(view), "```", "")
  }
  lines.push(
    "## Kortkontrakt",
    "",
    "| Kort | Nu | Mål | Producerar | Konsumerar | Felkod |",
    "| --- | --- | --- | --- | --- | --- |",
  )
  for (const node of cardNodes) {
    lines.push(
      `| ${node.label} | ${node.card.current} | ${node.card.target} | ${node.card.produces.map((value) => `\`${value}\``).join("<br/>") || "-"} | ${node.card.consumes.map((value) => `\`${value}\``).join("<br/>") || "-"} | \`${node.failure.code}\` |`,
    )
  }
  lines.push(
    "",
    "## Beslut som tester låser",
    "",
    "- Det körbara registret har fem kort: Byggval, Blocks, Versioner, Karta och Sajtagent.",
    "- Chat är absorberad av Sajtagent och retired; användaren skriver och läser i samma kort.",
    "- Sajtagent är konversationen: inmatning, svar, fråga och felsäker runtime-status.",
    "- Byggval kan öppnas bredvid dialogen eller vikas ned utan att ändra meddelandevägen.",
    "- Browserkort skapar endast `AgentTurnRequestV1`; inga OpenClaw-, MCP- eller verktygsnamn får läcka in i kortkontraktet.",
    "- En Site-policy kan ge högst en `build.request` och en mutationstyp; browserkortet kan aldrig skapa jobb eller utöka policyn.",
    "- Versioner och Karta projicerar verifierad produktstate och får inte deklarera framgång från råa modell- eller OpenClaw-events.",
    "",
    "Ändra `system-model/card-flow-v1.json`, kör `npm run cards:docs`, och verifiera sedan med `npm run cards:check`.",
    "",
  )
  return lines.join("\n")
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`)
  process.exit(1)
}

const expectedDocs = renderDocs()
if (process.argv.includes("--write")) {
  writeFileSync(docsPath, expectedDocs, "utf8")
  console.log("Wrote docs/card-flow.md")
} else {
  const actualDocs = readFileSync(docsPath, "utf8")
  if (actualDocs !== expectedDocs) {
    console.error("FAIL docs/card-flow.md is stale; run npm run cards:docs")
    process.exit(1)
  }
}

console.log(`PASS card flow v1: ${model.nodes.length} nodes, ${model.edges.length} edges, ${model.views.length} views`)
