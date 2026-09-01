"use client"

import { VersionList } from "../version-list"

export function VersionsFace() {
  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      <VersionList />
    </div>
  )
}
