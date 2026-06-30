// Camada de acesso a dados. Usa Supabase quando configurado; senão, um repositório
// local (localStorage) para que o app rode e seja testável sem backend.
// Tudo é escopado por estabelecimento (multi-unidade desde o início).

import { supabase, supabaseConfigured } from './supabase'
import type {
  CustoExtra,
  CustoExtraInput,
  Estabelecimento,
  EstabelecimentoInput,
  Mercadoria,
  MercadoriaInput,
  Porcao,
  PorcaoInput,
  PrecoHist,
  PrecoHistInput,
  Receita,
  ReceitaInput,
  ReceitaItem,
  ReceitaItemInput,
  Snapshot,
} from './types'

export interface Repo {
  listEstabelecimentos(): Promise<Estabelecimento[]>
  createEstabelecimento(input: EstabelecimentoInput): Promise<Estabelecimento>
  updateEstabelecimento(id: string, input: Partial<EstabelecimentoInput>): Promise<void>

  /** Carrega todo o conteúdo de um estabelecimento em memória. */
  loadSnapshot(estId: string): Promise<Snapshot>

  createMercadoria(input: MercadoriaInput): Promise<Mercadoria>
  updateMercadoria(id: string, input: Partial<MercadoriaInput>): Promise<void>
  deleteMercadoria(id: string): Promise<void>
  addPrecoHist(input: PrecoHistInput): Promise<void>

  createReceita(input: ReceitaInput): Promise<Receita>
  updateReceita(id: string, input: Partial<ReceitaInput>): Promise<void>
  deleteReceita(id: string): Promise<void>

  setItens(receitaId: string, itens: ReceitaItemInput[]): Promise<void>
  setCustosExtras(receitaId: string, extras: CustoExtraInput[]): Promise<void>
  setPorcoes(receitaId: string, porcoes: PorcaoInput[]): Promise<void>
}

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`

const hoje = (): string => new Date().toISOString().slice(0, 10)

// ===========================================================================
// Repositório local (localStorage)
// ===========================================================================

const KEY = 'ficha-tecnica-cmv:v2'

interface LocalDB {
  estabelecimentos: Estabelecimento[]
  mercadorias: Mercadoria[]
  precoHist: PrecoHist[]
  receitas: Receita[]
  itens: ReceitaItem[]
  custosExtras: CustoExtra[]
  porcoes: Porcao[]
}

function load(): LocalDB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as LocalDB
  } catch {
    /* ignore */
  }
  const seeded = seed()
  save(seeded)
  return seeded
}

function save(db: LocalDB): void {
  localStorage.setItem(KEY, JSON.stringify(db))
}

const localRepo: Repo = {
  async listEstabelecimentos() {
    return load().estabelecimentos.slice().sort((a, b) => a.nome.localeCompare(b.nome))
  },
  async createEstabelecimento(input) {
    const db = load()
    const e: Estabelecimento = { ...input, id: uid(), created_at: new Date().toISOString() }
    db.estabelecimentos.push(e)
    save(db)
    return e
  },
  async updateEstabelecimento(id, input) {
    const db = load()
    db.estabelecimentos = db.estabelecimentos.map((e) => (e.id === id ? { ...e, ...input } : e))
    save(db)
  },

  async loadSnapshot(estId) {
    const db = load()
    const mercadorias = db.mercadorias.filter((m) => m.estabelecimento_id === estId)
    const mercIds = new Set(mercadorias.map((m) => m.id))
    const receitas = db.receitas.filter((r) => r.estabelecimento_id === estId)
    const recIds = new Set(receitas.map((r) => r.id))
    return {
      mercadorias: mercadorias.sort((a, b) => a.nome.localeCompare(b.nome)),
      precoHist: db.precoHist.filter((p) => mercIds.has(p.mercadoria_id)),
      receitas: receitas.sort((a, b) => a.nome.localeCompare(b.nome)),
      itens: db.itens.filter((i) => recIds.has(i.receita_id)),
      custosExtras: db.custosExtras.filter((c) => recIds.has(c.receita_id)),
      porcoes: db.porcoes.filter((p) => recIds.has(p.receita_id)),
    }
  },

  async createMercadoria(input) {
    const db = load()
    const m: Mercadoria = { ...input, id: uid(), created_at: new Date().toISOString() }
    db.mercadorias.push(m)
    db.precoHist.push({
      id: uid(),
      mercadoria_id: m.id,
      preco: m.embalagem_preco,
      qtd: m.embalagem_qtd,
      unidade: m.unidade,
      data: m.atualizado_em || hoje(),
      fornecedor: m.fornecedor,
    })
    save(db)
    return m
  },
  async updateMercadoria(id, input) {
    const db = load()
    const antes = db.mercadorias.find((m) => m.id === id)
    db.mercadorias = db.mercadorias.map((m) => (m.id === id ? { ...m, ...input } : m))
    if (antes && input.embalagem_preco !== undefined && input.embalagem_preco !== antes.embalagem_preco) {
      const atual = db.mercadorias.find((m) => m.id === id)!
      db.precoHist.push({
        id: uid(),
        mercadoria_id: id,
        preco: atual.embalagem_preco,
        qtd: atual.embalagem_qtd,
        unidade: atual.unidade,
        data: input.atualizado_em ?? hoje(),
        fornecedor: atual.fornecedor,
      })
    }
    save(db)
  },
  async deleteMercadoria(id) {
    const db = load()
    db.mercadorias = db.mercadorias.filter((m) => m.id !== id)
    db.precoHist = db.precoHist.filter((p) => p.mercadoria_id !== id)
    db.itens = db.itens.filter((i) => !(i.tipo === 'mercadoria' && i.ref_id === id))
    save(db)
  },
  async addPrecoHist(input) {
    const db = load()
    db.precoHist.push({ ...input, id: uid() })
    save(db)
  },

  async createReceita(input) {
    const db = load()
    const now = new Date().toISOString()
    const r: Receita = { ...input, id: uid(), created_at: now, atualizado_em: now }
    db.receitas.push(r)
    save(db)
    return r
  },
  async updateReceita(id, input) {
    const db = load()
    db.receitas = db.receitas.map((r) =>
      r.id === id ? { ...r, ...input, atualizado_em: new Date().toISOString() } : r,
    )
    save(db)
  },
  async deleteReceita(id) {
    const db = load()
    db.receitas = db.receitas.filter((r) => r.id !== id)
    db.itens = db.itens.filter((i) => i.receita_id !== id)
    db.custosExtras = db.custosExtras.filter((c) => c.receita_id !== id)
    db.porcoes = db.porcoes.filter((p) => p.receita_id !== id)
    db.itens = db.itens.filter((i) => !(i.tipo === 'receita' && i.ref_id === id))
    save(db)
  },

  async setItens(receitaId, itens) {
    const db = load()
    db.itens = db.itens.filter((i) => i.receita_id !== receitaId)
    for (const it of itens) db.itens.push({ ...it, id: uid() })
    save(db)
  },
  async setCustosExtras(receitaId, extras) {
    const db = load()
    db.custosExtras = db.custosExtras.filter((c) => c.receita_id !== receitaId)
    for (const ex of extras) db.custosExtras.push({ ...ex, id: uid() })
    save(db)
  },
  async setPorcoes(receitaId, porcoes) {
    const db = load()
    db.porcoes = db.porcoes.filter((p) => p.receita_id !== receitaId)
    for (const p of porcoes) db.porcoes.push({ ...p, id: uid() })
    save(db)
  },
}

// ===========================================================================
// Repositório Supabase
// ===========================================================================

function must<T>(value: T | null, error: unknown): T {
  if (error) throw error
  return value as T
}

const sb = () => supabase!

const supabaseRepo: Repo = {
  async listEstabelecimentos() {
    const { data, error } = await sb().from('estabelecimentos').select('*').order('nome')
    return must(data as Estabelecimento[], error)
  },
  async createEstabelecimento(input) {
    const { data, error } = await sb()
      .rpc('criar_estabelecimento_com_usuario', { p_nome: input.nome, p_segmento: input.segmento })
      .single()
    return must(data as Estabelecimento, error)
  },
  async updateEstabelecimento(id, input) {
    const { error } = await sb().from('estabelecimentos').update(input).eq('id', id)
    if (error) throw error
  },

  async loadSnapshot(estId) {
    const merc = await sb().from('mercadorias').select('*').eq('estabelecimento_id', estId).order('nome')
    if (merc.error) throw merc.error
    const mercadorias = (merc.data ?? []) as Mercadoria[]
    const mercIds = mercadorias.map((m) => m.id)

    const rec = await sb().from('receitas').select('*').eq('estabelecimento_id', estId).order('nome')
    if (rec.error) throw rec.error
    const receitas = (rec.data ?? []) as Receita[]
    const recIds = receitas.map((r) => r.id)

    const readDependent = async <T,>(query: PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> => {
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as T[]
    }

    const precoHist = mercIds.length
      ? await readDependent<PrecoHist>(
          sb().from('mercadoria_preco_hist').select('*').in('mercadoria_id', mercIds).order('data', { ascending: false }),
        )
      : []
    const itens = recIds.length
      ? await readDependent<ReceitaItem>(
          sb().from('receita_itens').select('*').in('receita_id', recIds).order('ordem', { ascending: true }),
        )
      : []
    const custosExtras = recIds.length
      ? await readDependent<CustoExtra>(sb().from('receita_custos_extras').select('*').in('receita_id', recIds))
      : []
    const porcoes = recIds.length
      ? await readDependent<Porcao>(sb().from('porcoes').select('*').in('receita_id', recIds))
      : []

    return { mercadorias, precoHist, receitas, itens, custosExtras, porcoes }
  },

  async createMercadoria(input) {
    const { data, error } = await sb().from('mercadorias').insert(input).select().single()
    const m = must(data as Mercadoria, error)
    const hist = await sb().from('mercadoria_preco_hist').insert({
      mercadoria_id: m.id,
      preco: m.embalagem_preco,
      qtd: m.embalagem_qtd,
      unidade: m.unidade,
      data: m.atualizado_em || hoje(),
      fornecedor: m.fornecedor,
    })
    if (hist.error) throw hist.error
    return m
  },
  async updateMercadoria(id, input) {
    const { data: antes, error: readError } = await sb().from('mercadorias').select('*').eq('id', id).single()
    if (readError) throw readError

    const { data: atualizada, error } = await sb().from('mercadorias').update(input).eq('id', id).select().single()
    if (error) throw error

    const anterior = antes as Mercadoria
    const atual = atualizada as Mercadoria
    const mudouPreco = input.embalagem_preco !== undefined && input.embalagem_preco !== anterior.embalagem_preco
    const mudouQtd = input.embalagem_qtd !== undefined && input.embalagem_qtd !== anterior.embalagem_qtd
    const mudouUnidade = input.unidade !== undefined && input.unidade !== anterior.unidade

    if (mudouPreco || mudouQtd || mudouUnidade) {
      const hist = await sb().from('mercadoria_preco_hist').insert({
        mercadoria_id: id,
        preco: atual.embalagem_preco,
        qtd: atual.embalagem_qtd,
        unidade: atual.unidade,
        data: input.atualizado_em ?? hoje(),
        fornecedor: atual.fornecedor,
      })
      if (hist.error) throw hist.error
    }
  },
  async deleteMercadoria(id) {
    const { error } = await sb().from('mercadorias').delete().eq('id', id)
    if (error) throw error
  },
  async addPrecoHist(input) {
    const { error } = await sb().from('mercadoria_preco_hist').insert(input)
    if (error) throw error
  },

  async createReceita(input) {
    const { data, error } = await sb().from('receitas').insert(input).select().single()
    return must(data as Receita, error)
  },
  async updateReceita(id, input) {
    const { error } = await sb()
      .from('receitas')
      .update({ ...input, atualizado_em: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },
  async deleteReceita(id) {
    const { error } = await sb().from('receitas').delete().eq('id', id)
    if (error) throw error
  },

  async setItens(receitaId, itens) {
    const del = await sb().from('receita_itens').delete().eq('receita_id', receitaId)
    if (del.error) throw del.error
    if (itens.length) {
      const { error } = await sb().from('receita_itens').insert(itens)
      if (error) throw error
    }
  },
  async setCustosExtras(receitaId, extras) {
    const del = await sb().from('receita_custos_extras').delete().eq('receita_id', receitaId)
    if (del.error) throw del.error
    if (extras.length) {
      const { error } = await sb().from('receita_custos_extras').insert(extras)
      if (error) throw error
    }
  },
  async setPorcoes(receitaId, porcoes) {
    const del = await sb().from('porcoes').delete().eq('receita_id', receitaId)
    if (del.error) throw del.error
    if (porcoes.length) {
      const { error } = await sb().from('porcoes').insert(porcoes)
      if (error) throw error
    }
  },
}

export const repo: Repo = supabaseConfigured ? supabaseRepo : localRepo

// ===========================================================================
// Seed de demonstração — 3 estabelecimentos + dados de exemplo
// ===========================================================================

function seed(): LocalDB {
  const now = new Date().toISOString()
  const data = hoje()

  const nobre: Estabelecimento = { id: uid(), nome: 'Nobre Bistrô', segmento: 'bistro', created_at: now }
  const urica: Estabelecimento = { id: uid(), nome: 'Úrica Maison', segmento: 'a_la_carte', created_at: now }
  const sushi: Estabelecimento = { id: uid(), nome: 'Sushi Boys', segmento: 'japones', created_at: now }

  const mkMerc = (
    nome: string,
    categoria: string,
    unidade: Mercadoria['unidade'],
    qtd: number,
    preco: number,
    fornecedor: string,
  ): Mercadoria => ({
    id: uid(),
    estabelecimento_id: nobre.id,
    nome,
    categoria,
    unidade,
    embalagem_qtd: qtd,
    embalagem_preco: preco,
    fornecedor,
    atualizado_em: data,
    created_at: now,
  })

  const farinha = mkMerc('Farinha de trigo', 'Secos', 'g', 1000, 5.5, 'Atacadão')
  const queijo = mkMerc('Queijo mussarela', 'Laticínios', 'g', 1000, 38.9, 'Bom Leite')
  const tomate = mkMerc('Tomate', 'Hortifruti', 'g', 1000, 7.9, 'CEASA')
  const manjericao = mkMerc('Manjericão', 'Hortifruti', 'g', 100, 4.0, 'CEASA')
  const azeite = mkMerc('Azeite extra virgem', 'Mercearia', 'ml', 500, 32.0, 'Distribuidora Sul')
  const fermento = mkMerc('Fermento biológico', 'Secos', 'g', 500, 18.0, 'Atacadão')
  const sal = mkMerc('Sal refinado', 'Secos', 'g', 1000, 2.5, 'Atacadão')
  const agua = mkMerc('Água', 'Diversos', 'ml', 1000, 0.01, 'Saae')

  const mercadorias = [farinha, queijo, tomate, manjericao, azeite, fermento, sal, agua]

  // Subficha (produção): Molho de tomate — rende 1000 g
  const molho: Receita = {
    id: uid(),
    estabelecimento_id: nobre.id,
    nome: 'Molho de tomate da casa',
    categoria: 'Molhos',
    tipo: 'producao',
    rendimento_valor: 1000,
    rendimento_unidade: 'g',
    rendimento_final_peso: 900,
    tempo_preparo_min: 40,
    validade_congelado_dias: 90,
    validade_refrigerado_dias: 5,
    validade_ambiente_dias: 0,
    preco_venda: 0,
    cmv_meta: 0.3,
    modo_preparo: '1) Escaldar e triturar os tomates. 2) Refogar no azeite com sal. 3) Cozinhar 30 min.',
    observacoes: 'Render mais firme reduzindo a água.',
    created_at: now,
    atualizado_em: now,
  }
  const molhoItens: ReceitaItem[] = [
    { id: uid(), receita_id: molho.id, ordem: 0, titulo_secao: null, tipo: 'mercadoria', ref_id: tomate.id, qtd_liquida: 1200, unidade: 'g', perc_aproveitamento: 0.9, medida_caseira: '~10 tomates' },
    { id: uid(), receita_id: molho.id, ordem: 1, titulo_secao: null, tipo: 'mercadoria', ref_id: azeite.id, qtd_liquida: 30, unidade: 'ml', perc_aproveitamento: 1, medida_caseira: '2 colheres' },
    { id: uid(), receita_id: molho.id, ordem: 2, titulo_secao: null, tipo: 'mercadoria', ref_id: sal.id, qtd_liquida: 10, unidade: 'g', perc_aproveitamento: 1, medida_caseira: '1 colher de chá' },
  ]

  // Ficha de cardápio: Pizza Margherita — usa o molho como subficha
  const pizza: Receita = {
    id: uid(),
    estabelecimento_id: nobre.id,
    nome: 'Pizza Margherita',
    categoria: 'Pizzas',
    tipo: 'cardapio',
    rendimento_valor: 1,
    rendimento_unidade: 'un',
    rendimento_final_peso: 0,
    tempo_preparo_min: 15,
    validade_congelado_dias: 0,
    validade_refrigerado_dias: 1,
    validade_ambiente_dias: 0,
    preco_venda: 49.9,
    cmv_meta: 0.3,
    modo_preparo: '1) Abrir a massa. 2) Cobrir com molho e mussarela. 3) Assar a 280°C por 8 min. 4) Finalizar com manjericão e azeite.',
    observacoes: 'Forno bem quente garante a borda.',
    created_at: now,
    atualizado_em: now,
  }
  const pizzaItens: ReceitaItem[] = [
    { id: uid(), receita_id: pizza.id, ordem: 0, titulo_secao: 'Massa', tipo: 'mercadoria', ref_id: farinha.id, qtd_liquida: 250, unidade: 'g', perc_aproveitamento: 1, medida_caseira: '2 xícaras' },
    { id: uid(), receita_id: pizza.id, ordem: 1, titulo_secao: 'Massa', tipo: 'mercadoria', ref_id: fermento.id, qtd_liquida: 5, unidade: 'g', perc_aproveitamento: 1, medida_caseira: '1 colher de chá' },
    { id: uid(), receita_id: pizza.id, ordem: 2, titulo_secao: 'Massa', tipo: 'mercadoria', ref_id: agua.id, qtd_liquida: 150, unidade: 'ml', perc_aproveitamento: 1, medida_caseira: '¾ xícara' },
    { id: uid(), receita_id: pizza.id, ordem: 3, titulo_secao: 'Cobertura', tipo: 'receita', ref_id: molho.id, qtd_liquida: 120, unidade: 'g', perc_aproveitamento: 1, medida_caseira: '1 concha' },
    { id: uid(), receita_id: pizza.id, ordem: 4, titulo_secao: 'Cobertura', tipo: 'mercadoria', ref_id: queijo.id, qtd_liquida: 150, unidade: 'g', perc_aproveitamento: 1, medida_caseira: '1½ xícara' },
    { id: uid(), receita_id: pizza.id, ordem: 5, titulo_secao: 'Cobertura', tipo: 'mercadoria', ref_id: manjericao.id, qtd_liquida: 5, unidade: 'g', perc_aproveitamento: 0.8, medida_caseira: 'folhas a gosto' },
  ]

  const extras: CustoExtra[] = [
    { id: uid(), receita_id: pizza.id, descricao: 'Embalagem / caixa', valor: 1.5 },
  ]
  const porcoes: Porcao[] = [
    { id: uid(), receita_id: pizza.id, nome: 'Pizza inteira', unidade: 'un', quantidade_que_faz: 1 },
    { id: uid(), receita_id: pizza.id, nome: 'Fatia', unidade: 'un', quantidade_que_faz: 8 },
  ]

  const precoHist: PrecoHist[] = mercadorias.map((m) => ({
    id: uid(),
    mercadoria_id: m.id,
    preco: m.embalagem_preco,
    qtd: m.embalagem_qtd,
    unidade: m.unidade,
    data,
    fornecedor: m.fornecedor,
  }))

  return {
    estabelecimentos: [nobre, urica, sushi],
    mercadorias,
    precoHist,
    receitas: [molho, pizza],
    itens: [...molhoItens, ...pizzaItens],
    custosExtras: extras,
    porcoes,
  }
}
