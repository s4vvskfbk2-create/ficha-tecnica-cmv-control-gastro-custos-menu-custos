import { readFileSync } from 'node:fs'

const calc = readFileSync('src/lib/calc.ts', 'utf8')
const units = readFileSync('src/lib/units.ts', 'utf8')
const ai = readFileSync('src/lib/aiRecipeClient.ts', 'utf8')

const assertions = [
  ['calc has cost unit guard for zero package quantity', /if \(!m\.embalagem_qtd\) return 0/.test(calc)],
  ['calc protects gross quantity when aproveitamento is zero', /item\.perc_aproveitamento > 0 \? item\.perc_aproveitamento : 1/.test(calc)],
  ['calc protects recursive recipe cycles', /visitando\.has\(receitaId\)/.test(calc) && /visitando\.has\(item\.ref_id\)/.test(calc)],
  ['calc computes CMV as portion cost over sale price', /\(custoPorcao \/ preco\) \* 100/.test(calc)],
  ['units convert kg/L by 1000 factor', /kg: \{ dim: 'massa', fator: 1000 \}/.test(units) && /L: \{ dim: 'volume', fator: 1000 \}/.test(units)],
  ['units fallback keeps quantity when dimensions differ', /if \(!mesmaDimensao\(de, para\)\) return qtd/.test(units)],
  ['AI client never calls OpenAI directly', !/api\.openai\.com/.test(ai)],
  ['AI fallback local is explicit', /Rascunho gerado SEM inteligência artificial/.test(ai)],
  ['AI parser supports Brazilian decimal comma', /replace\('\\,', '\\.'\)/.test(ai) || /replace\(',', '\.'\)/.test(ai)],
]

let failed = 0
for (const [name, ok] of assertions) {
  console.log(`${ok ? '✅' : '❌'} ${name}`)
  if (!ok) failed++
}
if (failed) {
  console.error(`\n${failed} core invariant check(s) failed.`)
  process.exit(1)
}
console.log('\nCore invariant checks passed.')
