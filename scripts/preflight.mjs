import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    out[match[1]] = value
  }
  return out
}

const fileEnv = ['.env', '.env.local', '.env.production', '.env.production.local']
  .reduce((acc, file) => ({ ...acc, ...parseEnvFile(path.join(root, file)) }), {})
const env = { ...fileEnv, ...process.env }
const url = env.VITE_SUPABASE_URL?.trim()
const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim()
const errors = []

if (!url || /YOUR_PROJECT/i.test(url)) errors.push('VITE_SUPABASE_URL が未設定です。')
else {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') errors.push('VITE_SUPABASE_URL は https:// で始まる必要があります。')
  } catch { errors.push('VITE_SUPABASE_URL が正しい URL ではありません。') }
}
if (!key || /YOUR_(KEY|LEGACY_ANON_KEY)/i.test(key)) errors.push('VITE_SUPABASE_PUBLISHABLE_KEY（または VITE_SUPABASE_ANON_KEY）が未設定です。')
if (env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY) errors.push('Service Role Key をフロントエンド環境変数に置かないでください。')
for (const file of ['src/App.tsx','src/lib/supabase.ts','supabase/migrations/001_init.sql','vercel.json']) {
  if (!fs.existsSync(path.join(root,file))) errors.push(`必要なファイルがありません: ${file}`)
}
if (errors.length) {
  console.error('\n❌ 10.5 preflight failed:\n')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
console.log('✅ 10.5 preflight passed: Supabase environment variables and deployment files are present.')
