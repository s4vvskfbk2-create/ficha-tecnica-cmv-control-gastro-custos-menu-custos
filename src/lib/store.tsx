// Store global: estabelecimento selecionado + snapshot em memória + CRUD.
// Centraliza o acesso ao repo e recarrega o snapshot após cada mutação,
// mantendo tela, cálculos e exports sempre consistentes.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { repo } from './db'
import { buildContext, type CalcContext } from './calc'
import type {
  CustoExtraInput,
  Estabelecimento,
  EstabelecimentoInput,
  MercadoriaInput,
  PorcaoInput,
  Receita,
  ReceitaInput,
  ReceitaItemInput,
  Snapshot,
} from './types'

const SEL_KEY = 'ficha-tecnica-cmv:estab'

const empty: Snapshot = {
  mercadorias: [],
  precoHist: [],
  receitas: [],
  itens: [],
  custosExtras: [],
  porcoes: [],
}

interface StoreValue {
  loading: boolean
  estabelecimentos: Estabelecimento[]
  estabelecimento: Estabelecimento | null
  selecionarEstabelecimento: (id: string) => void
  criarEstabelecimento: (input: EstabelecimentoInput) => Promise<void>
  snapshot: Snapshot
  calcCtx: CalcContext
  refresh: () => Promise<void>
  // mercadorias
  criarMercadoria: (input: MercadoriaInput) => Promise<void>
  atualizarMercadoria: (id: string, input: Partial<MercadoriaInput>) => Promise<void>
  excluirMercadoria: (id: string) => Promise<void>
  // receitas
  criarReceita: (input: ReceitaInput) => Promise<Receita>
  atualizarReceita: (id: string, input: Partial<ReceitaInput>) => Promise<void>
  excluirReceita: (id: string) => Promise<void>
  salvarItens: (receitaId: string, itens: ReceitaItemInput[]) => Promise<void>
  salvarCustosExtras: (receitaId: string, extras: CustoExtraInput[]) => Promise<void>
  salvarPorcoes: (receitaId: string, porcoes: PorcaoInput[]) => Promise<void>
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [estabelecimentos, setEstabelecimentos] = useState<Estabelecimento[]>([])
  const [estId, setEstId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot>(empty)

  const loadSnapshot = useCallback(async (id: string) => {
    const snap = await repo.loadSnapshot(id)
    setSnapshot(snap)
  }, [])

  // Bootstrap: carrega estabelecimentos e seleciona o salvo (ou o primeiro).
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const ests = await repo.listEstabelecimentos()
      setEstabelecimentos(ests)
      const salvo = localStorage.getItem(SEL_KEY)
      const ativo = ests.find((e) => e.id === salvo) ?? ests[0] ?? null
      if (ativo) {
        setEstId(ativo.id)
        await loadSnapshot(ativo.id)
      }
      setLoading(false)
    })()
  }, [loadSnapshot])

  const refresh = useCallback(async () => {
    if (estId) await loadSnapshot(estId)
  }, [estId, loadSnapshot])

  const selecionarEstabelecimento = useCallback(
    (id: string) => {
      setEstId(id)
      localStorage.setItem(SEL_KEY, id)
      loadSnapshot(id)
    },
    [loadSnapshot],
  )

  const criarEstabelecimento = useCallback(
    async (input: EstabelecimentoInput) => {
      const e = await repo.createEstabelecimento(input)
      const ests = await repo.listEstabelecimentos()
      setEstabelecimentos(ests)
      selecionarEstabelecimento(e.id)
    },
    [selecionarEstabelecimento],
  )

  const estabelecimento = useMemo(
    () => estabelecimentos.find((e) => e.id === estId) ?? null,
    [estabelecimentos, estId],
  )

  const calcCtx = useMemo(
    () => buildContext(snapshot.mercadorias, snapshot.receitas, snapshot.itens, snapshot.custosExtras),
    [snapshot],
  )

  // Helpers de CRUD que recarregam o snapshot ao final.
  const withRefresh = useCallback(
    async (fn: () => Promise<void>) => {
      await fn()
      await refresh()
    },
    [refresh],
  )

  const value: StoreValue = {
    loading,
    estabelecimentos,
    estabelecimento,
    selecionarEstabelecimento,
    criarEstabelecimento,
    snapshot,
    calcCtx,
    refresh,
    criarMercadoria: (input) =>
      withRefresh(async () => {
        await repo.createMercadoria({ ...input, estabelecimento_id: estId! })
      }),
    atualizarMercadoria: (id, input) => withRefresh(async () => void (await repo.updateMercadoria(id, input))),
    excluirMercadoria: (id) => withRefresh(async () => void (await repo.deleteMercadoria(id))),
    criarReceita: async (input) => {
      const r = await repo.createReceita({ ...input, estabelecimento_id: estId! })
      await refresh()
      return r
    },
    atualizarReceita: (id, input) => withRefresh(async () => void (await repo.updateReceita(id, input))),
    excluirReceita: (id) => withRefresh(async () => void (await repo.deleteReceita(id))),
    salvarItens: (receitaId, itens) => withRefresh(async () => void (await repo.setItens(receitaId, itens))),
    salvarCustosExtras: (receitaId, extras) =>
      withRefresh(async () => void (await repo.setCustosExtras(receitaId, extras))),
    salvarPorcoes: (receitaId, porcoes) => withRefresh(async () => void (await repo.setPorcoes(receitaId, porcoes))),
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore deve ser usado dentro de <StoreProvider>')
  return ctx
}
