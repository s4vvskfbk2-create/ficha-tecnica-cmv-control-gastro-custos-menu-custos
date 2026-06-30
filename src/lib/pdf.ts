// Export PDF padronizado da ficha técnica: cabeçalho, composição gerencial
// (com custos e indicadores) e receita operacional (medida caseira + preparo),
// com espaço para responsável/assinatura.

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  calcularFicha,
  formatBRL,
  formatNum,
  formatPct,
  formatX,
  type CalcContext,
} from './calc'
import { slug } from './download'
import { avaliarCMV } from './benchmark'
import type { Porcao, Receita, Segmento } from './types'

export function exportFichaPDF(
  receita: Receita,
  ctx: CalcContext,
  porcoes: Porcao[],
  segmento: Segmento,
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  const calc = calcularFicha(receita, ctx)
  let y = margin

  doc.setFontSize(18)
  doc.text(receita.nome, margin, y)
  y += 20
  doc.setFontSize(10)
  doc.setTextColor(100)
  const meta = [
    `Categoria: ${receita.categoria ?? '—'}`,
    `Tipo: ${receita.tipo === 'cardapio' ? 'Cardápio' : 'Produção'}`,
    `Rendimento: ${formatNum(receita.rendimento_valor)} ${receita.rendimento_unidade}`,
    `Preparo: ${receita.tempo_preparo_min} min`,
  ].join('   •   ')
  doc.text(meta, margin, y)
  doc.setTextColor(0)
  y += 16

  // --- Composição gerencial ---
  const body = calc.itens.map((l) => [
    (l.item.tipo === 'receita' ? '↳ ' : '') + l.nome,
    l.item.unidade,
    formatNum(l.item.qtd_liquida),
    formatPct((l.item.perc_aproveitamento || 1) * 100),
    formatNum(l.qtdBruta),
    formatBRL(l.custoUnit),
    formatBRL(l.custoTotal),
    formatPct(l.custoPct * 100),
  ])

  autoTable(doc, {
    startY: y,
    head: [['Ingrediente', 'Un', 'Qtd Líq', 'Aprov', 'Qtd Bruta', 'Custo Un', 'Custo', 'Custo %']],
    body,
    margin: { left: margin, right: margin },
    headStyles: { fillColor: [31, 41, 55], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
      5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' },
    },
  })

  // @ts-expect-error lastAutoTable é adicionado em runtime pelo plugin.
  let yy = (doc.lastAutoTable?.finalY ?? y) + 20

  const status = avaliarCMV(calc.cmvPct, segmento)
  const indic: Array<[string, string]> = [
    ['Custo de mercadoria', formatBRL(calc.custoMercadoria)],
    ['Custos extras', formatBRL(calc.custoExtras)],
    ['Custo total', formatBRL(calc.custoTotal)],
    ['Custo por porção', formatBRL(calc.custoPorcao)],
    ['Preço de venda', formatBRL(receita.preco_venda)],
    [`CMV % (${status.texto})`, formatPct(calc.cmvPct)],
    ['Margem de contribuição', `${formatBRL(calc.margemRs)}  (${formatPct(calc.margemPct)})`],
    ['Markup', formatX(calc.markup)],
  ]
  doc.setFontSize(10)
  for (const [label, value] of indic) {
    doc.setFont('helvetica', 'bold')
    doc.text(label, margin, yy)
    doc.setFont('helvetica', 'normal')
    doc.text(value, margin + 230, yy)
    yy += 15
  }

  // --- Receita operacional (medida caseira + preparo) ---
  if (yy > 700) {
    doc.addPage()
    yy = margin
  } else {
    yy += 10
  }
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('Receita operacional', margin, yy)
  doc.setFont('helvetica', 'normal')
  yy += 8

  const opBody = calc.itens.map((l) => [
    (l.item.titulo_secao ? `[${l.item.titulo_secao}] ` : '') + l.nome,
    l.item.medida_caseira ?? '',
    `${formatNum(l.item.qtd_liquida)} ${l.item.unidade}`,
  ])
  autoTable(doc, {
    startY: yy,
    head: [['Ingrediente', 'Medida caseira', 'Quantidade']],
    body: opBody,
    margin: { left: margin, right: margin },
    headStyles: { fillColor: [71, 85, 105], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
  })
  // @ts-expect-error runtime
  yy = (doc.lastAutoTable?.finalY ?? yy) + 18

  if (receita.modo_preparo) {
    doc.setFont('helvetica', 'bold')
    doc.text('Modo de preparo', margin, yy)
    yy += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    for (const line of doc.splitTextToSize(receita.modo_preparo, 515)) {
      if (yy > 780) { doc.addPage(); yy = margin }
      doc.text(line, margin, yy)
      yy += 12
    }
    yy += 4
  }
  if (receita.observacoes) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Observações:', margin, yy)
    doc.setFont('helvetica', 'normal')
    yy += 12
    for (const line of doc.splitTextToSize(receita.observacoes, 515)) {
      doc.text(line, margin, yy)
      yy += 12
    }
    yy += 4
  }

  // Validade + porções
  doc.setFontSize(9)
  doc.setTextColor(90)
  doc.text(
    `Validade (dias) — Congelado: ${receita.validade_congelado_dias}  |  Refrigerado: ${receita.validade_refrigerado_dias}  |  Ambiente: ${receita.validade_ambiente_dias}`,
    margin,
    yy,
  )
  yy += 13
  if (porcoes.length) {
    doc.text('Porções: ' + porcoes.map((p: Porcao) => `${p.nome} = ${p.quantidade_que_faz}`).join('   •   '), margin, yy)
    yy += 13
  }
  doc.setTextColor(0)

  // Responsável / assinatura
  yy = Math.min(yy + 24, 800)
  doc.setDrawColor(150)
  doc.line(margin, yy, margin + 220, yy)
  doc.line(margin + 280, yy, margin + 220 + 280, yy)
  yy += 12
  doc.setFontSize(8)
  doc.setTextColor(110)
  doc.text('Responsável pela produção', margin, yy)
  doc.text('Conferido por', margin + 280, yy)
  doc.setTextColor(0)

  doc.save(`ficha-${slug(receita.nome)}.pdf`)
}
