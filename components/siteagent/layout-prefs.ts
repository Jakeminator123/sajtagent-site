// Ren layout-migration för Builder. Ingen React, ingen persistens —
// hooken i use-layout-prefs.ts äger localStorage.

export const LAYOUT_STORAGE_KEY = "siteagent:layout:v4"
export const LAYOUT_DEFAULTS_REVISION = 5

export interface FaceSize {
  w: number
  h: number
}

/**
 * Agentstorlek som layout:v4 skrev före PR #22 (högerkolumn 340 × face height 440).
 * Används som sentinel: bara exakt denna storlek räknas som "aldrig anpassad".
 */
export const LEGACY_UNCUSTOMIZED_AGENT_SIZE: FaceSize = { w: 340, h: 440 }

export function isLegacyUncustomizedAgentSize(size: FaceSize): boolean {
  return (
    size.w === LEGACY_UNCUSTOMIZED_AGENT_SIZE.w &&
    size.h === LEGACY_UNCUSTOMIZED_AGENT_SIZE.h
  )
}

/**
 * Höj agentkortets default för återvändande layout:v4-användare utan att
 * rensa dockade kort, offsets eller manuellt ändrade storlekar.
 *
 * - Ingen eller äldre `defaultsRevision` + exakt legacy-storlek → ny default.
 * - Redan stämplad revision, eller annan storlek → lämna orört.
 */
export function migrateAgentDefaultSize(
  savedAgentSize: FaceSize,
  currentDefault: FaceSize,
  defaultsRevision: number | undefined,
): FaceSize {
  if ((defaultsRevision ?? 4) >= LAYOUT_DEFAULTS_REVISION) {
    return savedAgentSize
  }
  if (isLegacyUncustomizedAgentSize(savedAgentSize)) {
    return { w: currentDefault.w, h: currentDefault.h }
  }
  return savedAgentSize
}
