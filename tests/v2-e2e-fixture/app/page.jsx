"use client"

import { useState } from "react"

export default function SmokePage() {
  const [count, setCount] = useState(0)
  return (
    <main>
      <h1 data-testid="revision">Sajtagent V2 revision ONE</h1>
      <button data-testid="counter" onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    </main>
  )
}
