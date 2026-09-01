"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import { Loader2, Mail } from "lucide-react"

import { getSupabaseBrowserClient } from "@/lib/supabase/browser"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setMessage("Supabase Auth är inte konfigurerad i den här miljön.")
      return
    }

    setSubmitting(true)
    setMessage(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/builder` },
    })
    setSubmitting(false)
    setMessage(error ? error.message : "Kontrollera din e-post och öppna inloggningslänken.")
  }

  return (
    <main className="min-h-screen bg-workflow-bg text-workflow-text flex items-center justify-center p-6">
      <section className="w-full max-w-sm rounded-xl border border-workflow-border bg-workflow-surface p-6 shadow-xl">
        <p className="font-mono text-[10px] uppercase tracking-widest text-workflow-text-subtle">Sajtagent</p>
        <h1 className="mt-2 text-xl font-semibold">Logga in till Buildern</h1>
        <p className="mt-2 text-sm leading-relaxed text-workflow-text-muted">
          Vi skickar en engångslänk. Projekt, jobb och versioner binds sedan till din verifierade
          Supabase-identitet.
        </p>

        <form className="mt-6 space-y-3" onSubmit={submit}>
          <label className="block text-xs font-medium" htmlFor="email">E-post</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-workflow-border-subtle bg-workflow-node-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-workflow-border"
            placeholder="du@exempel.se"
          />
          <button
            type="submit"
            disabled={submitting || !email.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm text-background disabled:opacity-40"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Skicka engångslänk
          </button>
        </form>

        {message ? <p className="mt-4 text-xs leading-relaxed text-workflow-text-muted" role="status">{message}</p> : null}
        <Link className="mt-5 inline-block text-xs text-workflow-text-muted underline" href="/builder">
          Tillbaka till Buildern
        </Link>
      </section>
    </main>
  )
}
