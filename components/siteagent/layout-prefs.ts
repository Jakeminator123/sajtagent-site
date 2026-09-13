// Ren layout-migration för Builder. Ingen React, ingen persistens —
// hooken i use-layout-prefs.ts äger localStorage.

export const LAYOUT_STORAGE_KEY = "siteagent:layout:v4"
/** Chat→Sajtagent-absorption: docka bort chat, öppna agent om chat var enda input. */
export const LAYOUT_DEFAULTS_REVISION = 6

export interface FaceSize {
  w: number
  h: number
}

/**
 * Agentstorlek som layout:v4 skrev före PR #22 (högerkolumn 340 × face height 440).
 * Används som sentinel: bara exakt denna storlek räknas som "aldrig anpassad".
 */
export const LEGACY_UNCUSTOMIZED_AGENT_SIZE: FaceSize = { w: 340, h: 440 }

/**
 * Agentstorlek efter PR #23 (380 × 480) innan composer flyttades in i kortet.
 */
export const LEGACY_SPLIT_CONVERSATION_AGENT_SIZE: FaceSize = { w: 380, h: 480 }

export const RETIRED_FACE_IDS = ["chat"] as const

export function isLegacyUncustomizedAgentSize(size: FaceSize): boolean {
  return (
    size.w === LEGACY_UNCUSTOMIZED_AGENT_SIZE.w &&
    size.h === LEGACY_UNCUSTOMIZED_AGENT_SIZE.h
  )
}

export function isLegacySplitConversationAgentSize(size: FaceSize): boolean {
  return (
    size.w === LEGACY_SPLIT_CONVERSATION_AGENT_SIZE.w &&
    size.h === LEGACY_SPLIT_CONVERSATION_AGENT_SIZE.h
  )
}

/**
 * Höj agentkortets default för återvändande layout:v4-användare utan att
 * rensa dockade kort, offsets eller manuellt ändrade storlekar.
 *
 * - Revision ≥ 6 → lämna orört.
 * - Exakt 340×440 eller 380×480 → ny default (composer i Sajtagent).
 * - Annan storlek → lämna orört.
 */
export function migrateAgentDefaultSize(
  savedAgentSize: FaceSize,
  currentDefault: FaceSize,
  defaultsRevision: number | undefined,
): FaceSize {
  if ((defaultsRevision ?? 4) >= LAYOUT_DEFAULTS_REVISION) {
    return savedAgentSize
  }
  if (
    isLegacyUncustomizedAgentSize(savedAgentSize) ||
    isLegacySplitConversationAgentSize(savedAgentSize)
  ) {
    return { w: currentDefault.w, h: currentDefault.h }
  }
  return savedAgentSize
}

/**
 * Chat lämnar FACES. Filtrera bort okända id:n utan att rensa övriga docks.
 *
 * Om Chatt var öppen och Sajtagent var nedvikt (användaren skrev i Chatt)
 * öppnas Sajtagent så att composer inte försvinner.
 */
export function migrateDockedFaces<T extends string>(
  savedDocked: readonly string[],
  knownFaceIds: readonly T[],
  defaultsRevision: number | undefined,
): T[] {
  const known = new Set<string>(knownFaceIds)
  let next = savedDocked.filter((id): id is T => known.has(id))
  if ((defaultsRevision ?? 4) >= LAYOUT_DEFAULTS_REVISION) {
    return next
  }
  const chatWasOpen = !savedDocked.includes("chat")
  if (chatWasOpen && next.includes("agent" as T)) {
    next = next.filter((id) => id !== "agent")
  }
  return next
}
