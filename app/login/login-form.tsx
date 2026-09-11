"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import { Loader2, Lock, Mail } from "lucide-react"

import { LOGIN_SUCCESS_PATH, magicLinkRedirectTo } from "@/lib/supabase/auth-paths"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"

const inputClassName =
  "w-full rounded-md border border-workflow-border-subtle bg-workflow-node-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-workflow-border"

function passwordErrorMessage(message: string): string {
  if (/not confirmed/i.test(message)) {
    return "Bekräfta e-postadressen innan du loggar in."
  }
  return "Fel e-post eller lösenord."
}

export function LoginForm({ callbackFailed }: { callbackFailed: boolean }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState<"password" | "otp" | null>(null)
  const [message, setMessage] = useState<string | null>(
    callbackFailed ? "Inloggningen via länken misslyckades. Försök igen med e-post och lösenord." : null,
  )

  function requireClient() {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setMessage("Supabase Auth är inte konfigurerad i den här miljön.")
      return null
    }
    return supabase
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const supabase = requireClient()
    if (!supabase) return

    setSubmitting("password")
    setMessage(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      setSubmitting(null)
      setMessage(passwordErrorMessage(error.message))
      return
    }

    window.location.assign(LOGIN_SUCCESS_PATH)
  }

  async function submitOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const supabase = requireClient()
    if (!supabase) return

    setSubmitting("otp")
    setMessage(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: magicLinkRedirectTo(window.location.origin) },
    })
    setSubmitting(null)
    setMessage(error ? error.message : "Kontrollera din e-post och öppna inloggningslänken.")
  }

  const busy = submitting !== null
  const emailReady = Boolean(email.trim())

  return (
    <main className="min-h-screen bg-workflow-bg text-workflow-text flex items-center justify-center p-6">
      <section className="w-full max-w-sm rounded-xl border border-workflow-border bg-workflow-surface p-6 shadow-xl">
        <p className="font-mono text-[10px] uppercase tracking-widest text-workflow-text-subtle">Sajtagent</p>
        <h1 className="mt-2 text-xl font-semibold">Logga in till Buildern</h1>
        <p className="mt-2 text-sm leading-relaxed text-workflow-text-muted">
          Projekt, jobb och versioner binds till din verifierade Supabase-identitet.
        </p>

        <form className="mt-6 space-y-3" onSubmit={submitPassword}>
          <label className="block text-xs font-medium" htmlFor="email">
            E-post
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClassName}
            placeholder="du@exempel.se"
          />
          <label className="block text-xs font-medium" htmlFor="password">
            Lösenord
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClassName}
          />
          <button
            type="submit"
            disabled={busy || !emailReady || !password}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm text-background disabled:opacity-40"
          >
            {submitting === "password" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Logga in
          </button>
        </form>

        <details className="mt-5 rounded-md border border-workflow-border-subtle px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-workflow-text-muted">
            Eller skicka engångslänk
          </summary>
          <form className="mt-3 space-y-3" onSubmit={submitOtp}>
            <p className="text-xs leading-relaxed text-workflow-text-muted">
              Vi skickar en länk till samma e-postadress. Öppna den för att logga in utan lösenord.
            </p>
            <button
              type="submit"
              disabled={busy || !emailReady}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-workflow-border px-3 py-2 text-sm text-workflow-text disabled:opacity-40"
            >
              {submitting === "otp" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Skicka engångslänk
            </button>
          </form>
        </details>

        {message ? (
          <p className="mt-4 text-xs leading-relaxed text-workflow-text-muted" role="status">
            {message}
          </p>
        ) : null}
        <Link className="mt-5 inline-block text-xs text-workflow-text-muted underline" href={LOGIN_SUCCESS_PATH}>
          Tillbaka till Buildern
        </Link>
      </section>
    </main>
  )
}
