import { readFileSync } from 'node:fs'

const excel = readFileSync('src/lib/excel.ts', 'utf8')
const checks = [
  ['Tabela de Preços sheet exists', /addWorksheet\('Tabela de Preços'\)/.test(excel)],
  ['Ficha Técnica sheet exists', /addWorksheet\('Ficha Técnica'\)/.test(excel)],
  ['Receita Operacional sheet exists', /addWorksheet\('Receita Operacional'\)/.test(excel)],
  ['Unit cost formula is live', /formula: `IF\(D\$\{r\}=0,0,C\$\{r\}\/D\$\{r\}\)`/.test(excel)],
  ['Gross quantity formula is live', /formula: `IF\(D\$\{r\}=0,C\$\{r\},C\$\{r\}\/D\$\{r\}\)`/.test(excel)],
  ['Item total cost formula is live', /formula: `E\$\{r\}\*F\$\{r\}`/.test(excel)],
  ['CMV formula is live', /CMV %/.test(excel) && /G\$\{porcaoRow\}\/G\$\{precoRow\}/.test(excel)],
  ['Margin formula is live', /G\$\{precoRow\}-G\$\{porcaoRow\}/.test(excel)],
  ['Target price formula is live', /G\$\{porcaoRow\}\/G\$\{metaRow\}/.test(excel)],
]

let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${name}`)
  if (!ok) failed++
}
if (failed) {
  console.error(`\n${failed} Excel audit check(s) failed.`)
  process.exit(1)
}
console.log('\nExcel formula audit passed.')
