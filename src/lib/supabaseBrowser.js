import { createClient } from '@supabase/supabase-js'

let cachedClient = null
let cachedClientKey = null

export function getSupabaseBrowserConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey),
  }
}

export function getSupabaseBrowserClient() {
  const { url, anonKey, isConfigured } = getSupabaseBrowserConfig()

  if (!isConfigured) {
    return null
  }

  const clientKey = `${url}:${anonKey}`

  if (!cachedClient || cachedClientKey !== clientKey) {
    cachedClient = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
    cachedClientKey = clientKey
  }

  return cachedClient
}
