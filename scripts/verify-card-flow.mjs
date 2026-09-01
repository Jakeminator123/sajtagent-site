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
const expectedTargetCardIds = ["agent", "blocks", "chat", "choices", "map", "versions"]
const actualTargetCardIds = [...(model.targetCardIds ?? [])].sort()
if (JSON.stringify(actualTargetCardIds) !== JSON.stringify(expectedTargetCardIds)) {
  failures.push("V1 target must contain exactly Byggval, Chat, Blocks, Versioner, Karta and Sajtagent")
}
if (!Array.isArray(model.retiredCardIds) || model.retiredCardIds.length !== 0) {
  failures.push("V1 must not retire any of its six cards")
}
if (!registryIds.includes("chat") || !nodeById.has("card.chat")) {
  failures.push("V1 Chat must remain in both the executable registry and card graph")
}
if (model.edges.some((edge) => edge.channel === "migration")) {
  failures.push("completed card migration must not remain as an active edge")
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
    "- Det körbara V1-registret har sex kort: Byggval, Chat, Blocks, Versioner, Karta och Sajtagent.",
    "- Chat är den primära användar-till-OpenClaw-dialogen; Byggval kan ligga bredvid eller vikas ned.",
    "- Sajtagent visar identitet, produktstate och säkerhetsgräns utan att absorbera Chat.",
    "- Browserkort skapar endast `BuilderIntentV1`; inga OpenClaw-, MCP- eller verktygsnamn får läcka in i kortkontraktet.",
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
