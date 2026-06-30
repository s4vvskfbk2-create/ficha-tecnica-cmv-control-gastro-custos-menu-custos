// Contrato compartilhado da importação de receita por IA.
//
// ✅ RECONCILIADO com o backend do Codex (commit f71ecea, landado via
// `handoff/codex-f71ecea.patch`). O contrato do frontend e o da Edge Function
// `ai-recipe-import` coincidem: request `{ texto, imagemBase64, mimeType }` →
// response `{ draft: AiRecipeDraft }` com os campos abaixo. A Edge Function vive
// em `supabase/functions/ai-recipe-import/` e é domínio do Codex (ver AGENTS.md).

/** Unidades aceitas pela ficha (string livre vinda da IA é normalizada na UI). */
export type AiUnidade = string

/** Um ingrediente sugerido pela IA. Campos podem vir nulos quando a IA não tem certeza. */
export interface AiIngredientDraft {
  nome: string
  quantidade: number | null
  unidade: AiUnidade | null
  /** Observação opcional (ex.: "a gosto", "peso bruto"). */
  observacao?: string | null
}

/** Rascunho de ficha técnica devolvido pela IA, para revisão humana antes de salvar. */
export interface AiRecipeDraft {
  nome: string
  categoria?: string | null
  rendimento_valor?: number | null
  rendimento_unidade?: AiUnidade | null
  /** Preço de venda, se a IA conseguiu inferir (R$). */
  preco_venda?: number | null
  ingredientes: AiIngredientDraft[]
  modo_preparo?: string | null
  /** Avisos da IA (campos incertos, suposições, dados faltantes). */
  avisos: string[]
  /** Confiança geral 0..1, opcional. */
  confianca?: number | null
}

/** Corpo enviado à Edge Function `ai-recipe-import`. Use texto OU imagem. */
export interface AiRecipeImportRequest {
  /** Texto colado da receita. */
  texto?: string
  /** Imagem em base64 (com ou sem prefixo data:). */
  imagemBase64?: string
  /** MIME da imagem (ex.: image/png, image/jpeg). */
  mimeType?: string
}

/** Resposta da Edge Function. Aceita-se `{ draft }` ou o draft diretamente. */
export interface AiRecipeImportResponse {
  draft: AiRecipeDraft
}

/** Rascunho vazio (mesmo default do Codex), útil como estado inicial. */
export const EMPTY_AI_RECIPE_DRAFT: AiRecipeDraft = {
  nome: 'Receita importada',
  categoria: null,
  rendimento_valor: null,
  rendimento_unidade: null,
  preco_venda: null,
  ingredientes: [],
  modo_preparo: null,
  avisos: [],
  confianca: null,
}
