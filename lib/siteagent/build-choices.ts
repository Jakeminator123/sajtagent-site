// Siteagent — byggval.
// Speglar init-build-choices.ts / PreviewPanelInitControls i sajtmaskin.
// Vid merge: byt ut definitionerna mot importen från src/lib/builder/init-build-choices.ts.

export interface ChoiceOption {
  value: string
  label: string
  /** Färg-swatch (tailwind-klass) för färgvalen */
  swatch?: string
}

export interface ChoiceGroup {
  key: string
  label: string
  options: ChoiceOption[]
}

export const CHOICE_GROUPS: ChoiceGroup[] = [
  {
    key: "siteKind",
    label: "Hemsida eller app",
    options: [
      { value: "auto", label: "Auto" },
      { value: "website", label: "Hemsida" },
      { value: "app", label: "App" },
    ],
  },
  {
    key: "siteType",
    label: "Typ av sajt",
    options: [
      { value: "auto", label: "Auto" },
      { value: "landing", label: "Landningssida" },
      { value: "saas", label: "SaaS" },
      { value: "portfolio", label: "Portfolio" },
      { value: "blog", label: "Blogg" },
      { value: "shop", label: "Webbutik" },
      { value: "simple", label: "Enkel start" },
      { value: "dashboard", label: "Dashboard" },
      { value: "appshell", label: "App-skal" },
      { value: "auth", label: "Inloggning" },
    ],
  },
  {
    key: "complexity",
    label: "Komplexitet",
    options: [
      { value: "auto", label: "Auto" },
      { value: "simple", label: "Enkel" },
      { value: "medium", label: "Lagom" },
      { value: "complex", label: "Komplex" },
    ],
  },
  {
    key: "style",
    label: "Stil",
    options: [
      { value: "auto", label: "Auto" },
      { value: "warm-local", label: "Varm & lokal" },
      { value: "corporate", label: "Corporate" },
      { value: "bold-startup", label: "Bold startup" },
      { value: "editorial", label: "Editorial" },
      { value: "minimal", label: "Minimal" },
    ],
  },
  {
    key: "tone",
    label: "Ton",
    options: [
      { value: "auto", label: "Auto" },
      { value: "professional", label: "Professionell" },
      { value: "warm", label: "Varm" },
      { value: "playful", label: "Lekfull" },
    ],
  },
  {
    key: "color",
    label: "Färg",
    options: [
      { value: "off", label: "Av" },
      { value: "ocean", label: "Havsblå", swatch: "bg-sky-500" },
      { value: "forest", label: "Skogsgrön", swatch: "bg-emerald-600" },
      { value: "amber", label: "Bärnsten", swatch: "bg-amber-500" },
      { value: "brick", label: "Tegelröd", swatch: "bg-rose-600" },
      { value: "flower", label: "Blomster", swatch: "bg-pink-400" },
      { value: "plum", label: "Plommon", swatch: "bg-purple-600" },
      { value: "mustard", label: "Senap", swatch: "bg-yellow-600" },
    ],
  },
  {
    key: "colorMode",
    label: "Färgläge",
    options: [
      { value: "auto", label: "Auto" },
      { value: "light", label: "Ljust" },
      { value: "dark", label: "Mörkt" },
    ],
  },
]

/** Antal sidor hanteras separat som slider: 0 = Auto, 1–3 */
export const PAGE_COUNT = { min: 0, max: 3, autoValue: 0 }

export type BuildChoices = Record<string, string> & { pageCount: number }

export function defaultBuildChoices(): BuildChoices {
  const choices = Object.fromEntries(
    CHOICE_GROUPS.map((g) => [g.key, g.options[0].value])
  ) as BuildChoices
  choices.pageCount = PAGE_COUNT.autoValue
  return choices
}
