import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { repo } from '../lib/db'
import { supabaseConfigured } from '../lib/supabase'
import {
  ImportError,
  importarReceitaIA,
  lerImagemBase64,
  rascunhoLocalDeTexto,
} from '../lib/aiRecipeClient'
import type { AiRecipeDraft } from '../lib/aiRecipe'
import { UNIDADES, type Unidade } from '../lib/types'

// Rascunho editável na tela de revisão (espelha o AiRecipeDraft, já normalizado).
interface IngredienteRevisao {
  nome: string
  quantidade: number | null
  unidade: Unidade
}
interface Revisao {
  nome: string
  categoria: string
  rendimento_valor: number
  rendimento_unidade: Unidade
  preco_venda: number
  ingredientes: IngredienteRevisao[]
  modo_preparo: string
  avisos: string[]
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function mapUnidade(ai: string | null | undefined): Unidade {
  const u = normalizar(ai ?? '')
  if (['g', 'grama', 'gramas'].includes(u)) return 'g'
  if (['kg', 'quilo', 'quilos', 'kilo'].includes(u)) return 'kg'
  if (['ml', 'mililitro', 'mililitros'].includes(u)) return 'ml'
  if (['l', 'litro', 'litros'].includes(u)) return 'L'
  if (['cx', 'caixa', 'caixas'].includes(u)) return 'cx'
  if (['pct', 'pacote', 'pacotes'].includes(u)) return 'pct'
  return 'un'
}

function draftParaRevisao(d: AiRecipeDraft): Revisao {
  return {
    nome: d.nome ?? '',
    categoria: d.categoria ?? '',
    rendimento_valor: d.rendimento_valor ?? 1,
    rendimento_unidade: mapUnidade(d.rendimento_unidade),
    preco_venda: d.preco_venda ?? 0,
    ingredientes: (d.ingredientes ?? []).map((i) => ({
      nome: i.nome ?? '',
      quantidade: i.quantidade ?? null,
      unidade: mapUnidade(i.unidade),
    })),
    modo_preparo: d.modo_preparo ?? '',
    avisos: d.avisos ?? [],
  }
}

const hoje = () => new Date().toISOString().slice(0, 10)

export default function ImportarReceitaPage() {
  const navigate = useNavigate()
  const { estabelecimento, snapshot, refresh } = useStore()

  const [texto, setTexto] = useState('')
  const [imagem, setImagem] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [usouFallback, setUsouFallback] = useState(false)
  const [revisao, setRevisao] = useState<Revisao | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [novosInsumos, setNovosInsumos] = useState<string[]>([])

  function onPickImage(file: File | null) {
    setImagem(file)
    setImagemPreview(file ? URL.createObjectURL(file) : null)
  }

  async function enviar() {
    setErro(null)
    setUsouFallback(false)
    if (!texto.trim() && !imagem) {
      setErro('Cole o texto da receita ou envie uma foto antes de continuar.')
      return
    }
    setLoading(true)
    try {
      let imagemBase64: string | undefined
      let mimeType: string | undefined
      if (imagem) {
        const r = await lerImagemBase64(imagem)
        imagemBase64 = r.base64
        mimeType = r.mimeType
      }
      const draft = await importarReceitaIA({ texto: texto.trim() || undefined, imagemBase64, mimeType })
      setRevisao(draftParaRevisao(draft))
    } catch (e) {
      const msg = e instanceof ImportError ? e.message : 'Falha inesperada ao importar. Tente novamente.'
      setErro(msg)
    } finally {
      setLoading(false)
    }
  }

  function usarRascunhoLocal() {
    setErro(null)
    if (!texto.trim()) {
      setErro('Cole o texto da receita para gerar o rascunho local.')
      return
    }
    const draft = rascunhoLocalDeTexto(texto)
    setRevisao(draftParaRevisao(draft))
    setUsouFallback(true)
  }

  // ---- Revisão ----
  function patch(p: Partial<Revisao>) {
    setRevisao((r) => (r ? { ...r, ...p } : r))
  }
  function patchIng(idx: number, p: Partial<IngredienteRevisao>) {
    setRevisao((r) => (r ? { ...r, ingredientes: r.ingredientes.map((it, i) => (i === idx ? { ...it, ...p } : it)) } : r))
  }
  function addIng() {
    setRevisao((r) => (r ? { ...r, ingredientes: [...r.ingredientes, { nome: '', quantidade: null, unidade: 'g' }] } : r))
  }
  function removeIng(idx: number) {
    setRevisao((r) => (r ? { ...r, ingredientes: r.ingredientes.filter((_, i) => i !== idx) } : r))
  }

  async function confirmar() {
    if (!revisao || !estabelecimento) return
    if (!revisao.nome.trim()) {
      setErro('Dê um nome para a ficha antes de salvar.')
      return
    }
    const validos = revisao.ingredientes.filter((i) => i.nome.trim())
    if (validos.length === 0) {
      setErro('Inclua ao menos um ingrediente com nome.')
      return
    }
    setErro(null)
    setSalvando(true)
    try {
      const estId = estabelecimento.id
      const mapaExistente = new Map(snapshot.mercadorias.map((m) => [normalizar(m.nome), m]))
      const novos: string[] = []

      // Resolve cada ingrediente para uma mercadoria (cria com preço 0 se não existir).
      const refIds: string[] = []
      const unidades: Unidade[] = []
      for (const ing of validos) {
        const existente = mapaExistente.get(normalizar(ing.nome))
        if (existente) {
          refIds.push(existente.id)
          unidades.push(ing.unidade)
        } else {
          const m = await repo.createMercadoria({
            estabelecimento_id: estId,
            nome: ing.nome.trim(),
            categoria: 'Importado',
            unidade: ing.unidade,
            embalagem_qtd: 1,
            embalagem_preco: 0,
            fornecedor: null,
            atualizado_em: hoje(),
          })
          mapaExistente.set(normalizar(m.nome), m)
          refIds.push(m.id)
          unidades.push(ing.unidade)
          novos.push(ing.nome.trim())
        }
      }

      const receita = await repo.createReceita({
        estabelecimento_id: estId,
        nome: revisao.nome.trim(),
        categoria: revisao.categoria.trim() || null,
        tipo: 'cardapio',
        rendimento_valor: revisao.rendimento_valor || 1,
        rendimento_unidade: revisao.rendimento_unidade,
        rendimento_final_peso: 0,
        tempo_preparo_min: 0,
        validade_congelado_dias: 0,
        validade_refrigerado_dias: 0,
        validade_ambiente_dias: 0,
        preco_venda: revisao.preco_venda || 0,
        cmv_meta: 0.3,
        preco_auto: false,
        modo_preparo: revisao.modo_preparo.trim() || null,
        observacoes: revisao.avisos.length ? `Avisos da importação:\n- ${revisao.avisos.join('\n- ')}` : null,
      })

      await repo.setItens(
        receita.id,
        validos.map((ing, i) => ({
          receita_id: receita.id,
          ordem: i,
          titulo_secao: null,
          tipo: 'mercadoria' as const,
          ref_id: refIds[i],
          qtd_liquida: ing.quantidade ?? 0,
          unidade: unidades[i],
          perc_aproveitamento: 1,
          medida_caseira: null,
        })),
      )

      await refresh()
      const importNotice = novos.length
        ? `Ficha importada criada. Criamos ${novos.length} insumo(s) novo(s) com preço R$ 0,00: ${novos.join(', ')}. Atualize os preços para calcular o CMV corretamente.`
        : 'Ficha importada criada com sucesso.'
      setNovosInsumos(novos)
      navigate(`/fichas/${receita.id}`, { state: { importNotice } })
    } catch (e) {
      setErro(`Não consegui salvar a ficha: ${(e as Error)?.message ?? 'erro desconhecido'}.`)
    } finally {
      setSalvando(false)
    }
  }

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div className="import-wrap">
      <div className="page-head">
        <div>
          <button className="link" onClick={() => navigate('/fichas')}>← Fichas</button>
          <h1 style={{ marginTop: 4 }}>Importar receita</h1>
          <div className="sub">Cole o texto ou envie uma foto da receita. A IA monta um rascunho e você revisa antes de salvar.</div>
        </div>
      </div>

      {erro && <div className="msg-erro" role="alert">⚠️ {erro}</div>}
      {novosInsumos.length > 0 && (
        <div className="notice">
          Criamos {novosInsumos.length} insumo(s) novo(s) com <strong>preço R$ 0,00</strong>: {novosInsumos.join(', ')}.
          Atualize o preço deles em <strong>Mercadorias</strong> para o custo ficar correto.
        </div>
      )}

      {!revisao ? (
        // -------- Etapa 1: entrada --------
        <>
          {!supabaseConfigured && (
            <div className="notice">
              A importação com <strong>IA</strong> precisa do backend (Supabase + login), ainda não configurado neste ambiente.
              Você pode usar o botão <strong>“Gerar rascunho do texto (sem IA)”</strong> para testar o fluxo de revisão.
            </div>
          )}

          <div className="card">
            <label htmlFor="texto">1. Texto da receita</label>
            <textarea
              id="texto"
              rows={8}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={'Ex.:\nBolo de cenoura\n3 cenouras\n2 xícaras de açúcar\n1 xícara de óleo\nModo de preparo:\nBata tudo e asse 40 min.'}
            />
            <div className="muted-sm mt">Dica: pode colar de WhatsApp, site ou caderno. Não precisa formatar.</div>
          </div>

          <div className="card">
            <label>2. Foto ou print da receita (opcional)</label>
            <div className="muted-sm mb">Escolha uma foto que já está no celular ou tire uma agora.</div>
            <div className="import-actions">
              <label className="btn lg" style={{ cursor: 'pointer', textAlign: 'center' }}>
                🖼️ Escolher da galeria
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="btn lg" style={{ cursor: 'pointer', textAlign: 'center' }}>
                📷 Tirar foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {imagemPreview && (
              <div className="mt">
                <img src={imagemPreview} alt="Prévia da receita" className="import-preview" />
                <button className="btn sm ghost mt" onClick={() => onPickImage(null)}>Remover foto</button>
              </div>
            )}
            <div className="muted-sm mt">A foto é enviada com segurança ao servidor. A leitura por foto exige o backend de IA.</div>
          </div>

          <div className="import-actions">
            <button className="btn primary lg" onClick={enviar} disabled={loading}>
              {loading ? 'Lendo a receita…' : '✨ Importar com IA'}
            </button>
            <button className="btn lg" onClick={usarRascunhoLocal} disabled={loading || !texto.trim()}>
              Gerar rascunho do texto (sem IA)
            </button>
          </div>
          {loading && <div className="msg-load">⏳ Estamos lendo sua receita. Isso leva alguns segundos…</div>}
        </>
      ) : (
        // -------- Etapa 2: revisão --------
        <>
          <div className="msg-ok">
            ✅ Rascunho pronto! {usouFallback ? '(gerado do texto, sem IA) ' : ''}
            <strong>Confira e ajuste tudo</strong> antes de salvar — nada é salvo automaticamente.
          </div>

          {revisao.avisos.length > 0 && (
            <div className="notice">
              <strong>Avisos da IA:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {revisao.avisos.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}

          <div className="card">
            <div className="form-grid">
              <div>
                <label>Nome da ficha</label>
                <input value={revisao.nome} onChange={(e) => patch({ nome: e.target.value })} />
              </div>
              <div>
                <label>Categoria</label>
                <input value={revisao.categoria} onChange={(e) => patch({ categoria: e.target.value })} placeholder="Ex.: Bolos" />
              </div>
              <div>
                <label>Rendimento</label>
                <input type="number" min={0} step="any" value={revisao.rendimento_valor || ''} onChange={(e) => patch({ rendimento_valor: Number(e.target.value) })} />
              </div>
              <div>
                <label>Unidade do rendimento</label>
                <select value={revisao.rendimento_unidade} onChange={(e) => patch({ rendimento_unidade: e.target.value as Unidade })}>
                  {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label>Preço de venda (R$) — opcional</label>
                <input type="number" min={0} step="any" value={revisao.preco_venda || ''} onChange={(e) => patch({ preco_venda: Number(e.target.value) })} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="row mb">
              <h3 className="grow" style={{ margin: 0 }}>Ingredientes</h3>
              <button className="btn sm" onClick={addIng}>+ Ingrediente</button>
            </div>
            {revisao.ingredientes.length === 0 ? (
              <div className="muted-sm">Nenhum ingrediente. Clique em “+ Ingrediente”.</div>
            ) : (
              <div className="ing-list">
                {revisao.ingredientes.map((ing, i) => (
                  <div className="ing-row" key={i}>
                    <input className="ing-nome" value={ing.nome} onChange={(e) => patchIng(i, { nome: e.target.value })} placeholder="Nome do ingrediente" />
                    <input className="ing-qtd" type="number" min={0} step="any" value={ing.quantidade ?? ''} onChange={(e) => patchIng(i, { quantidade: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Qtd" />
                    <select className="ing-un" value={ing.unidade} onChange={(e) => patchIng(i, { unidade: e.target.value as Unidade })}>
                      {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <button className="btn sm ghost" onClick={() => removeIng(i)} aria-label="Remover">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="muted-sm mt">Ingredientes que ainda não existem em Mercadorias serão criados com preço R$ 0,00 para você preencher depois.</div>
          </div>

          <div className="card">
            <label>Modo de preparo</label>
            <textarea rows={6} value={revisao.modo_preparo} onChange={(e) => patch({ modo_preparo: e.target.value })} placeholder="Passo a passo do preparo" />
          </div>

          <div className="import-actions">
            <button className="btn primary lg" onClick={confirmar} disabled={salvando}>
              {salvando ? 'Salvando…' : '✅ Criar ficha técnica'}
            </button>
            <button className="btn lg" onClick={() => { setRevisao(null); setUsouFallback(false) }} disabled={salvando}>
              Voltar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
