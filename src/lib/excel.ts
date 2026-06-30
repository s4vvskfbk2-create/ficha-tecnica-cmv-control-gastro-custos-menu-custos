// Export Excel com FÓRMULAS VIVAS (requisito central do projeto).
// As células contêm fórmulas reais — não valores congelados — de modo que ao
// editar um preço ou quantidade no próprio Excel, custo, CMV%, margem e markup
// recalculam sozinhos. Estrutura de 3 abas (espelha a nota 02):
//   1) "Tabela de Preços"   — custo unitário = Preço Pago / Qtd
//   2) "Ficha Técnica"      — referencia a aba de preços; calcula indicadores
//   3) "Receita Operacional"— medida caseira + modo de preparo (sem custos)

import ExcelJS from 'exceljs'
import { custoUnitario, qtdBruta, rendimentoEfetivo, type CalcContext } from './calc'
import { converter } from './units'
import { downloadBlob, slug } from './download'
import type { CustoExtra, Mercadoria, Porcao, Receita } from './types'

const BRL = 'R$ #,##0.0000'
const BRL2 = 'R$ #,##0.00'
const PCT = '0.0%'
const DARK: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
const SOFT: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }

function header(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = DARK
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true }
    cell.alignment = { vertical: 'middle' }
  })
}

async function writeAndDownload(wb: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  downloadBlob(blob, filename)
}

/** Coleta recursivamente as mercadorias usadas por uma receita (e suas subfichas). */
function coletarMercadorias(
  receitaId: string,
  ctx: CalcContext,
  acc: Map<string, Mercadoria>,
  vis: Set<string>,
): void {
  if (vis.has(receitaId)) return
  vis.add(receitaId)
  const itens = ctx.itensPorReceita.get(receitaId) ?? []
  for (const it of itens) {
    if (it.tipo === 'mercadoria') {
      const m = ctx.mercadorias.get(it.ref_id)
      if (m) acc.set(m.id, m)
    } else {
      coletarMercadorias(it.ref_id, ctx, acc, vis)
    }
  }
}

/** Aba "Tabela de Preços" → mapa mercadoriaId → linha (para fórmulas cruzadas). */
function buildPrecosSheet(wb: ExcelJS.Workbook, mercadorias: Mercadoria[]): Map<string, number> {
  const ws = wb.addWorksheet('Tabela de Preços')
  ws.columns = [
    { header: 'Ingrediente', key: 'nome', width: 28 },
    { header: 'Embalagem', key: 'emb', width: 16 },
    { header: 'Preço Pago', key: 'preco', width: 14 },
    { header: 'Qtd', key: 'qtd', width: 10 },
    { header: 'Unidade', key: 'un', width: 10 },
    { header: 'Custo Unitário', key: 'custo', width: 16 },
    { header: 'Atualizado', key: 'data', width: 14 },
    { header: 'Fornecedor', key: 'forn', width: 20 },
  ]
  header(ws.getRow(1))

  const rowOf = new Map<string, number>()
  mercadorias.forEach((m, i) => {
    const r = i + 2
    ws.getCell(r, 1).value = m.nome
    ws.getCell(r, 2).value = `${m.embalagem_qtd} ${m.unidade}`
    ws.getCell(r, 3).value = m.embalagem_preco
    ws.getCell(r, 3).numFmt = BRL2
    ws.getCell(r, 4).value = m.embalagem_qtd
    ws.getCell(r, 5).value = m.unidade
    // FÓRMULA VIVA: custo unitário = preço pago / quantidade.
    ws.getCell(r, 6).value = { formula: `IF(D${r}=0,0,C${r}/D${r})` }
    ws.getCell(r, 6).numFmt = BRL
    ws.getCell(r, 7).value = m.atualizado_em
    ws.getCell(r, 8).value = m.fornecedor ?? ''
    rowOf.set(m.id, r)
  })
  return rowOf
}

/** Exporta a lista completa de mercadorias (custo unitário como fórmula viva). */
export async function exportMercadoriasExcel(mercadorias: Mercadoria[], titulo = 'Mercadorias'): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Ficha Técnica & CMV'
  wb.created = new Date()
  buildPrecosSheet(wb, mercadorias)
  await writeAndDownload(wb, `${slug(titulo)}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function label(ws: ExcelJS.Worksheet, row: number, texto: string, valor: ExcelJS.CellValue, fmt?: string, bold = false) {
  ws.getCell(row, 6).value = texto
  ws.getCell(row, 6).font = { bold }
  ws.getCell(row, 6).alignment = { horizontal: 'right' }
  const c = ws.getCell(row, 7)
  c.value = valor
  if (fmt) c.numFmt = fmt
  c.font = { bold }
}

/**
 * Exporta uma ficha técnica completa nas 3 abas com fórmulas vivas.
 */
export async function exportFichaExcel(
  receita: Receita,
  ctx: CalcContext,
  extras: CustoExtra[],
  porcoes: Porcao[],
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Ficha Técnica & CMV'
  wb.created = new Date()

  // --- Aba 1: Tabela de Preços (todas as mercadorias usadas, recursivo) ---
  const usadas = new Map<string, Mercadoria>()
  coletarMercadorias(receita.id, ctx, usadas, new Set())
  const mercList = [...usadas.values()].sort((a, b) => a.nome.localeCompare(b.nome))
  const rowOf = buildPrecosSheet(wb, mercList)

  // --- Aba 2: Ficha Técnica (gerencial, com fórmulas) ---
  const ws = wb.addWorksheet('Ficha Técnica')
  ws.columns = [
    { width: 30 }, { width: 12 }, { width: 14 }, { width: 10 },
    { width: 12 }, { width: 16 }, { width: 16 }, { width: 10 },
  ]
  ws.mergeCells('A1:H1')
  const tit = ws.getCell('A1')
  tit.value = `Ficha Técnica — ${receita.nome}`
  tit.font = { size: 16, bold: true }
  ws.getCell('A2').value = `Categoria: ${receita.categoria ?? '—'}    Tipo: ${receita.tipo === 'cardapio' ? 'Cardápio' : 'Produção'}`
  ws.getCell('A2').font = { color: { argb: 'FF64748B' } }

  const headRow = 4
  const headers = ['Ingrediente', 'Unidade', 'Qtd. Líquida', 'Aprov.', 'Qtd. Bruta', 'Custo Unit.', 'Custo Total', 'Custo %']
  headers.forEach((h, i) => (ws.getCell(headRow, i + 1).value = h))
  header(ws.getRow(headRow))

  const itens = ctx.itensPorReceita.get(receita.id) ?? []
  const firstRow = headRow + 1
  let lastRow = firstRow - 1

  itens.forEach((item, i) => {
    const r = firstRow + i
    lastRow = r
    const isMerc = item.tipo === 'mercadoria'
    const ref = isMerc ? ctx.mercadorias.get(item.ref_id) : ctx.receitas.get(item.ref_id)
    const baseUnit = isMerc
      ? (ref as Mercadoria | undefined)?.unidade ?? item.unidade
      : (ref as Receita | undefined)?.rendimento_unidade ?? item.unidade
    // expressa a qtd líquida na unidade base (mercadoria/rendimento) p/ a fórmula bater.
    const qtdLiqBase = converter(item.qtd_liquida, item.unidade, baseUnit)

    ws.getCell(r, 1).value = (isMerc ? ref?.nome : `↳ ${(ref as Receita | undefined)?.nome ?? '—'} (subficha)`) ?? '(removido)'
    ws.getCell(r, 2).value = baseUnit
    ws.getCell(r, 3).value = Number(qtdLiqBase.toFixed(4))
    ws.getCell(r, 4).value = item.perc_aproveitamento || 1
    ws.getCell(r, 4).numFmt = PCT
    // FÓRMULA VIVA: qtd bruta = líquida / aproveitamento.
    ws.getCell(r, 5).value = { formula: `IF(D${r}=0,C${r},C${r}/D${r})` }
    ws.getCell(r, 5).numFmt = '#,##0.000'
    // Custo unitário: mercadoria → referencia a Tabela de Preços (fórmula viva);
    // subficha → custo calculado por unidade de rendimento (valor).
    if (isMerc && rowOf.has(item.ref_id)) {
      ws.getCell(r, 6).value = { formula: `'Tabela de Preços'!F${rowOf.get(item.ref_id)}` }
    } else if (isMerc && ref) {
      ws.getCell(r, 6).value = custoUnitario(ref as Mercadoria)
    } else {
      // subficha: custo por unidade de rendimento
      const sub = ref as Receita | undefined
      const custoSub = sub ? subfichaCustoUnit(sub, ctx) : 0
      ws.getCell(r, 6).value = Number(custoSub.toFixed(6))
    }
    ws.getCell(r, 6).numFmt = BRL
    // FÓRMULA VIVA: custo total = qtd bruta × custo unitário.
    ws.getCell(r, 7).value = { formula: `E${r}*F${r}` }
    ws.getCell(r, 7).numFmt = BRL2
  })

  const hasItens = itens.length > 0
  const mercTotalRow = lastRow + 1
  ws.getCell(mercTotalRow, 6).value = 'Custo de Mercadoria:'
  ws.getCell(mercTotalRow, 6).font = { bold: true }
  ws.getCell(mercTotalRow, 6).alignment = { horizontal: 'right' }
  const mercTotalCell = ws.getCell(mercTotalRow, 7)
  mercTotalCell.value = hasItens ? { formula: `SUM(G${firstRow}:G${lastRow})` } : 0
  mercTotalCell.numFmt = BRL2
  mercTotalCell.font = { bold: true }

  // Custo % por item (referencia o total de mercadoria).
  if (hasItens) {
    for (let r = firstRow; r <= lastRow; r++) {
      ws.getCell(r, 8).value = { formula: `IF($G$${mercTotalRow}=0,0,G${r}/$G$${mercTotalRow})` }
      ws.getCell(r, 8).numFmt = PCT
    }
  }

  // Custos extras
  let row = mercTotalRow + 2
  ws.getCell(row, 1).value = 'Custos extras'
  ws.getCell(row, 1).font = { bold: true }
  row++
  const extraFirst = row
  extras.forEach((ex) => {
    ws.getCell(row, 1).value = ex.descricao
    ws.getCell(row, 7).value = ex.valor
    ws.getCell(row, 7).numFmt = BRL2
    row++
  })
  const extraLast = row - 1
  const extrasTotalRow = row
  label(
    ws,
    extrasTotalRow,
    'Custos Extras:',
    extras.length ? { formula: `SUM(G${extraFirst}:G${extraLast})` } : 0,
    BRL2,
    true,
  )

  // Indicadores
  const totalRow = extrasTotalRow + 1
  label(ws, totalRow, 'CUSTO TOTAL:', { formula: `G${mercTotalRow}+G${extrasTotalRow}` }, BRL2, true)
  ws.getRow(totalRow).eachCell((c) => (c.fill = SOFT))

  const rendRow = totalRow + 1
  label(ws, rendRow, `Rendimento (${receita.rendimento_unidade}):`, receita.rendimento_valor)

  const porcaoRow = rendRow + 1
  label(ws, porcaoRow, 'Custo por Porção:', { formula: `IF(G${rendRow}=0,0,G${totalRow}/G${rendRow})` }, BRL2, true)

  const precoRow = porcaoRow + 1
  label(ws, precoRow, 'Preço de Venda:', receita.preco_venda, BRL2)

  const cmvRow = precoRow + 1
  // FÓRMULA VIVA: CMV% = custo por porção / preço de venda.
  label(ws, cmvRow, 'CMV %:', { formula: `IF(G${precoRow}=0,0,G${porcaoRow}/G${precoRow})` }, PCT, true)

  const margemRsRow = cmvRow + 1
  label(ws, margemRsRow, 'Margem (R$):', { formula: `G${precoRow}-G${porcaoRow}` }, BRL2)

  const margemPctRow = margemRsRow + 1
  label(ws, margemPctRow, 'Margem %:', { formula: `IF(G${precoRow}=0,0,G${margemRsRow}/G${precoRow})` }, PCT)

  const markupRow = margemPctRow + 1
  label(ws, markupRow, 'Markup:', { formula: `IF(G${porcaoRow}=0,0,G${precoRow}/G${porcaoRow})` }, '0.00"×"')

  const metaRow = markupRow + 1
  label(ws, metaRow, 'Meta de CMV:', receita.cmv_meta || 0.3, PCT)
  const precoMetaRow = metaRow + 1
  label(ws, precoMetaRow, 'Preço p/ meta:', { formula: `IF(G${metaRow}=0,0,G${porcaoRow}/G${metaRow})` }, BRL2)

  // --- Aba 3: Receita Operacional (sem custos) ---
  const op = wb.addWorksheet('Receita Operacional')
  op.columns = [{ width: 30 }, { width: 24 }, { width: 14 }, { width: 10 }]
  op.mergeCells('A1:D1')
  op.getCell('A1').value = `Receita Operacional — ${receita.nome}`
  op.getCell('A1').font = { size: 16, bold: true }
  op.getCell('A2').value =
    `Rendimento: ${receita.rendimento_valor} ${receita.rendimento_unidade}   •   Preparo: ${receita.tempo_preparo_min} min`
  op.getCell('A2').font = { color: { argb: 'FF64748B' } }

  const opHead = 4
  ;['Ingrediente', 'Medida caseira', 'Qtd. Líquida', 'Un.'].forEach((h, i) => (op.getCell(opHead, i + 1).value = h))
  header(op.getRow(opHead))
  let opRow = opHead + 1
  let secaoAtual: string | null = null
  for (const item of itens) {
    if (item.titulo_secao && item.titulo_secao !== secaoAtual) {
      secaoAtual = item.titulo_secao
      op.getCell(opRow, 1).value = secaoAtual
      op.getCell(opRow, 1).font = { bold: true, italic: true }
      opRow++
    }
    const isMerc = item.tipo === 'mercadoria'
    const ref = isMerc ? ctx.mercadorias.get(item.ref_id) : ctx.receitas.get(item.ref_id)
    op.getCell(opRow, 1).value = (isMerc ? ref?.nome : `${(ref as Receita | undefined)?.nome} (subficha)`) ?? '(removido)'
    op.getCell(opRow, 2).value = item.medida_caseira ?? ''
    op.getCell(opRow, 3).value = item.qtd_liquida
    op.getCell(opRow, 4).value = item.unidade
    opRow++
  }

  opRow += 1
  op.getCell(opRow, 1).value = 'Modo de preparo'
  op.getCell(opRow, 1).font = { bold: true }
  opRow++
  if (receita.modo_preparo) {
    op.mergeCells(opRow, 1, opRow, 4)
    const cell = op.getCell(opRow, 1)
    cell.value = receita.modo_preparo
    cell.alignment = { wrapText: true, vertical: 'top' }
    op.getRow(opRow).height = 80
    opRow++
  }
  if (receita.observacoes) {
    opRow++
    op.getCell(opRow, 1).value = 'Observações'
    op.getCell(opRow, 1).font = { bold: true }
    opRow++
    op.mergeCells(opRow, 1, opRow, 4)
    op.getCell(opRow, 1).value = receita.observacoes
    op.getCell(opRow, 1).alignment = { wrapText: true }
  }
  // Porções e validade
  opRow += 2
  op.getCell(opRow, 1).value = 'Validade (dias): '
    + `Congelado ${receita.validade_congelado_dias} • Refrigerado ${receita.validade_refrigerado_dias} • Ambiente ${receita.validade_ambiente_dias}`
  if (porcoes.length) {
    opRow++
    op.getCell(opRow, 1).value = 'Porções: ' + porcoes.map((p) => `${p.nome} = ${p.quantidade_que_faz}`).join('  •  ')
  }

  await writeAndDownload(wb, `ficha-${slug(receita.nome)}.xlsx`)
}

/** Custo por unidade de rendimento de uma subficha (valor estático p/ o Excel). */
function subfichaCustoUnit(sub: Receita, ctx: CalcContext): number {
  // soma custo de mercadoria + extras / rendimento efetivo (1 nível; recursão já
  // resolvida pelo motor para casos profundos via calcularFicha, mas aqui basta o
  // custo por unidade direto).
  const itens = ctx.itensPorReceita.get(sub.id) ?? []
  let total = 0
  for (const it of itens) {
    if (it.tipo === 'mercadoria') {
      const m = ctx.mercadorias.get(it.ref_id)
      if (m) total += converter(custoUnitario(m), it.unidade, m.unidade) * qtdBruta(it)
    } else {
      const s = ctx.receitas.get(it.ref_id)
      if (s) total += converter(subfichaCustoUnit(s, ctx), it.unidade, s.rendimento_unidade) * qtdBruta(it)
    }
  }
  const extras = (ctx.extrasPorReceita.get(sub.id) ?? []).reduce((a, e) => a + (Number(e.valor) || 0), 0)
  return (total + extras) / (rendimentoEfetivo(sub) || 1)
}
