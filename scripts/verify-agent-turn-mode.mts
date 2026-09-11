import assert from "node:assert/strict"

import { classifyAgentTurnModeV1 } from "../lib/siteagent/agent-turn-mode.ts"

let checks = 0
function check(
  mode: ReturnType<typeof classifyAgentTurnModeV1>,
  expected: ReturnType<typeof classifyAgentTurnModeV1>,
  message: string,
): void {
  assert.equal(mode, expected, message)
  checks += 1
}

function classify(message: string, replyToQuestionId?: string) {
  return classifyAgentTurnModeV1({
    message,
    replyToQuestionId,
  })
}

check(
  classify("hemsida med parallax, responsiv"),
  "build.request",
  "a site brief with features is a build instruction",
)
check(
  classify("Bygg en landningssida för ett bageri i Uppsala"),
  "build.request",
  "an imperative site create is a build instruction",
)
check(
  classify("ändra hero-texten till Välkommen"),
  "build.request",
  "a mutation of current-site chrome is a build instruction",
)
check(
  classify("gör den mörk och modern"),
  "build.request",
  "gör den + theme language is a build instruction",
)
check(
  classify("kan du bygga en hemsida?"),
  "build.request",
  "a clear build question still authorizes build.request without a second confirm",
)
check(
  classify("I want a website with a parallax hero"),
  "build.request",
  "an English site brief is a build instruction",
)
check(
  classify("Blått tema", "color_choice"),
  "build.request",
  "a structured question reply keeps build.request so Runtime can continue",
)
check(
  classify("vad kan du göra?"),
  "conversation.respond",
  "a capability question stays conversation-only",
)
check(
  classify("Hur fungerar preview?"),
  "conversation.respond",
  "a product-how question stays conversation-only",
)
check(
  classify("kan du förklara vad parallax är?"),
  "conversation.respond",
  "an explanation question is not a build job",
)
check(
  classify("Vad är statusen för min sajt?"),
  "conversation.respond",
  "a status question does not mint a BuildJob",
)
check(
  classify("tack, ser bra ut"),
  "conversation.respond",
  "acknowledgement stays conversation-only",
)

console.log(`Agent turn mode: ${checks} checks passed.`)
