// Benchmarks de mercado por segmento (notas 02/03 — Abrasel / TRA).
// Usados para validar CMV e margem e gerar alertas na tela e nos exports.

import type { Segmento } from './types'

export interface FaixaCMV {
  /** Faixa saudável (decimais). */
  min: number
  max: number
  rotulo: string
}

export const SEGMENTOS: { value: Segmento; label: string }[] = [
  { value: 'bistro', label: 'Bistrô / Restaurante' },
  { value: 'a_la_carte', label: 'À la carte' },
  { value: 'bar', label: 'Bar' },
  { value: 'pizzaria', label: 'Pizzaria' },
  { value: 'cafe', label: 'Café' },
  { value: 'confeitaria', label: 'Confeitaria / Doces' },
  { value: 'fast_food', label: 'Fast food / Delivery' },
  { value: 'japones', label: 'Japonês / Sushi' },
  { value: 'outro', label: 'Outro' },
]

export const labelSegmento = (s: Segmento): string =>
  SEGMENTOS.find((x) => x.value === s)?.label ?? 'Outro'

/** Faixa de CMV ideal por segmento (decimais). Fonte: notas 02/03. */
export const FAIXA_CMV: Record<Segmento, FaixaCMV> = {
  bistro: { min: 0.28, max: 0.35, rotulo: '28–35%' },
  a_la_carte: { min: 0.28, max: 0.35, rotulo: '28–35%' },
  bar: { min: 0.1, max: 0.25, rotulo: 'até 25%' },
  pizzaria: { min: 0.25, max: 0.35, rotulo: '25–35%' },
  cafe: { min: 0.25, max: 0.35, rotulo: '25–35%' },
  confeitaria: { min: 0.05, max: 0.25, rotulo: '5–25%' },
  fast_food: { min: 0.25, max: 0.32, rotulo: '25–32%' },
  japones: { min: 0.3, max: 0.4, rotulo: '30–40%' },
  outro: { min: 0.25, max: 0.4, rotulo: '25–40%' },
}

export type NivelStatus = 'good' | 'warn' | 'danger' | 'neutral'

export interface StatusCMV {
  nivel: NivelStatus
  texto: string
}

/**
 * Avalia o CMV (%) contra a faixa do segmento.
 * - sem preço definido → neutral
 * - dentro da faixa → good
 * - abaixo do mínimo → good (custo baixo é positivo), mas sinaliza "abaixo"
 * - acima do máximo e <= 40% → warn
 * - acima de 40% → danger
 */
export function avaliarCMV(cmvPct: number, segmento: Segmento): StatusCMV {
  if (!Number.isFinite(cmvPct) || cmvPct <= 0) {
    return { nivel: 'neutral', texto: 'Defina o preço de venda' }
  }
  const cmv = cmvPct / 100
  const faixa = FAIXA_CMV[segmento]
  if (cmv > 0.4) return { nivel: 'danger', texto: `Alto — acima de 40% (ideal ${faixa.rotulo})` }
  if (cmv > faixa.max) return { nivel: 'warn', texto: `Acima do ideal (${faixa.rotulo})` }
  if (cmv < faixa.min) return { nivel: 'good', texto: `Abaixo do ideal — ótima margem (${faixa.rotulo})` }
  return { nivel: 'good', texto: `Dentro do ideal (${faixa.rotulo})` }
}
