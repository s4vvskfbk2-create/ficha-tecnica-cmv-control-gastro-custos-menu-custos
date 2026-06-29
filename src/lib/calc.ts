// Cálculos de custo / CMV. Mantidos puros para reuso em tela, Excel e PDF.

import type { FichaItem, FichaTecnica, Mercadoria } from './types'

/** Custo por unidade base da mercadoria (ex.: R$/g). */
export function custoUnitario(m: Pick<Mercadoria, 'embalagem_qtd' | 'embalagem_preco'>): number {
  if (!m.embalagem_qtd) return 0
  return m.embalagem_preco / m.embalagem_qtd
}

/** Custo de uma linha da ficha = quantidade × custo unitário da mercadoria. */
export function custoItem(item: Pick<FichaItem, 'quantidade'>, mercadoria: Mercadoria): number {
  return item.quantidade * custoUnitario(mercadoria)
}

export interface FichaCalculo {
  custoTotal: number
  custoPorcao: number
  /** CMV % = custo da porção / preço de venda. */
  cmvPct: number
  /** Margem de contribuição por porção (R$). */
  margem: number
}

/** Calcula custos agregados de uma ficha técnica. */
export function calcularFicha(
  ficha: Pick<FichaTecnica, 'rendimento' | 'preco_venda'>,
  itens: FichaItem[],
  mercadorias: Map<string, Mercadoria>,
): FichaCalculo {
  const custoTotal = itens.reduce((soma, item) => {
    const m = mercadorias.get(item.mercadoria_id)
    return m ? soma + custoItem(item, m) : soma
  }, 0)

  const custoPorcao = ficha.rendimento ? custoTotal / ficha.rendimento : 0
  const cmvPct = ficha.preco_venda ? (custoPorcao / ficha.preco_venda) * 100 : 0
  const margem = ficha.preco_venda - custoPorcao

  return { custoTotal, custoPorcao, cmvPct, margem }
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })

export const formatBRL = (v: number): string => moeda.format(Number.isFinite(v) ? v : 0)
export const formatNum = (v: number): string => numero.format(Number.isFinite(v) ? v : 0)
export const formatPct = (v: number): string =>
  `${(Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
