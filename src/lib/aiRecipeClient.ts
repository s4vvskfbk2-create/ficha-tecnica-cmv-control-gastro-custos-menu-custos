// Cliente do frontend para a importação de receita por IA.
//
// SEGURANÇA: o frontend NUNCA chama a OpenAI diretamente e NUNCA contém a
// OPENAI_API_KEY. Toda inferência acontece na Edge Function `ai-recipe-import`
// (domínio do Codex). Aqui só montamos a requisição e tratamos a resposta.

import { supabase, supabaseConfigured } from './supabase'
import type { AiRecipeDraft, AiRecipeImportRequest } from './aiRecipe'

const FUNCTION_NAME = 'ai-recipe-import'

/** Erro de negócio com mensagem amigável (sempre exibida ao usuário). */
export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

/** Lê um arquivo de imagem como base64 (sem o prefixo data:). */
export function lerImagemBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new ImportError('Não consegui ler a imagem. Tente outra foto.'))
    reader.onload = () => {
      const result = String(reader.result || '')
      const base64 = result.includes(',') ? result.slice(result.indexOf(',') + 1) : result
      resolve({ base64, mimeType: file.type || 'image/jpeg' })
    }
    reader.readAsDataURL(file)
  })
}

function normalizarDraft(data: unknown): AiRecipeDraft {
  // Aceita tanto { draft: {...} } quanto o draft direto.
  const raw = (data && typeof data === 'object' && 'draft' in (data as Record<string, unknown>)
    ? (data as { draft: unknown }).draft
    : data) as Partial<AiRecipeDraft> | null

  if (!raw || typeof raw !== 'object' || !('nome' in raw)) {
    throw new ImportError('A resposta da IA veio em um formato inesperado. Tente novamente.')
  }
  return {
    nome: String(raw.nome ?? '').trim() || 'Receita importada',
    categoria: raw.categoria ?? null,
    rendimento_valor: raw.rendimento_valor ?? null,
    rendimento_unidade: raw.rendimento_unidade ?? null,
    preco_venda: raw.preco_venda ?? null,
    ingredientes: Array.isArray(raw.ingredientes) ? raw.ingredientes : [],
    modo_preparo: raw.modo_preparo ?? null,
    avisos: Array.isArray(raw.avisos) ? raw.avisos : [],
    confianca: raw.confianca ?? null,
  }
}

/**
 * Envia texto e/ou imagem para a Edge Function e devolve o rascunho da IA.
 * Lança ImportError com mensagem amigável em qualquer falha (nunca falha em silêncio).
 */
export async function importarReceitaIA(req: AiRecipeImportRequest): Promise<AiRecipeDraft> {
  if (!supabaseConfigured || !supabase) {
    throw new ImportError(
      'A importação por IA precisa do backend configurado (Supabase + login). ' +
        'No modo local você pode usar o rascunho a partir do texto colado, abaixo.',
    )
  }
  let data: unknown
  let error: { message?: string } | null = null
  try {
    const res = await supabase.functions.invoke(FUNCTION_NAME, { body: req })
    data = res.data
    error = res.error
  } catch (e) {
    throw new ImportError(`Não consegui falar com o servidor de IA. ${(e as Error)?.message ?? ''}`.trim())
  }
  if (error) {
    throw new ImportError(`O servidor de IA recusou a importação: ${error.message ?? 'erro desconhecido'}.`)
  }
  return normalizarDraft(data)
}

// ---------------------------------------------------------------------------
// Fallback LOCAL (sem IA) — só heurística de texto, para testar o fluxo de
// revisão sem backend. Não substitui a Edge Function; serve de rede de segurança
// no modo local e deixa claro para o usuário que não houve IA.
// ---------------------------------------------------------------------------

/** Parser de número em formato brasileiro: "1.000,50" e "1000.50" → 1000.5 */
export function parseNumeroBR(texto: string): number | null {
  const limpo = texto.trim().replace(/[^\d.,]/g, '')
  if (!limpo) return null
  let normalizado = limpo
  if (limpo.includes(',')) {
    // vírgula é decimal; pontos são milhares
    normalizado = limpo.replace(/\./g, '').replace(',', '.')
  }
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}

const UNIDADES_CONHECIDAS = ['kg', 'g', 'ml', 'l', 'un', 'unidade', 'unidades', 'cx', 'caixa', 'pct', 'pacote', 'colher', 'colheres', 'xícara', 'xicara', 'xícaras', 'dente', 'dentes', 'fatia', 'fatias', 'lata', 'latas']

/** Gera um rascunho a partir de texto colado, sem IA. */
export function rascunhoLocalDeTexto(texto: string): AiRecipeDraft {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const nome = linhas[0] ?? 'Receita importada'
  const ingredientes = []
  let modo: string[] = []
  let lendoPreparo = false

  for (let i = 1; i < linhas.length; i++) {
    const l = linhas[i]
    if (/^(modo de preparo|preparo|preparação|como fazer)\s*:?\s*$/i.test(l)) {
      lendoPreparo = true
      continue
    }
    if (lendoPreparo) {
      modo.push(l)
      continue
    }
    // tenta extrair "qtd unidade nome" ou "nome - qtd unidade"
    const m = l.match(/(\d[\d.,]*)\s*([a-zA-ZçÇáéíóúâêô]+)?\s*(?:de\s+)?(.*)/)
    if (m && m[1]) {
      const quantidade = parseNumeroBR(m[1])
      const unidadeRaw = (m[2] ?? '').toLowerCase()
      const unidade = UNIDADES_CONHECIDAS.includes(unidadeRaw) ? unidadeRaw : null
      const nomeIng = (unidade ? m[3] : `${m[2] ?? ''} ${m[3] ?? ''}`).trim() || l
      ingredientes.push({ nome: nomeIng, quantidade, unidade })
    } else {
      ingredientes.push({ nome: l, quantidade: null, unidade: null })
    }
  }

  return {
    nome,
    categoria: null,
    rendimento_valor: null,
    rendimento_unidade: null,
    preco_venda: null,
    ingredientes,
    modo_preparo: modo.length ? modo.join('\n') : null,
    avisos: [
      'Rascunho gerado SEM inteligência artificial (modo local), apenas separando o texto. ' +
        'Revise quantidades, unidades e nomes com atenção antes de salvar.',
    ],
    confianca: null,
  }
}
