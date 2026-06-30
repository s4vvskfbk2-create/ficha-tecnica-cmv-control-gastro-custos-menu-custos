import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { custoUnitario, formatBRL, formatBRL4, formatNum } from '../lib/calc'
import { exportMercadoriasExcel } from '../lib/excel'
import { supabaseConfigured } from '../lib/supabase'
import { UNIDADES, type Mercadoria, type MercadoriaInput, type PrecoHist, type Unidade } from '../lib/types'

const hoje = () => new Date().toISOString().slice(0, 10)

const vazio = (): MercadoriaInput => ({
  estabelecimento_id: '',
  nome: '',
  categoria: '',
  unidade: 'g',
  embalagem_qtd: 0,
  embalagem_preco: 0,
  fornecedor: '',
  atualizado_em: hoje(),
})

export default function MercadoriasPage() {
  const { snapshot, estabelecimento, criarMercadoria, atualizarMercadoria, excluirMercadoria } = useStore()
  const mercadorias = snapshot.mercadorias

  const [form, setForm] = useState<MercadoriaInput>(vazio())
  const [editId, setEditId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [fCategoria, setFCategoria] = useState('')
  const [fFornecedor, setFFornecedor] = useState('')
  const [histId, setHistId] = useState<string | null>(null)

  const categorias = useMemo(
    () => [...new Set(mercadorias.map((m) => m.categoria).filter(Boolean))] as string[],
    [mercadorias],
  )
  const fornecedores = useMemo(
    () => [...new Set(mercadorias.map((m) => m.fornecedor).filter(Boolean))] as string[],
    [mercadorias],
  )

  const filtradas = mercadorias.filter((m) => {
    if (busca && !m.nome.toLowerCase().includes(busca.toLowerCase())) return false
    if (fCategoria && m.categoria !== fCategoria) return false
    if (fFornecedor && m.fornecedor !== fFornecedor) return false
    return true
  })

  function startEdit(m: Mercadoria) {
    setEditId(m.id)
    setForm({
      estabelecimento_id: m.estabelecimento_id,
      nome: m.nome,
      categoria: m.categoria ?? '',
      unidade: m.unidade,
      embalagem_qtd: m.embalagem_qtd,
      embalagem_preco: m.embalagem_preco,
      fornecedor: m.fornecedor ?? '',
      atualizado_em: hoje(),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setEditId(null)
    setForm(vazio())
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim() || !estabelecimento) return
    if (editId) await atualizarMercadoria(editId, form)
    else await criarMercadoria(form)
    resetForm()
  }

  async function remove(m: Mercadoria) {
    if (!confirm(`Excluir "${m.nome}"? As linhas de ficha que a usam serão removidas.`)) return
    await excluirMercadoria(m.id)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mercadorias</h1>
          <div className="sub">Insumos base e preços de compra — {estabelecimento?.nome}.</div>
        </div>
        <div className="toolbar">
          <button
            className="btn"
            onClick={() => exportMercadoriasExcel(mercadorias, `mercadorias-${estabelecimento?.nome ?? ''}`)}
            disabled={!mercadorias.length}
          >
            ⬇ Excel (fórmulas vivas)
          </button>
        </div>
      </div>

      {!supabaseConfigured && (
        <div className="notice">
          Modo local — dados salvos neste navegador. Configure <code>VITE_SUPABASE_URL</code> e
          <code> VITE_SUPABASE_ANON_KEY</code> para usar o Supabase.
        </div>
      )}

      <form className="card" onSubmit={submit}>
        <div className="form-grid">
          <div>
            <label>Nome</label>
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Queijo mussarela" />
          </div>
          <div>
            <label>Categoria</label>
            <input list="cats" value={form.categoria ?? ''} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Laticínios" />
            <datalist id="cats">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label>Unidade base</label>
            <select value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value as Unidade })}>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label>Qtd. da embalagem ({form.unidade})</label>
            <input type="number" min={0} step="any" value={form.embalagem_qtd || ''} onChange={(e) => setForm({ ...form, embalagem_qtd: Number(e.target.value) })} />
          </div>
          <div>
            <label>Preço da embalagem (R$)</label>
            <input type="number" min={0} step="any" value={form.embalagem_preco || ''} onChange={(e) => setForm({ ...form, embalagem_preco: Number(e.target.value) })} />
          </div>
          <div>
            <label>Fornecedor</label>
            <input list="forns" value={form.fornecedor ?? ''} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} placeholder="Opcional" />
            <datalist id="forns">{fornecedores.map((f) => <option key={f} value={f} />)}</datalist>
          </div>
        </div>
        <div className="row mt">
          <div className="grow tag">
            Custo unitário: <strong>{formatBRL4(custoUnitario(form))}</strong> / {form.unidade}
          </div>
          {editId && <button type="button" className="btn" onClick={resetForm}>Cancelar</button>}
          <button type="submit" className="btn primary">{editId ? 'Salvar alterações' : 'Adicionar mercadoria'}</button>
        </div>
      </form>

      <div className="card">
        <div className="form-grid">
          <div>
            <label>Buscar</label>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do insumo…" />
          </div>
          <div>
            <label>Categoria</label>
            <select value={fCategoria} onChange={(e) => setFCategoria(e.target.value)}>
              <option value="">Todas</option>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label>Fornecedor</label>
            <select value={fFornecedor} onChange={(e) => setFFornecedor(e.target.value)}>
              <option value="">Todos</option>
              {fornecedores.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {filtradas.length === 0 ? (
          <div className="empty">Nenhuma mercadoria encontrada.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Mercadoria</th>
                <th>Categoria</th>
                <th className="num">Embalagem</th>
                <th className="num">Preço</th>
                <th className="num">Custo unit.</th>
                <th>Atualizado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtradas.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.nome}</strong>
                    {m.fornecedor && <div className="muted-sm">{m.fornecedor}</div>}
                  </td>
                  <td>{m.categoria || '—'}</td>
                  <td className="num">{formatNum(m.embalagem_qtd)} {m.unidade}</td>
                  <td className="num">{formatBRL(m.embalagem_preco)}</td>
                  <td className="num">{formatBRL4(custoUnitario(m))}/{m.unidade}</td>
                  <td><span className="muted-sm">{m.atualizado_em}</span></td>
                  <td className="num">
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn sm" onClick={() => setHistId(m.id)}>Histórico</button>
                      <button className="btn sm" onClick={() => startEdit(m)}>Editar</button>
                      <button className="btn sm ghost" onClick={() => remove(m)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {histId && (
        <HistoricoDialog
          mercadoria={mercadorias.find((m) => m.id === histId)!}
          hist={snapshot.precoHist.filter((p) => p.mercadoria_id === histId)}
          onClose={() => setHistId(null)}
        />
      )}
    </>
  )
}

function HistoricoDialog({ mercadoria, hist, onClose }: { mercadoria: Mercadoria; hist: PrecoHist[]; onClose: () => void }) {
  const ordenado = [...hist].sort((a, b) => b.data.localeCompare(a.data))
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Histórico de preços — {mercadoria.nome}</h3>
        {ordenado.length === 0 ? (
          <div className="empty">Sem registros de preço.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Data</th><th className="num">Preço</th><th className="num">Qtd</th><th className="num">Custo unit.</th><th>Fornecedor</th></tr>
            </thead>
            <tbody>
              {ordenado.map((p) => (
                <tr key={p.id}>
                  <td>{p.data}</td>
                  <td className="num">{formatBRL(p.preco)}</td>
                  <td className="num">{formatNum(p.qtd)} {p.unidade}</td>
                  <td className="num">{formatBRL4(p.qtd ? p.preco / p.qtd : 0)}</td>
                  <td>{p.fornecedor || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row mt" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
