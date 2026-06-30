// Contrato compartilhado da importação de receita por IA.
//
// ⚠️ NOTA DE INTEGRAÇÃO (Claude → Codex):
// O backend (Edge Function `ai-recipe-import`), os docs `docs/AI_RECIPE_IMPORT.md`
// e `docs/BACKEND_CONTRACT.md` e o `src/lib/aiRecipe.ts` originais do Codex NÃO
// estavam presentes neste repositório/branch quando o frontend foi construído.
// Este arquivo é o **espelho do contrato esperado pelo frontend**, escrito a
// partir da especificação do handoff. Quando a base do Codex for mesclada,
// reconcilie ESTES tipos com os tipos oficiais (mantenha o nome do arquivo e da
// Edge Function). O frontend só depende dos campos abaixo.

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
