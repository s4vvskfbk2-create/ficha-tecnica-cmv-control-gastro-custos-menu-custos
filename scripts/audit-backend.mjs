import { readFileSync, existsSync } from 'node:fs'

const checks = []
const add = (name, ok, detail = '') => checks.push({ name, ok, detail })
const read = (path) => readFileSync(path, 'utf8')

const migration1 = read('supabase/migrations/0001_init.sql')
const migration2 = read('supabase/migrations/0002_backend_production_hardening.sql')
const config = read('supabase/config.toml')
const edge = read('supabase/functions/ai-recipe-import/index.ts')
const frontendClient = read('src/lib/aiRecipeClient.ts')
const db = read('src/lib/db.ts')

add('0001 migration exists', existsSync('supabase/migrations/0001_init.sql'))
add('0002 hardening migration exists', existsSync('supabase/migrations/0002_backend_production_hardening.sql'))
add('RLS enabled for core tables', /alter table public\.receitas enable row level security/.test(migration1) && /alter table public\.mercadorias enable row level security/.test(migration1))
add('Safe establishment onboarding RPC present', /criar_estabelecimento_com_usuario/.test(migration2))
add('Recipe item reference trigger present', /validar_receita_item_ref/.test(migration2) && /receita_itens_validar_ref/.test(migration2))
add('Production Edge Function requires JWT', /verify_jwt\s*=\s*true/.test(config))
add('Edge Function keeps OpenAI server-side', /https:\/\/api\.openai\.com\/v1\/responses/.test(edge) && /Deno\.env\.get\('OPENAI_API_KEY'\)/.test(edge))
add('Frontend does not read OPENAI_API_KEY', !/OPENAI_API_KEY/.test(frontendClient.replace(/SEGURANÇA:[\s\S]*?\n\n/, '')))
add('Supabase repo uses onboarding RPC', /rpc\('criar_estabelecimento_com_usuario'/.test(db))
add('Dependent snapshot queries throw errors', /readDependent/.test(db))

let failed = 0
for (const check of checks) {
  const mark = check.ok ? '✅' : '❌'
  console.log(`${mark} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`)
  if (!check.ok) failed += 1
}

if (failed) {
  console.error(`\n${failed} backend audit check(s) failed.`)
  process.exit(1)
}

console.log('\nBackend audit passed.')
