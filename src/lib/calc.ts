// Motor de cálculo de custo / CMV. Funções puras — fonte única da verdade
// compartilhada entre tela, Excel e PDF. Suporta composição recursiva (uma ficha
// pode usar outra ficha como ingrediente) e % de aproveitamento (qtd bruta).

import { converter } from './units'
import type {
  CustoExtra,
  Mercadoria,
  Porcao,
  Receita,
  ReceitaItem,
} from './types'

/** Contexto com todos os dados necessários para calcular qualquer ficha. */
export interface CalcContext {
  mercadorias: Map<string, Mercadoria>
  receitas: Map<string, Receita>
  itensPorReceita: Map<string, ReceitaItem[]>
  extrasPorReceita: Map<string, CustoExtra[]>
}

export function buildContext(
  mercadorias: Mercadoria[],
  receitas: Receita[],
  itens: ReceitaItem[],
  extras: CustoExtra[],
): CalcContext {
  const itensPorReceita = new Map<string, ReceitaItem[]>()
  for (const it of itens) {
    const arr = itensPorReceita.get(it.receita_id) ?? []
    arr.push(it)
    itensPorReceita.set(it.receita_id, arr)
  }
  for (const arr of itensPorReceita.values()) arr.sort((a, b) => a.ordem - b.ordem)

  const extrasPorReceita = new Map<string, CustoExtra[]>()
  for (const ex of extras) {
    const arr = extrasPorReceita.get(ex.receita_id) ?? []
    arr.push(ex)
    extrasPorReceita.set(ex.receita_id, arr)
  }

  return {
    mercadorias: new Map(mercadorias.map((m) => [m.id, m])),
    receitas: new Map(receitas.map((r) => [r.id, r])),
    itensPorReceita,
    extrasPorReceita,
  }
}

/** Custo por unidade base da mercadoria (ex.: R$/g). */
export function custoUnitario(
  m: Pick<Mercadoria, 'embalagem_qtd' | 'embalagem_preco'>,
): number {
  if (!m.embalagem_qtd) return 0
  return m.embalagem_preco / m.embalagem_qtd
}

/** Rendimento usado para custo por unidade (pós-cocção se informado). */
export function rendimentoEfetivo(r: Receita): number {
  return r.rendimento_final_peso > 0 ? r.rendimento_final_peso : r.rendimento_valor
}

/** qtd bruta = qtd líquida / aproveitamento (aprov. em decimal, 0..1). */
export function qtdBruta(item: Pick<ReceitaItem, 'qtd_liquida' | 'perc_aproveitamento'>): number {
  const aprov = item.perc_aproveitamento > 0 ? item.perc_aproveitamento : 1
  return item.qtd_liquida / aprov
}

export interface ItemCalculo {
  item: ReceitaItem
  nome: string
  unidadeBase: string
  qtdBruta: number
  /** Custo por unidade (na unidade do item). */
  custoUnit: number
  custoTotal: number
  /** Participação no custo de mercadoria (0..1). */
  custoPct: number
  /** Referência inválida (mercadoria/receita removida) ou ciclo detectado. */
  invalido: boolean
}

export interface FichaCalculo {
  itens: ItemCalculo[]
  custoMercadoria: number
  custoExtras: number
  custoTotal: number
  /** Custo por unidade de rendimento (ex.: R$/kg). */
  custoPorUnidRend: number
  /** Custo por porção (custo total / rendimento_valor). */
  custoPorcao: number
  /** CMV % = custo por porção / preço de venda × 100. */
  cmvPct: number
  margemRs: number
  margemPct: number
  markup: number
  precoPsicologico: number
  /** Preço sugerido para atingir a meta de CMV. */
  precoPorMeta: number
}

/**
 * Custo por unidade de rendimento de uma receita (para uso como subficha).
 * Recursivo, com proteção contra ciclos via `visitando`.
 */
function custoReceitaPorUnidRend(
  receitaId: string,
  ctx: CalcContext,
  visitando: Set<string>,
): number {
  if (visitando.has(receitaId)) return 0 // ciclo: corta
  const receita = ctx.receitas.get(receitaId)
  if (!receita) return 0
  visitando.add(receitaId)
  const calc = calcularInterno(receita, ctx, visitando)
  visitando.delete(receitaId)
  return calc.custoPorUnidRend
}

/** Custo por unidade de um item (mercadoria ou subficha), na unidade do item. */
function custoUnitItem(
  item: ReceitaItem,
  ctx: CalcContext,
  visitando: Set<string>,
): { custo: number; nome: string; unidadeBase: string; invalido: boolean } {
  if (item.tipo === 'mercadoria') {
    const m = ctx.mercadorias.get(item.ref_id)
    if (!m) return { custo: 0, nome: '(insumo removido)', unidadeBase: item.unidade, invalido: true }
    // custo por unidade base da mercadoria → converte para a unidade do item.
    const custoBase = custoUnitario(m)
    const custoNaUnidadeItem = converter(custoBase, item.unidade, m.unidade)
    return { custo: custoNaUnidadeItem, nome: m.nome, unidadeBase: m.unidade, invalido: false }
  }
  // subficha
  const sub = ctx.receitas.get(item.ref_id)
  if (!sub) return { custo: 0, nome: '(subficha removida)', unidadeBase: item.unidade, invalido: true }
  if (visitando.has(item.ref_id)) {
    return { custo: 0, nome: `${sub.nome} (ciclo)`, unidadeBase: sub.rendimento_unidade, invalido: true }
  }
  const custoPorUnid = custoReceitaPorUnidRend(item.ref_id, ctx, visitando)
  const custoNaUnidadeItem = converter(custoPorUnid, item.unidade, sub.rendimento_unidade)
  return { custo: custoNaUnidadeItem, nome: sub.nome, unidadeBase: sub.rendimento_unidade, invalido: false }
}

function calcularInterno(
  receita: Receita,
  ctx: CalcContext,
  visitando: Set<string>,
): FichaCalculo {
  const itens = ctx.itensPorReceita.get(receita.id) ?? []
  const extras = ctx.extrasPorReceita.get(receita.id) ?? []

  const linhas: ItemCalculo[] = itens.map((item) => {
    const { custo, nome, unidadeBase, invalido } = custoUnitItem(item, ctx, visitando)
    const bruta = qtdBruta(item)
    const custoTotal = custo * bruta
    return {
      item,
      nome,
      unidadeBase,
      qtdBruta: bruta,
      custoUnit: custo,
      custoTotal,
      custoPct: 0,
      invalido,
    }
  })

  const custoMercadoria = linhas.reduce((s, l) => s + l.custoTotal, 0)
  for (const l of linhas) l.custoPct = custoMercadoria ? l.custoTotal / custoMercadoria : 0

  const custoExtras = extras.reduce((s, e) => s + (Number(e.valor) || 0), 0)
  const custoTotal = custoMercadoria + custoExtras

  const rendVal = receita.rendimento_valor > 0 ? receita.rendimento_valor : 1
  const custoPorUnidRend = custoTotal / (rendimentoEfetivo(receita) || 1)
  const custoPorcao = custoTotal / rendVal

  const preco = receita.preco_venda
  const cmvPct = preco > 0 ? (custoPorcao / preco) * 100 : 0
  const margemRs = preco - custoPorcao
  const margemPct = preco > 0 ? (margemRs / preco) * 100 : 0
  const markup = custoPorcao > 0 ? preco / custoPorcao : 0
  const precoPsicologico = preco > 0 ? Math.max(0, Math.floor(preco) - 0.1) : 0
  const precoPorMeta = receita.cmv_meta > 0 ? custoPorcao / receita.cmv_meta : 0

  return {
    itens: linhas,
    custoMercadoria,
    custoExtras,
    custoTotal,
    custoPorUnidRend,
    custoPorcao,
    cmvPct,
    margemRs,
    margemPct,
    markup,
    precoPsicologico,
    precoPorMeta,
  }
}

/** Calcula todos os indicadores de uma ficha. */
export function calcularFicha(receita: Receita, ctx: CalcContext): FichaCalculo {
  return calcularInterno(receita, ctx, new Set<string>())
}

/** Custo de uma porção específica (custo total / quantidade_que_faz). */
export function custoDaPorcao(calc: FichaCalculo, porcao: Porcao): number {
  return porcao.quantidade_que_faz > 0 ? calc.custoTotal / porcao.quantidade_que_faz : 0
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const moeda4 = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })

export const formatBRL = (v: number): string => moeda.format(Number.isFinite(v) ? v : 0)
export const formatBRL4 = (v: number): string => moeda4.format(Number.isFinite(v) ? v : 0)
export const formatNum = (v: number): string => numero.format(Number.isFinite(v) ? v : 0)
export const formatPct = (v: number): string =>
  `${(Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
export const formatX = (v: number): string =>
  `${(Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}×`
