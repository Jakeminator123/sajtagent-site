import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { getSupabasePublicConfig } from "./config"

export async function createSupabaseServerClient() {
  const config = getSupabasePublicConfig()
  if (!config) return null

  const cookieStore = await cookies()
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Components cannot always write cookies. proxy.ts refreshes
          // the session before authenticated Route Handlers use it.
        }
      },
    },
  })
}
