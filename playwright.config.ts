import { defineConfig, devices } from '@playwright/test'

const hasRealtimeEnv = Boolean(process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_PUBLISHABLE_KEY)

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile-safari', use: { ...devices['iPhone 13'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    env: hasRealtimeEnv ? {
      VITE_SUPABASE_URL: process.env.E2E_SUPABASE_URL!,
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_SUPABASE_PUBLISHABLE_KEY!,
    } : undefined,
  },
})
