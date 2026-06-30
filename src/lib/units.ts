// Conversão de unidades dentro da mesma dimensão (massa, volume, contagem).
// Usada para que o custo unitário de uma mercadoria (na sua unidade base) possa
// ser aplicado a um item de ficha que use uma unidade diferente da mesma dimensão.

import type { Unidade } from './types'

type Dimensao = 'massa' | 'volume' | 'contagem'

// Fator para a unidade canônica da dimensão (massa→g, volume→ml, contagem→un).
const FATOR: Record<Unidade, { dim: Dimensao; fator: number }> = {
  g: { dim: 'massa', fator: 1 },
  kg: { dim: 'massa', fator: 1000 },
  ml: { dim: 'volume', fator: 1 },
  L: { dim: 'volume', fator: 1000 },
  un: { dim: 'contagem', fator: 1 },
  cx: { dim: 'contagem', fator: 1 },
  pct: { dim: 'contagem', fator: 1 },
}

/** True se as duas unidades pertencem à mesma dimensão (são conversíveis). */
export function mesmaDimensao(a: Unidade, b: Unidade): boolean {
  return FATOR[a].dim === FATOR[b].dim
}

/**
 * Converte uma quantidade `qtd` de `de` para `para`.
 * Se as unidades não forem da mesma dimensão, retorna a quantidade sem conversão
 * (fallback seguro: assume mesma escala — evita zerar custo por engano de unidade).
 */
export function converter(qtd: number, de: Unidade, para: Unidade): number {
  if (de === para) return qtd
  if (!mesmaDimensao(de, para)) return qtd
  return (qtd * FATOR[de].fator) / FATOR[para].fator
}

export const labelUnidade: Record<Unidade, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  L: 'L',
  un: 'un',
  cx: 'cx',
  pct: 'pct',
}
