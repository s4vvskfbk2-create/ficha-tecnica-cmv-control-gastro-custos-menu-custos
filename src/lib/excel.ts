// Export Excel com FÓRMULAS VIVAS: as células contêm fórmulas reais (não valores
// pré-calculados), de modo que o usuário pode editar preços/quantidades direto
// no Excel e todos os custos, CMV% e margem recalculam automaticamente.

import ExcelJS from 'exceljs'
import { custoUnitario } from './calc'
import { downloadBlob, slug } from './download'
import type { FichaItem, FichaTecnica, Mercadoria } from './types'

const BRL = 'R$ #,##0.00'
const PCT = '0.0%'
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F2937' },
}

function styleHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL
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

/**
 * Monta a planilha "Mercadorias" e devolve um mapa id → linha, para que outras
 * abas possam referenciar o custo unitário de cada mercadoria com fórmula viva.
 */
function buildMercadoriasSheet(
  wb: ExcelJS.Workbook,
  mercadorias: Mercadoria[],
): Map<string, number> {
  const ws = wb.addWorksheet('Mercadorias')
  ws.columns = [
    { header: 'Mercadoria', key: 'nome', width: 28 },
    { header: 'Categoria', key: 'categoria', width: 16 },
    { header: 'Unidade', key: 'unidade', width: 10 },
    { header: 'Qtd. Embalagem', key: 'qtd', width: 16 },
    { header: 'Preço Embalagem', key: 'preco', width: 18 },
    { header: 'Custo Unitário', key: 'custo', width: 16 },
  ]
  styleHeader(ws.getRow(1))

  const rowOf = new Map<string, number>()
  mercadorias.forEach((m, i) => {
    const r = i + 2
    ws.getCell(r, 1).value = m.nome
    ws.getCell(r, 2).value = m.categoria ?? ''
    ws.getCell(r, 3).value = m.unidade
    ws.getCell(r, 4).value = m.embalagem_qtd
    ws.getCell(r, 5).value = m.embalagem_preco
    ws.getCell(r, 5).numFmt = BRL
    // FÓRMULA VIVA: custo unitário = preço da embalagem / quantidade.
    ws.getCell(r, 6).value = { formula: `IF(D${r}=0,0,E${r}/D${r})` }
    ws.getCell(r, 6).numFmt = BRL
    rowOf.set(m.id, r)
  })

  return rowOf
}

/** Exporta a lista completa de mercadorias com custo unitário como fórmula viva. */
export async function exportMercadoriasExcel(mercadorias: Mercadoria[]): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Ficha Técnica & CMV'
  wb.created = new Date()
  buildMercadoriasSheet(wb, mercadorias)
  await writeAndDownload(wb, `mercadorias-${slug(new Date().toISOString().slice(0, 10))}.xlsx`)
}

/**
 * Exporta uma ficha técnica completa. A aba "Mercadorias" carrega todos os
 * insumos usados; a aba da ficha referencia o custo unitário de cada insumo
 * (Mercadorias!F{linha}) e calcula custo, CMV% e margem com fórmulas vivas.
 */
export async function exportFichaExcel(
  ficha: FichaTecnica,
  itens: FichaItem[],
  mercadorias: Map<string, Mercadoria>,
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Ficha Técnica & CMV'
  wb.created = new Date()

  const usadas = itens
    .map((i) => mercadorias.get(i.mercadoria_id))
    .filter((m): m is Mercadoria => Boolean(m))
  const rowOf = buildMercadoriasSheet(wb, usadas)

  const ws = wb.addWorksheet('Ficha Técnica')
  ws.columns = [
    { width: 30 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
  ]

  // Cabeçalho da ficha.
  ws.mergeCells('A1:E1')
  const titulo = ws.getCell('A1')
  titulo.value = ficha.nome
  titulo.font = { size: 16, bold: true }

  ws.getCell('A2').value = 'Categoria:'
  ws.getCell('B2').value = ficha.categoria ?? '—'
  ws.getCell('A3').value = 'Rendimento (porções):'
  const rendimentoCell = ws.getCell('B3')
  rendimentoCell.value = ficha.rendimento

  // Tabela de itens.
  const headerRow = 5
  const headers = ['Mercadoria', 'Unidade', 'Quantidade', 'Custo Unitário', 'Custo']
  headers.forEach((h, i) => (ws.getCell(headerRow, i + 1).value = h))
  styleHeader(ws.getRow(headerRow))

  const firstItemRow = headerRow + 1
  itens.forEach((item, i) => {
    const r = firstItemRow + i
    const m = mercadorias.get(item.mercadoria_id)
    const mercRow = rowOf.get(item.mercadoria_id)
    ws.getCell(r, 1).value = m?.nome ?? '(removida)'
    ws.getCell(r, 2).value = m?.unidade ?? ''
    ws.getCell(r, 3).value = item.quantidade
    // FÓRMULA VIVA: referencia o custo unitário na aba Mercadorias.
    ws.getCell(r, 4).value = mercRow ? { formula: `Mercadorias!F${mercRow}` } : custoUnitario(m!)
    ws.getCell(r, 4).numFmt = BRL
    // FÓRMULA VIVA: custo = quantidade × custo unitário.
    ws.getCell(r, 5).value = { formula: `C${r}*D${r}` }
    ws.getCell(r, 5).numFmt = BRL
  })

  const lastItemRow = firstItemRow + Math.max(itens.length, 1) - 1

  // Totais e indicadores — todos com fórmulas vivas.
  const totalRow = lastItemRow + 1
  ws.getCell(totalRow, 4).value = 'Custo Total:'
  ws.getCell(totalRow, 4).font = { bold: true }
  const custoTotalCell = ws.getCell(totalRow, 5)
  custoTotalCell.value = itens.length
    ? { formula: `SUM(E${firstItemRow}:E${lastItemRow})` }
    : 0
  custoTotalCell.numFmt = BRL
  custoTotalCell.font = { bold: true }

  const porcaoRow = totalRow + 1
  ws.getCell(porcaoRow, 4).value = 'Custo por Porção:'
  const custoPorcaoCell = ws.getCell(porcaoRow, 5)
  custoPorcaoCell.value = { formula: `IF(B3=0,0,E${totalRow}/B3)` }
  custoPorcaoCell.numFmt = BRL

  const vendaRow = porcaoRow + 1
  ws.getCell(vendaRow, 4).value = 'Preço de Venda:'
  const precoVendaCell = ws.getCell(vendaRow, 5)
  precoVendaCell.value = ficha.preco_venda
  precoVendaCell.numFmt = BRL

  const cmvRow = vendaRow + 1
  ws.getCell(cmvRow, 4).value = 'CMV %:'
  ws.getCell(cmvRow, 4).font = { bold: true }
  const cmvCell = ws.getCell(cmvRow, 5)
  // FÓRMULA VIVA: CMV% = custo por porção / preço de venda.
  cmvCell.value = { formula: `IF(E${vendaRow}=0,0,E${porcaoRow}/E${vendaRow})` }
  cmvCell.numFmt = PCT
  cmvCell.font = { bold: true }

  const margemRow = cmvRow + 1
  ws.getCell(margemRow, 4).value = 'Margem (R$):'
  const margemCell = ws.getCell(margemRow, 5)
  // FÓRMULA VIVA: margem = preço de venda − custo por porção.
  margemCell.value = { formula: `E${vendaRow}-E${porcaoRow}` }
  margemCell.numFmt = BRL

  if (ficha.modo_preparo) {
    const prepRow = margemRow + 2
    ws.getCell(prepRow, 1).value = 'Modo de preparo:'
    ws.getCell(prepRow, 1).font = { bold: true }
    ws.mergeCells(prepRow + 1, 1, prepRow + 1, 5)
    const prep = ws.getCell(prepRow + 1, 1)
    prep.value = ficha.modo_preparo
    prep.alignment = { wrapText: true, vertical: 'top' }
  }

  await writeAndDownload(wb, `ficha-${slug(ficha.nome)}.xlsx`)
}
