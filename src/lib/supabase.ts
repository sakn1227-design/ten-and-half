import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
const legacyAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
const key = publishableKey || legacyAnonKey

const hasPlaceholder = (value?: string) => !value || /YOUR_(PROJECT|KEY|LEGACY_ANON_KEY)/i.test(value)

export const isConfigured = !hasPlaceholder(url) && !hasPlaceholder(key)

// Always export a concrete client so application code does not need nullable
// checks everywhere. When configuration is missing, the UI is gated by
// `isConfigured` before any network action is attempted.
const clientUrl = isConfigured ? url! : 'https://placeholder.supabase.co'
const clientKey = isConfigured ? key! : 'placeholder-publishable-key'

export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
