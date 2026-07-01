// Modelos de domínio do app de Ficha Técnica & CMV.
// Multi-estabelecimento, composição recursiva (subfichas), % de aproveitamento,
// porções reutilizáveis e indicadores gerenciais (CMV, margem, markup).

/** Unidade base usada em mercadorias, itens e rendimento. */
export type Unidade = 'g' | 'kg' | 'ml' | 'L' | 'un' | 'cx' | 'pct'

export const UNIDADES: Unidade[] = ['g', 'kg', 'ml', 'L', 'un', 'cx', 'pct']

/** Segmentos usados para benchmark de CMV/margem por estabelecimento. */
export type Segmento =
  | 'bistro'
  | 'a_la_carte'
  | 'bar'
  | 'pizzaria'
  | 'cafe'
  | 'confeitaria'
  | 'fast_food'
  | 'japones'
  | 'outro'

/** Estabelecimento (unidade) — todo dado é escopado por ele. */
export interface Estabelecimento {
  id: string
  nome: string
  segmento: Segmento
  created_at: string
}

export type EstabelecimentoInput = Omit<Estabelecimento, 'id' | 'created_at'>

/**
 * Mercadoria = insumo / matéria-prima comprada.
 * Custo unitário é derivado: preço da embalagem ÷ quantidade da embalagem.
 */
export interface Mercadoria {
  id: string
  estabelecimento_id: string
  nome: string
  categoria: string | null
  unidade: Unidade
  /** Quantidade contida na embalagem, na unidade base. */
  embalagem_qtd: number
  /** Preço pago pela embalagem inteira (R$). */
  embalagem_preco: number
  fornecedor: string | null
  /** Data da última atualização de preço (YYYY-MM-DD). */
  atualizado_em: string
  created_at: string
}

export type MercadoriaInput = Omit<Mercadoria, 'id' | 'created_at'>

/** Histórico de preços de uma mercadoria (rastreabilidade de compras). */
export interface PrecoHist {
  id: string
  mercadoria_id: string
  preco: number
  qtd: number
  unidade: Unidade
  data: string
  fornecedor: string | null
}

export type PrecoHistInput = Omit<PrecoHist, 'id'>

/** Tipo de receita: item de cardápio (venda) ou produção (subficha/processado). */
export type ReceitaTipo = 'cardapio' | 'producao'

/** Ficha técnica / receita. */
export interface Receita {
  id: string
  estabelecimento_id: string
  nome: string
  categoria: string | null
  tipo: ReceitaTipo
  /** Rendimento: quanto a receita inteira produz (valor + unidade). */
  rendimento_valor: number
  rendimento_unidade: Unidade
  /** Peso/qtd final após o preparo (pós-cocção). 0 = usar rendimento_valor. */
  rendimento_final_peso: number
  tempo_preparo_min: number
  validade_congelado_dias: number
  validade_refrigerado_dias: number
  validade_ambiente_dias: number
  /** Preço de venda por porção (R$). */
  preco_venda: number
  /** Meta de CMV (decimal, ex.: 0.30) para o simulador de preço. */
  cmv_meta: number
  /** Quando true, o preço de venda é calculado sozinho pela meta de CMV. */
  preco_auto: boolean
  modo_preparo: string | null
  observacoes: string | null
  created_at: string
  atualizado_em: string
}

export type ReceitaInput = Omit<Receita, 'id' | 'created_at' | 'atualizado_em'>

/** Tipo de item de uma ficha: insumo (mercadoria) ou outra receita (subficha). */
export type ItemTipo = 'mercadoria' | 'receita'

/** Item / linha de ingrediente de uma ficha técnica. */
export interface ReceitaItem {
  id: string
  receita_id: string
  ordem: number
  /** Cabeçalho de seção opcional (ex.: "Massa", "Recheio"). */
  titulo_secao: string | null
  tipo: ItemTipo
  /** id da mercadoria ou da receita referenciada. */
  ref_id: string
  /** Quantidade líquida usada na receita. */
  qtd_liquida: number
  unidade: Unidade
  /** % de aproveitamento (decimal, ex.: 0.85). qtd_bruta = liquida / aprov. */
  perc_aproveitamento: number
  /** Medida caseira para a ficha operacional (ex.: "2 xícaras"). */
  medida_caseira: string | null
}

export type ReceitaItemInput = Omit<ReceitaItem, 'id'>

/** Custo extra da receita (embalagem da produção, gás, etc.). */
export interface CustoExtra {
  id: string
  receita_id: string
  descricao: string
  valor: number
}

export type CustoExtraInput = Omit<CustoExtra, 'id'>

/** Porção reutilizável: transforma o rendimento em unidades de uso/venda. */
export interface Porcao {
  id: string
  receita_id: string
  nome: string
  unidade: Unidade
  /** Quantas porções/unidades a receita inteira faz (ex.: Fatia = 12). */
  quantidade_que_faz: number
}

export type PorcaoInput = Omit<Porcao, 'id'>

/** Snapshot completo de um estabelecimento (carregado em memória pela store). */
export interface Snapshot {
  mercadorias: Mercadoria[]
  precoHist: PrecoHist[]
  receitas: Receita[]
  itens: ReceitaItem[]
  custosExtras: CustoExtra[]
  porcoes: Porcao[]
}
