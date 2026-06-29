// Camada de acesso a dados. Usa Supabase quando configurado; senão, um repositório
// local em localStorage para que o MVP rode e seja testável sem backend.

import { supabase, supabaseConfigured } from './supabase'
import type {
  FichaItem,
  FichaItemInput,
  FichaTecnica,
  FichaTecnicaInput,
  Mercadoria,
  MercadoriaInput,
} from './types'

export interface Repo {
  listMercadorias(): Promise<Mercadoria[]>
  createMercadoria(input: MercadoriaInput): Promise<Mercadoria>
  updateMercadoria(id: string, input: Partial<MercadoriaInput>): Promise<void>
  deleteMercadoria(id: string): Promise<void>

  listFichas(): Promise<FichaTecnica[]>
  createFicha(input: FichaTecnicaInput): Promise<FichaTecnica>
  updateFicha(id: string, input: Partial<FichaTecnicaInput>): Promise<void>
  deleteFicha(id: string): Promise<void>

  listItens(fichaId: string): Promise<FichaItem[]>
  setItens(fichaId: string, itens: FichaItemInput[]): Promise<void>
}

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`

// ---------------------------------------------------------------------------
// Repositório local (localStorage) — fallback de desenvolvimento.
// ---------------------------------------------------------------------------

const KEY = 'ficha-tecnica-cmv:v1'

interface LocalState {
  mercadorias: Mercadoria[]
  fichas: FichaTecnica[]
  itens: FichaItem[]
}

function load(): LocalState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as LocalState
  } catch {
    /* ignore */
  }
  return seed()
}

function save(state: LocalState): void {
  localStorage.setItem(KEY, JSON.stringify(state))
}

/** Dados de exemplo para o app abrir já com conteúdo demonstrável. */
function seed(): LocalState {
  const now = new Date().toISOString()
  const farinha: Mercadoria = {
    id: uid(), nome: 'Farinha de trigo', categoria: 'Secos', unidade: 'g',
    embalagem_qtd: 1000, embalagem_preco: 5.5, fornecedor: 'Atacadão', created_at: now,
  }
  const queijo: Mercadoria = {
    id: uid(), nome: 'Queijo mussarela', categoria: 'Laticínios', unidade: 'g',
    embalagem_qtd: 1000, embalagem_preco: 38.9, fornecedor: 'Laticínios Bom Leite', created_at: now,
  }
  const molho: Mercadoria = {
    id: uid(), nome: 'Molho de tomate', categoria: 'Molhos', unidade: 'g',
    embalagem_qtd: 2040, embalagem_preco: 18.0, fornecedor: 'Atacadão', created_at: now,
  }
  const pizza: FichaTecnica = {
    id: uid(), nome: 'Pizza Margherita', categoria: 'Pizzas', rendimento: 1,
    preco_venda: 49.9, modo_preparo: 'Abrir a massa, cobrir com molho e queijo, assar a 280°C.', created_at: now,
  }
  const itens: FichaItem[] = [
    { id: uid(), ficha_id: pizza.id, mercadoria_id: farinha.id, quantidade: 250 },
    { id: uid(), ficha_id: pizza.id, mercadoria_id: queijo.id, quantidade: 150 },
    { id: uid(), ficha_id: pizza.id, mercadoria_id: molho.id, quantidade: 120 },
  ]
  const state: LocalState = { mercadorias: [farinha, queijo, molho], fichas: [pizza], itens }
  save(state)
  return state
}

const localRepo: Repo = {
  async listMercadorias() {
    return load().mercadorias.slice().sort((a, b) => a.nome.localeCompare(b.nome))
  },
  async createMercadoria(input) {
    const state = load()
    const m: Mercadoria = { ...input, id: uid(), created_at: new Date().toISOString() }
    state.mercadorias.push(m)
    save(state)
    return m
  },
  async updateMercadoria(id, input) {
    const state = load()
    state.mercadorias = state.mercadorias.map((m) => (m.id === id ? { ...m, ...input } : m))
    save(state)
  },
  async deleteMercadoria(id) {
    const state = load()
    state.mercadorias = state.mercadorias.filter((m) => m.id !== id)
    state.itens = state.itens.filter((i) => i.mercadoria_id !== id)
    save(state)
  },

  async listFichas() {
    return load().fichas.slice().sort((a, b) => a.nome.localeCompare(b.nome))
  },
  async createFicha(input) {
    const state = load()
    const f: FichaTecnica = { ...input, id: uid(), created_at: new Date().toISOString() }
    state.fichas.push(f)
    save(state)
    return f
  },
  async updateFicha(id, input) {
    const state = load()
    state.fichas = state.fichas.map((f) => (f.id === id ? { ...f, ...input } : f))
    save(state)
  },
  async deleteFicha(id) {
    const state = load()
    state.fichas = state.fichas.filter((f) => f.id !== id)
    state.itens = state.itens.filter((i) => i.ficha_id !== id)
    save(state)
  },

  async listItens(fichaId) {
    return load().itens.filter((i) => i.ficha_id === fichaId)
  },
  async setItens(fichaId, itens) {
    const state = load()
    state.itens = state.itens.filter((i) => i.ficha_id !== fichaId)
    for (const it of itens) state.itens.push({ ...it, id: uid() })
    save(state)
  },
}

// ---------------------------------------------------------------------------
// Repositório Supabase.
// ---------------------------------------------------------------------------

function must<T>(value: T | null, error: unknown): T {
  if (error) throw error
  return value as T
}

const supabaseRepo: Repo = {
  async listMercadorias() {
    const { data, error } = await supabase!.from('mercadorias').select('*').order('nome')
    return must(data as Mercadoria[], error)
  },
  async createMercadoria(input) {
    const { data, error } = await supabase!.from('mercadorias').insert(input).select().single()
    return must(data as Mercadoria, error)
  },
  async updateMercadoria(id, input) {
    const { error } = await supabase!.from('mercadorias').update(input).eq('id', id)
    if (error) throw error
  },
  async deleteMercadoria(id) {
    const { error } = await supabase!.from('mercadorias').delete().eq('id', id)
    if (error) throw error
  },

  async listFichas() {
    const { data, error } = await supabase!.from('fichas_tecnicas').select('*').order('nome')
    return must(data as FichaTecnica[], error)
  },
  async createFicha(input) {
    const { data, error } = await supabase!.from('fichas_tecnicas').insert(input).select().single()
    return must(data as FichaTecnica, error)
  },
  async updateFicha(id, input) {
    const { error } = await supabase!.from('fichas_tecnicas').update(input).eq('id', id)
    if (error) throw error
  },
  async deleteFicha(id) {
    const { error } = await supabase!.from('fichas_tecnicas').delete().eq('id', id)
    if (error) throw error
  },

  async listItens(fichaId) {
    const { data, error } = await supabase!.from('ficha_itens').select('*').eq('ficha_id', fichaId)
    return must(data as FichaItem[], error)
  },
  async setItens(fichaId, itens) {
    // Estratégia simples para o MVP: substitui todos os itens da ficha.
    const del = await supabase!.from('ficha_itens').delete().eq('ficha_id', fichaId)
    if (del.error) throw del.error
    if (itens.length) {
      const { error } = await supabase!.from('ficha_itens').insert(itens)
      if (error) throw error
    }
  },
}

export const repo: Repo = supabaseConfigured ? supabaseRepo : localRepo
