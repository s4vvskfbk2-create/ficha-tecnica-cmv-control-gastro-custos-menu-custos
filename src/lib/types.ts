// Modelos de domínio do MVP: Mercadorias, Fichas Técnicas e seus itens.

/** Unidade base usada nas receitas (e no cálculo de custo unitário). */
export type Unidade = 'g' | 'kg' | 'ml' | 'L' | 'un'

/**
 * Mercadoria = insumo / matéria-prima comprada.
 *
 * O custo unitário é derivado do preço da embalagem dividido pela quantidade
 * da embalagem, na unidade base. Ex.: pacote de 1000 g por R$ 25,00 → R$ 0,025/g.
 */
export interface Mercadoria {
  id: string
  nome: string
  categoria: string | null
  unidade: Unidade
  /** Quantidade contida na embalagem, na unidade base. Ex.: 1000 (g). */
  embalagem_qtd: number
  /** Preço pago pela embalagem inteira. Ex.: 25.00 (R$). */
  embalagem_preco: number
  fornecedor: string | null
  created_at: string
}

export type MercadoriaInput = Omit<Mercadoria, 'id' | 'created_at'>

/** Linha de uma ficha técnica: uma mercadoria e a quantidade utilizada na receita. */
export interface FichaItem {
  id: string
  ficha_id: string
  mercadoria_id: string
  /** Quantidade usada na receita, na unidade base da mercadoria. */
  quantidade: number
}

export type FichaItemInput = Omit<FichaItem, 'id'>

/** Ficha técnica = receita / prato com seu rendimento e preço de venda. */
export interface FichaTecnica {
  id: string
  nome: string
  categoria: string | null
  /** Rendimento: número de porções produzidas pela receita. */
  rendimento: number
  /** Preço de venda por porção (R$). */
  preco_venda: number
  modo_preparo: string | null
  created_at: string
}

export type FichaTecnicaInput = Omit<FichaTecnica, 'id' | 'created_at'>

/** Ficha técnica com seus itens carregados (para telas e exports). */
export interface FichaTecnicaCompleta extends FichaTecnica {
  itens: FichaItem[]
}
