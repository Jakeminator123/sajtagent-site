"use client"

// Chat-ytan är absorberad av Sajtagent-kortet och ingår inte i FACES.
// Filen behålls som valfri arkivkomponent — inte i default-layouten.
// Deferred: radera filen, eller registrera den som nedvikt arkivyta utan composer.

import { CardEmpty } from "../card-states"

export function ChatFace() {
  return (
    <div className="flex h-full flex-col" data-card-state="empty">
      <CardEmpty tone="idle" title="Flyttad till Sajtagent">
        <p>Skriv i Sajtagent-kortet. Den här ytan är inte längre standard.</p>
      </CardEmpty>
    </div>
  )
}
