'use client'

import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { SiteagentLogo } from '@/components/siteagent-logo'

const links = [
  { href: '#varfor-siteagent', label: 'Varför Siteagent' },
  { href: '#sa-fungerar-det', label: 'Så fungerar det' },
  { href: '#skapa', label: 'Skapa din sida' },
]

export function LandingHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 md:px-6">
      <nav aria-label="Huvudmeny" className="mx-auto flex h-14 max-w-7xl items-center justify-between rounded-2xl border border-workflow-border-subtle bg-background/75 px-3 shadow-2xl shadow-background/40 backdrop-blur-xl md:px-4">
        <SiteagentLogo />

        <div className="hidden items-center rounded-xl border border-workflow-border-subtle bg-workflow-node-input/50 p-1 md:flex">
          {links.slice(0, 2).map((link) => (
            <Link key={link.href} href={link.href} className="rounded-lg px-4 py-2 text-sm text-workflow-text-muted transition-colors hover:bg-workflow-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workflow-accent">
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/siteagent" className="rounded-lg px-3 py-2 text-sm text-workflow-text-muted transition-colors hover:text-foreground">Öppna studion</Link>
          <Link href="#skapa" className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90">Skapa din sida</Link>
        </div>

        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex size-10 items-center justify-center rounded-lg border border-workflow-border-subtle text-foreground md:hidden" aria-expanded={open} aria-controls="mobile-navigation" aria-label={open ? 'Stäng meny' : 'Öppna meny'}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {open && (
        <div id="mobile-navigation" className="mx-auto mt-2 flex max-w-7xl flex-col gap-1 rounded-2xl border border-workflow-border-subtle bg-background/95 p-2 shadow-2xl backdrop-blur-xl md:hidden">
          {links.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm text-workflow-text-muted hover:bg-workflow-surface hover:text-foreground">{link.label}</Link>
          ))}
          <Link href="/siteagent" onClick={() => setOpen(false)} className="mt-1 rounded-xl bg-foreground px-4 py-3 text-center text-sm font-medium text-background">Öppna studion</Link>
        </div>
      )}
    </header>
  )
}
