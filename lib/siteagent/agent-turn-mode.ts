// Site-owned turn mode. The browser cannot choose this. A clear build brief
// authorizes one build.request; ordinary questions stay conversation-only.
// Runtime still decides whether to use the authorized tool.

export type AgentTurnModeV1 = "conversation.respond" | "build.request"

export type AgentTurnModeInputV1 = {
  message: string
  replyToQuestionId?: string
}

const WORD = "(?<![\\p{L}\\p{N}_])"
const WORD_END = "(?![\\p{L}\\p{N}_])"

const SITE_NOUN = new RegExp(
  `${WORD}(hemsida|webbplats(?:en)?|webb-?sida|sajt(?:en)?|landnings(?:sida)?|startsida|portfolio|butik|blogg|webbsida|website|homepage|landing(?:\\s+page)?|web\\s*site)${WORD_END}`,
  "iu",
)

const BUILD_VERB = new RegExp(
  `${WORD}(bygg(?:a|er)?|skapa(?:r)?|designa(?:r)?|ändra(?:r)?|uppdatera(?:r)?|ersätt(?:er)?|byt(?:er)?|fixa(?:r)?|implementera(?:r)?|lägg(?:a|er)?\\s+till|ta(?:r)?\\s+bort|gör(?:a)?\\s+(?:en|ett|den|det)|create|build|make|add|change|update|remove|redesign|replace)${WORD_END}`,
  "iu",
)

const FEATURE = new RegExp(
  `${WORD}(parallax|responsiv(?:e|t)?|hero|footer|header|meny|nav(?:igation)?|dark\\s*mode|mörk(?:t|a)?(?:\\s+tema)?|ljus(?:t|a)?(?:\\s+tema)?|gradient|animat(?:ion|ed|era)?|galleri(?:e)?|gallery|kort|cards?)${WORD_END}`,
  "iu",
)

const WANT_SITE = new RegExp(
  `${WORD}((?:jag\\s+)?vill\\s+ha|(?:jag\\s+)?behöver|want(?:s)?|need(?:s)?)${WORD_END}`,
  "iu",
)

const CAPABILITY_QUESTION = new RegExp(
  `${WORD}(vad kan du|vad gör du|hur fungerar|hur funkar|kan du förklara|what can you|how does(?: it)?|how do you)${WORD_END}`,
  "iu",
)

const QUESTION_START =
  /^(vad|hur|varför|vilken|vilket|vilka|när|var|vem|förklara|berätta|what|why|how|which|who|when|where)(?![\p{L}\p{N}_])/iu

const PAGE_ROUTE = /\/[a-z0-9-]{1,40}(?:\/[a-z0-9-]{1,40})*/i
const NAMED_PAGE = /\b(?!sidan?\b)[a-z0-9-]{1,40}-?sidan?\b/i
const SIDAN_NAME = /\bsidan\s+\/?[a-z0-9-]{1,40}\b/i
const PAGE_ADD_VERB = /lägg(?:a|er)?\s+till|skapa|add/i
const PAGE_REMOVE_VERB = /ta(?:r)?\s+bort|radera|släng|remove|delete/i

function hasExplicitPageMutation(text: string): boolean {
  if (!PAGE_ADD_VERB.test(text) && !PAGE_REMOVE_VERB.test(text)) return false
  return PAGE_ROUTE.test(text) || NAMED_PAGE.test(text) || SIDAN_NAME.test(text)
}

function normalizedMessage(message: string): string {
  return message.normalize("NFC").trim().replace(/\s+/g, " ")
}

export function classifyAgentTurnModeV1(
  request: AgentTurnModeInputV1,
): AgentTurnModeV1 {
  // A structured answer continues the same turn path. Do not force a second
  // "ska jag bygga?" confirmation before Runtime may emit build.request.
  if (request.replyToQuestionId) return "build.request"

  const text = normalizedMessage(request.message)
  if (!text) return "conversation.respond"

  const hasSite = SITE_NOUN.test(text)
  const hasVerb = BUILD_VERB.test(text)
  const hasFeature = FEATURE.test(text)
  const wants = WANT_SITE.test(text)
  const capabilityQuestion = CAPABILITY_QUESTION.test(text)
  const asked = QUESTION_START.test(text) || /\?\s*$/.test(text)

  // "Kan du lägga till /kontakt?" is a page mutation, not a how-to question.
  if (hasExplicitPageMutation(text)) return "build.request"
  if (hasSite && (hasVerb || hasFeature || wants)) return "build.request"
  if (hasVerb && hasFeature) return "build.request"
  // "förklara vad som ändrats på sidan" is an explanation, not a mutation,
  // even if a past-tense change verb appears in the question.
  if (asked) return "conversation.respond"
  if (hasSite) return "build.request"
  if (hasVerb && !capabilityQuestion) return "build.request"
  return "conversation.respond"
}
