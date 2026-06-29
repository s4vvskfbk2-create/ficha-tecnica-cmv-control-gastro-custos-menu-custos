// Export PDF da ficha técnica (valores calculados, layout pronto para impressão).

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { calcularFicha, custoItem, custoUnitario, formatBRL, formatNum, formatPct } from './calc'
import { slug } from './download'
import type { FichaItem, FichaTecnica, Mercadoria } from './types'

export function exportFichaPDF(
  ficha: FichaTecnica,
  itens: FichaItem[],
  mercadorias: Map<string, Mercadoria>,
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  let y = margin

  doc.setFontSize(18)
  doc.text(ficha.nome, margin, y)
  y += 22

  doc.setFontSize(10)
  doc.setTextColor(100)
  const meta = [
    ficha.categoria ? `Categoria: ${ficha.categoria}` : null,
    `Rendimento: ${formatNum(ficha.rendimento)} porção(ões)`,
    `Preço de venda: ${formatBRL(ficha.preco_venda)}`,
  ].filter(Boolean).join('   •   ')
  doc.text(meta, margin, y)
  doc.setTextColor(0)
  y += 18

  const body = itens.map((item) => {
    const m = mercadorias.get(item.mercadoria_id)
    return [
      m?.nome ?? '(removida)',
      m?.unidade ?? '',
      formatNum(item.quantidade),
      m ? formatBRL(custoUnitario(m)) : '—',
      m ? formatBRL(custoItem(item, m)) : '—',
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [['Mercadoria', 'Un.', 'Qtd.', 'Custo Unit.', 'Custo']],
    body,
    margin: { left: margin, right: margin },
    headStyles: { fillColor: [31, 41, 55] },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  })

  const calc = calcularFicha(ficha, itens, mercadorias)
  // @ts-expect-error lastAutoTable é adicionado pelo plugin em runtime.
  let yy = (doc.lastAutoTable?.finalY ?? y) + 24

  const linhas: Array<[string, string]> = [
    ['Custo total', formatBRL(calc.custoTotal)],
    ['Custo por porção', formatBRL(calc.custoPorcao)],
    ['Preço de venda', formatBRL(ficha.preco_venda)],
    ['CMV %', formatPct(calc.cmvPct)],
    ['Margem por porção', formatBRL(calc.margem)],
  ]
  doc.setFontSize(11)
  for (const [label, value] of linhas) {
    doc.setFont('helvetica', 'bold')
    doc.text(label, margin, yy)
    doc.setFont('helvetica', 'normal')
    doc.text(value, margin + 160, yy)
    yy += 18
  }

  if (ficha.modo_preparo) {
    yy += 12
    doc.setFont('helvetica', 'bold')
    doc.text('Modo de preparo', margin, yy)
    yy += 16
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const wrapped = doc.splitTextToSize(ficha.modo_preparo, 515)
    doc.text(wrapped, margin, yy)
  }

  doc.save(`ficha-${slug(ficha.nome)}.pdf`)
}
