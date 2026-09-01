"use client"

import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clipboard,
  Download,
  FileCode2,
  Network,
  Package,
  PlugZap,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Upload,
  Wrench,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  AgentProfileV1Schema,
  AgentProfileCompileProjectionV1Schema,
  DEFAULT_AGENT_PROFILE_V1,
  DEFAULT_LOCAL_AGENT_CEILING_V1,
  compilePortableOpenClawBundleV1,
  type AgentCommandModeV1,
  type AgentProfileV1,
  type ExecutionCapabilityV1,
} from "@/contracts/agent-profile-v1"

const STORAGE_KEY = "siteagent.agent-profile-v1"

const CAPABILITIES: Array<{
  id: ExecutionCapabilityV1
  title: string
  description: string
}> = [
  {
    id: "workspace.read",
    title: "Läsa workspace",
    description: "Läsa projektfiler och förstå befintlig struktur.",
  },
  {
    id: "workspace.write",
    title: "Skriva filer",
    description: "Skapa och ändra filer i tilldelat workspace.",
  },
  {
    id: "workspace.apply_patch",
    title: "Applicera patchar",
    description: "Göra avgränsade, granskningsbara kodändringar.",
  },
  {
    id: "command.execute",
    title: "Köra kommandon",
    description: "Köra hostkommandon genom vald godkännandepolicy.",
  },
  {
    id: "checks.run",
    title: "Köra kontroller",
    description: "Lint, tester, typecheck och andra verifieringar.",
  },
  {
    id: "browser.inspect",
    title: "Inspektera i browser",
    description: "Kontrollera verklig UI- och preview-status.",
  },
  {
    id: "preview.manage",
    title: "Hantera privat preview",
    description: "Starta och verifiera en privat previewtjänst.",
  },
  {
    id: "packages.install",
    title: "Installera paket",
    description: "Endast paket som uttryckligen står i allowlisten.",
  },
]

const COMMAND_MODES: Array<{
  id: AgentCommandModeV1
  title: string
  description: string
}> = [
  { id: "deny", title: "Neka", description: "Inga hostkommandon." },
  {
    id: "allowlist",
    title: "Allowlist",
    description: "Bara redan godkända kommandon.",
  },
  {
    id: "ask",
    title: "Fråga",
    description: "Fråga en människa när ett kommando saknas.",
  },
  {
    id: "auto",
    title: "Auto-review",
    description: "Säker auto-review, därefter mänsklig fråga.",
  },
]

type RuntimeState =
  | { kind: "idle"; message: string }
  | { kind: "checking"; message: string }
  | { kind: "ready"; message: string }
  | { kind: "error"; message: string }

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function commaOrLines(value: string): string[] {
  return value
    .split(/[\r\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function FieldLabel({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-foreground">{title}</span>
      {hint ? <span className="text-xs leading-5 text-muted-foreground">{hint}</span> : null}
      {children}
    </label>
  )
}

function PolicyToggle({
  checked,
  title,
  description,
  onCheckedChange,
}: {
  checked: boolean
  title: string
  description: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card/60 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={title} />
    </div>
  )
}

export function AgentStudio() {
  const [profile, setProfile] = useState<AgentProfileV1>(DEFAULT_AGENT_PROFILE_V1)
  const [storageReady, setStorageReady] = useState(false)
  const [saveMessage, setSaveMessage] = useState("Inte sparad i den här browsern ännu")
  const [copied, setCopied] = useState(false)
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({
    kind: "idle",
    message: "Site ansluter till runtime först när du provar en giltig profil.",
  })
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) {
        try {
          const parsed = AgentProfileV1Schema.safeParse(JSON.parse(stored))
          if (parsed.success) {
            setProfile(parsed.data)
            setSaveMessage(`Lokal revision ${parsed.data.revision} laddad`)
          } else {
            setSaveMessage("Sparad profil var ogiltig och lämnades orörd")
          }
        } catch {
          setSaveMessage("Sparad profil kunde inte läsas och lämnades orörd")
        }
      }
      setStorageReady(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const validation = useMemo(() => AgentProfileV1Schema.safeParse(profile), [profile])
  const bundle = useMemo(
    () =>
      validation.success
        ? compilePortableOpenClawBundleV1(
            validation.data,
            DEFAULT_LOCAL_AGENT_CEILING_V1,
          )
        : null,
    [validation],
  )
  const exportText = useMemo(
    () =>
      bundle
        ? JSON.stringify(
            {
              schemaVersion: 1,
              exportedAt: profile.updatedAt,
              profile,
              effectivePolicy: bundle.effectivePolicy,
              files: bundle.files,
              hostConfig: bundle.hostConfig,
            },
            null,
            2,
          )
        : "Profilen måste vara giltig innan den kan exporteras.",
    [bundle, profile],
  )

  const updateRequestedPolicy = (
    updater: (policy: AgentProfileV1["requestedPolicy"]) => AgentProfileV1["requestedPolicy"],
  ) => {
    setProfile((current) => ({
      ...current,
      requestedPolicy: updater(current.requestedPolicy),
    }))
  }

  const toggleCapability = (capability: ExecutionCapabilityV1, enabled: boolean) => {
    updateRequestedPolicy((policy) => {
      const capabilities = enabled
        ? Array.from(new Set([...policy.capabilities, capability]))
        : policy.capabilities.filter((item) => item !== capability)
      const next = { ...policy, capabilities }

      if (capability === "command.execute" && !enabled) {
        next.commandMode = "deny"
      }
      if (capability === "packages.install") {
        next.packages = enabled
          ? { mode: "allowlist", allowedPackages: ["zod"] }
          : { mode: "deny" }
      }
      return next
    })
  }

  const saveLocally = () => {
    if (!validation.success) return
    const next = {
      ...validation.data,
      revision: validation.data.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setProfile(next)
    setSaveMessage(`Revision ${next.revision} sparad lokalt ${new Date().toLocaleTimeString("sv-SE")}`)
  }

  const resetProfile = () => {
    const next = {
      ...DEFAULT_AGENT_PROFILE_V1,
      updatedAt: new Date().toISOString(),
    }
    setProfile(next)
    setSaveMessage("Grundprofil återställd men ännu inte sparad")
  }

  const downloadProfile = () => {
    if (!bundle) return
    const blob = new Blob([exportText], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${profile.profileId}-agent-profile-v1.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const copyProfile = async () => {
    if (!bundle) return
    await navigator.clipboard.writeText(exportText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_500)
  }

  const importProfile = async (file: File | undefined) => {
    if (!file) return
    try {
      const candidate = JSON.parse(await file.text()) as unknown
      const wrapped =
        typeof candidate === "object" && candidate !== null && "profile" in candidate
          ? (candidate as { profile: unknown }).profile
          : candidate
      const parsed = AgentProfileV1Schema.safeParse(wrapped)
      if (!parsed.success) {
        setSaveMessage(`Import stoppad: ${parsed.error.issues[0]?.message ?? "ogiltig profil"}`)
        return
      }
      setProfile(parsed.data)
      setSaveMessage(`Revision ${parsed.data.revision} importerad men ännu inte sparad`)
    } catch {
      setSaveMessage("Import stoppad: filen innehåller inte giltig JSON")
    } finally {
      if (importRef.current) importRef.current.value = ""
    }
  }

  const compileInRuntime = async () => {
    if (!validation.success) return
    setRuntimeState({ kind: "checking", message: "Kompilerar profilen mot runtime-hostens tak…" })
    try {
      const response = await fetch("/api/siteagent/agent-profiles/compile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: validation.data }),
        credentials: "same-origin",
        signal: AbortSignal.timeout(6_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const compiled = AgentProfileCompileProjectionV1Schema.parse(await response.json())
      setRuntimeState({
        kind: "ready",
        message: `Profilen kompilerades med ${compiled.capabilityCount} capabilities och ${compiled.findingCount} begränsningar. Runtime-läge: ${compiled.runtime.mode}. Inget byggjobb startades.`,
      })
    } catch (error) {
      setRuntimeState({
        kind: "error",
        message:
          error instanceof Error
            ? `Runtime-kompilering misslyckades: ${error.message}`
            : "Runtime-kompilering misslyckades.",
      })
    }
  }

  const validationMessages = validation.success
    ? []
    : validation.error.issues.slice(0, 6).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }))

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/builder">
                <ArrowLeft /> Builder
              </Link>
            </Button>
            <div className="hidden h-8 w-px bg-border sm:block" />
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-brand-teal" />
                <h1 className="text-sm font-semibold tracking-tight">Agent Studio</h1>
                <Badge variant="outline" className="border-brand-teal/40 text-brand-teal">
                  lokal profil
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Forma önskemål här. Runtime- och jobbpolicyn bestämmer slutlig behörighet.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={resetProfile}>
              <RotateCcw />
              <span className="hidden sm:inline">Återställ</span>
            </Button>
            <Button size="sm" onClick={saveLocally} disabled={!validation.success || !storageReady}>
              <Save /> Spara lokalt
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:px-8">
        <section className="min-w-0">
          <Tabs defaultValue="soul">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 lg:grid-cols-5">
              <TabsTrigger value="soul">Själ</TabsTrigger>
              <TabsTrigger value="rights">Rättigheter</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="budgets">Budget</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>

            <TabsContent value="soul" className="space-y-5 pt-4">
              <div className="grid gap-5 rounded-2xl border border-border bg-card p-5 md:grid-cols-[1fr_100px]">
                <FieldLabel title="Namn">
                  <Input
                    value={profile.identity.name}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        identity: { ...current.identity, name: event.target.value },
                      }))
                    }
                  />
                </FieldLabel>
                <FieldLabel title="Symbol">
                  <Input
                    value={profile.identity.emoji}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        identity: { ...current.identity, emoji: event.target.value },
                      }))
                    }
                  />
                </FieldLabel>
                <div className="md:col-span-2">
                  <FieldLabel title="Kort beskrivning">
                    <Input
                      value={profile.identity.description}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          identity: { ...current.identity, description: event.target.value },
                        }))
                      }
                    />
                  </FieldLabel>
                </div>
              </div>

              <div className="grid gap-5 rounded-2xl border border-border bg-card p-5">
                <FieldLabel title="Syfte" hint="Vad agenten ytterst ska optimera för.">
                  <Textarea
                    rows={3}
                    value={profile.soul.purpose}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        soul: { ...current.soul, purpose: event.target.value },
                      }))
                    }
                  />
                </FieldLabel>
                <FieldLabel title="Personlighet">
                  <Textarea
                    rows={3}
                    value={profile.soul.personality}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        soul: { ...current.soul, personality: event.target.value },
                      }))
                    }
                  />
                </FieldLabel>
                <FieldLabel title="Röst och ton">
                  <Textarea
                    rows={2}
                    value={profile.soul.voice}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        soul: { ...current.soul, voice: event.target.value },
                      }))
                    }
                  />
                </FieldLabel>
                <div className="grid gap-5 md:grid-cols-2">
                  <FieldLabel title="Principer" hint="En princip per rad.">
                    <Textarea
                      rows={7}
                      value={profile.soul.principles.join("\n")}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          soul: { ...current.soul, principles: lines(event.target.value) },
                        }))
                      }
                    />
                  </FieldLabel>
                  <FieldLabel title="Får aldrig" hint="En tydlig gräns per rad.">
                    <Textarea
                      rows={7}
                      value={profile.soul.prohibitions.join("\n")}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          soul: { ...current.soul, prohibitions: lines(event.target.value) },
                        }))
                      }
                    />
                  </FieldLabel>
                </div>
                <FieldLabel
                  title="Operativa instruktioner"
                  hint="Arbetssätt och kvalitetskrav. Behörighet sätts separat nedan."
                >
                  <Textarea
                    rows={7}
                    className="font-mono text-xs leading-5"
                    value={profile.operatingInstructions}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        operatingInstructions: event.target.value,
                      }))
                    }
                  />
                </FieldLabel>
              </div>
            </TabsContent>

            <TabsContent value="rights" className="space-y-5 pt-4">
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-5 flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-5 text-brand-teal" />
                  <div>
                    <h2 className="font-semibold">Önskade capabilities</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Detta är profilens önskemål. BuildJob och hostpolicy kan alltid minska dem.
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {CAPABILITIES.map((capability) => (
                    <PolicyToggle
                      key={capability.id}
                      checked={profile.requestedPolicy.capabilities.includes(capability.id)}
                      title={capability.title}
                      description={capability.description}
                      onCheckedChange={(checked) => toggleCapability(capability.id, checked)}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-4 flex items-start gap-3">
                  <TerminalSquare className="mt-0.5 size-5 text-brand-blue" />
                  <div>
                    <h2 className="font-semibold">Kommandogodkännande</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Läget full finns avsiktligt inte i produktprofilen.
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {COMMAND_MODES.map((mode) => {
                    const selected = profile.requestedPolicy.commandMode === mode.id
                    const disabled =
                      mode.id !== "deny" &&
                      !profile.requestedPolicy.capabilities.includes("command.execute")
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          updateRequestedPolicy((policy) => ({
                            ...policy,
                            commandMode: mode.id,
                          }))
                        }
                        className={`rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          selected
                            ? "border-brand-blue bg-brand-blue/10"
                            : "border-border bg-background hover:border-brand-blue/50"
                        }`}
                      >
                        <span className="text-sm font-medium">{mode.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {mode.description}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="tools" className="space-y-5 pt-4">
              <div className="grid gap-5 rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  <Wrench className="mt-0.5 size-5 text-brand-amber" />
                  <div>
                    <h2 className="font-semibold">MCP-verktyg</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Skriv konkreta genererade tool-id:n, exempelvis server__tool. De blir inte
                      aktiva förrän runtime-hostens registry också godkänner dem.
                    </p>
                  </div>
                </div>
                <FieldLabel title="Begärda MCP-tool-id:n" hint="Kommaseparerade eller ett per rad.">
                  <Textarea
                    rows={5}
                    className="font-mono text-xs"
                    placeholder="github__list_issues"
                    value={profile.requestedPolicy.mcpToolGrants.join("\n")}
                    onChange={(event) =>
                      updateRequestedPolicy((policy) => ({
                        ...policy,
                        mcpToolGrants: commaOrLines(event.target.value),
                      }))
                    }
                  />
                </FieldLabel>
              </div>

              <div className="grid gap-5 rounded-2xl border border-border bg-card p-5 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Network className="mt-0.5 size-5 text-brand-teal" />
                    <div>
                      <h2 className="font-semibold">Nätverk</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Ingen wildcard eller URL tillåts.</p>
                    </div>
                  </div>
                  <PolicyToggle
                    checked={profile.requestedPolicy.network.mode === "allowlist"}
                    title="Aktivera allowlist"
                    description="All annan utgående trafik nekas."
                    onCheckedChange={(checked) =>
                      updateRequestedPolicy((policy) => ({
                        ...policy,
                        network: checked
                          ? { mode: "allowlist", allowedHosts: ["github.com"] }
                          : { mode: "deny-all" },
                      }))
                    }
                  />
                  {profile.requestedPolicy.network.mode === "allowlist" ? (
                    <FieldLabel title="Tillåtna hosts" hint="En host per rad, utan https://.">
                      <Textarea
                        rows={6}
                        className="font-mono text-xs"
                        value={profile.requestedPolicy.network.allowedHosts.join("\n")}
                        onChange={(event) =>
                          updateRequestedPolicy((policy) => ({
                            ...policy,
                            network: { mode: "allowlist", allowedHosts: lines(event.target.value) },
                          }))
                        }
                      />
                    </FieldLabel>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Package className="mt-0.5 size-5 text-brand-warm" />
                    <div>
                      <h2 className="font-semibold">Paket</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Capability och allowlist följs åt.</p>
                    </div>
                  </div>
                  <PolicyToggle
                    checked={profile.requestedPolicy.capabilities.includes("packages.install")}
                    title="Tillåt paketinstallation"
                    description="Endast namngivna paket kan installeras."
                    onCheckedChange={(checked) => toggleCapability("packages.install", checked)}
                  />
                  {profile.requestedPolicy.packages.mode === "allowlist" ? (
                    <FieldLabel title="Tillåtna paket" hint="Ett npm-paket per rad.">
                      <Textarea
                        rows={6}
                        className="font-mono text-xs"
                        value={profile.requestedPolicy.packages.allowedPackages.join("\n")}
                        onChange={(event) =>
                          updateRequestedPolicy((policy) => ({
                            ...policy,
                            packages: {
                              mode: "allowlist",
                              allowedPackages: lines(event.target.value),
                            },
                          }))
                        }
                      />
                    </FieldLabel>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-border bg-card p-5 md:grid-cols-2">
                <PolicyToggle
                  checked={profile.requestedPolicy.memory.enabled}
                  title="Arbetsminne"
                  description="Låt profilen använda workspace-minne under arbetet."
                  onCheckedChange={(checked) =>
                    updateRequestedPolicy((policy) => ({
                      ...policy,
                      memory: {
                        enabled: checked,
                        rememberAcrossConversations:
                          checked && policy.memory.rememberAcrossConversations,
                      },
                    }))
                  }
                />
                <PolicyToggle
                  checked={profile.requestedPolicy.memory.rememberAcrossConversations}
                  title="Minne mellan konversationer"
                  description="Begärs här men är blockerat i lokal standard-hostpolicy."
                  onCheckedChange={(checked) =>
                    updateRequestedPolicy((policy) => ({
                      ...policy,
                      memory: {
                        enabled: checked || policy.memory.enabled,
                        rememberAcrossConversations: checked,
                      },
                    }))
                  }
                />
              </div>
            </TabsContent>

            <TabsContent value="budgets" className="pt-4">
              <div className="grid gap-5 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
                {(
                  [
                    ["maxSteps", "Max steg", "Antal agentsteg per körning."],
                    ["maxToolCalls", "Max tool calls", "Alla verktygsanrop sammanlagt."],
                    ["maxModelTokens", "Max modelltokens", "Hård tokenbudget för körningen."],
                    ["maxCostMicros", "Max kostnad, micros", "Produktens övre kostnadsgräns."],
                  ] as const
                ).map(([key, title, hint]) => (
                  <FieldLabel key={key} title={title} hint={hint}>
                    <Input
                      type="number"
                      min={0}
                      value={profile.requestedPolicy.budgets[key]}
                      onChange={(event) =>
                        updateRequestedPolicy((policy) => ({
                          ...policy,
                          budgets: {
                            ...policy.budgets,
                            [key]: Number.parseInt(event.target.value || "0", 10),
                          },
                        }))
                      }
                    />
                  </FieldLabel>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="export" className="space-y-5 pt-4">
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Portabel AgentProfileV1-bundle</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Innehåller profilen och genererade filer, aldrig credentials.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={importRef}
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(event) => void importProfile(event.target.files?.[0])}
                    />
                    <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}>
                      <Upload /> Importera
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void copyProfile()} disabled={!bundle}>
                      {copied ? <Check /> : <Clipboard />}
                      {copied ? "Kopierad" : "Kopiera"}
                    </Button>
                    <Button size="sm" onClick={downloadProfile} disabled={!bundle}>
                      <Download /> Ladda ned
                    </Button>
                  </div>
                </div>
                <Textarea
                  readOnly
                  value={exportText}
                  className="mt-5 min-h-[480px] font-mono text-[11px] leading-5"
                  aria-label="Exporterad AgentProfileV1-bundle"
                />
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-4 flex items-start gap-3">
                  <PlugZap className="mt-0.5 size-5 text-brand-blue" />
                  <div>
                    <h2 className="font-semibold">Privat OpenClaw-adapter</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Browsern anropar endast Site. Site autentiserar begäran och signerar
                      runtime-anropet server-side; runtime-URL och nyckel lämnar aldrig servern.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button onClick={() => void compileInRuntime()} disabled={!validation.success || runtimeState.kind === "checking"}>
                    <Wrench /> Prova profil
                  </Button>
                </div>
                <p
                  className={`mt-3 text-sm ${
                    runtimeState.kind === "ready"
                      ? "text-brand-teal"
                      : runtimeState.kind === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  {runtimeState.message}
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-black/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Effektiv profil
                </p>
                <h2 className="mt-2 text-xl font-semibold">
                  {profile.identity.emoji} {profile.identity.name}
                </h2>
              </div>
              {validation.success ? (
                <CheckCircle2 className="size-5 text-brand-teal" />
              ) : (
                <AlertTriangle className="size-5 text-destructive" />
              )}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {profile.identity.description}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {bundle?.effectivePolicy.capabilities.map((capability) => (
                <Badge key={capability} variant="secondary" className="font-mono text-[10px]">
                  {capability}
                </Badge>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-5 text-xs">
              <div>
                <p className="text-muted-foreground">Command mode</p>
                <p className="mt-1 font-mono text-foreground">
                  {bundle?.effectivePolicy.commandMode ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Host ceiling</p>
                <p className="mt-1 truncate font-mono text-foreground">
                  {bundle?.effectivePolicy.ceilingId ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Tool calls</p>
                <p className="mt-1 font-mono text-foreground">
                  {bundle?.effectivePolicy.budgets.maxToolCalls ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Kostnadstak</p>
                <p className="mt-1 font-mono text-foreground">
                  {bundle ? `${bundle.effectivePolicy.budgets.maxCostMicros} µ` : "—"}
                </p>
              </div>
            </div>
          </div>

          {validationMessages.length > 0 ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="size-4" /> Profilen kan inte exporteras
              </div>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-destructive">
                {validationMessages.map((issue) => (
                  <li key={`${issue.path}-${issue.message}`}>
                    <span className="font-mono">{issue.path || "profile"}</span>: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {bundle?.effectivePolicy.findings.length ? (
            <div className="rounded-2xl border border-brand-amber/40 bg-brand-amber/10 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-brand-amber">
                <ShieldCheck className="size-4" /> Hostbegränsningar
              </div>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-foreground">
                {bundle.effectivePolicy.findings.map((finding) => (
                  <li key={finding}>• {finding}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileCode2 className="size-4 text-brand-blue" /> Genereras vid export
            </div>
            <ul className="mt-3 space-y-2 font-mono text-xs text-muted-foreground">
              <li>SOUL.md</li>
              <li>AGENTS.md</li>
              <li>profiles/openclaw.yml</li>
              <li>hostConfig (ej hemligheter)</li>
            </ul>
          </div>

          <p className="px-1 text-xs leading-5 text-muted-foreground">{saveMessage}</p>
        </aside>
      </div>
    </main>
  )
}
