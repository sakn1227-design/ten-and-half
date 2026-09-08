import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
const legacyAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
const key = publishableKey || legacyAnonKey

const hasPlaceholder = (value?: string) => !value || /YOUR_(PROJECT|KEY|LEGACY_ANON_KEY)/i.test(value)

export const isConfigured = !hasPlaceholder(url) && !hasPlaceholder(key)

export const supabase = isConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null
