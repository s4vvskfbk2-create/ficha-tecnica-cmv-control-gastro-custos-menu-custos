import { useEffect, useState } from 'react'
import { repo } from '../lib/db'
import { custoUnitario, formatBRL, formatNum } from '../lib/calc'
import { exportMercadoriasExcel } from '../lib/excel'
import { supabaseConfigured } from '../lib/supabase'
import type { Mercadoria, MercadoriaInput, Unidade } from '../lib/types'

const UNIDADES: Unidade[] = ['g', 'kg', 'ml', 'L', 'un']

const vazio: MercadoriaInput = {
  nome: '',
  categoria: '',
  unidade: 'g',
  embalagem_qtd: 0,
  embalagem_preco: 0,
  fornecedor: '',
}

export default function MercadoriasPage() {
  const [mercadorias, setMercadorias] = useState<Mercadoria[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<MercadoriaInput>(vazio)
  const [editId, setEditId] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setMercadorias(await repo.listMercadorias())
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  function startEdit(m: Mercadoria) {
    setEditId(m.id)
    setForm({
      nome: m.nome,
      categoria: m.categoria ?? '',
      unidade: m.unidade,
      embalagem_qtd: m.embalagem_qtd,
      embalagem_preco: m.embalagem_preco,
      fornecedor: m.fornecedor ?? '',
    })
  }

  function resetForm() {
    setEditId(null)
    setForm(vazio)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim()) return
    if (editId) await repo.updateMercadoria(editId, form)
    else await repo.createMercadoria(form)
    resetForm()
    await refresh()
  }

  async function remove(m: Mercadoria) {
    if (!confirm(`Excluir "${m.nome}"? Os itens de ficha que a usam serão removidos.`)) return
    await repo.deleteMercadoria(m.id)
    await refresh()
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mercadorias</h1>
          <div className="sub">Insumos e matérias-primas usados nas fichas técnicas.</div>
        </div>
        <div className="toolbar">
          <button
            className="btn"
            onClick={() => exportMercadoriasExcel(mercadorias)}
            disabled={!mercadorias.length}
          >
            ⬇ Excel (fórmulas vivas)
          </button>
        </div>
      </div>

      {!supabaseConfigured && (
        <div className="notice">
          Modo local ativo — os dados ficam salvos neste navegador. Configure as variáveis
          <code> VITE_SUPABASE_URL </code> e <code> VITE_SUPABASE_ANON_KEY </code> para usar o Supabase.
        </div>
      )}

      <form className="card" onSubmit={submit}>
        <div className="form-grid">
          <div>
            <label>Nome</label>
            <input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex.: Queijo mussarela"
            />
          </div>
          <div>
            <label>Categoria</label>
            <input
              value={form.categoria ?? ''}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              placeholder="Laticínios"
            />
          </div>
          <div>
            <label>Unidade base</label>
            <select
              value={form.unidade}
              onChange={(e) => setForm({ ...form, unidade: e.target.value as Unidade })}
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Qtd. da embalagem ({form.unidade})</label>
            <input
              type="number"
              min={0}
              step="any"
              value={form.embalagem_qtd || ''}
              onChange={(e) => setForm({ ...form, embalagem_qtd: Number(e.target.value) })}
            />
          </div>
          <div>
            <label>Preço da embalagem (R$)</label>
            <input
              type="number"
              min={0}
              step="any"
              value={form.embalagem_preco || ''}
              onChange={(e) => setForm({ ...form, embalagem_preco: Number(e.target.value) })}
            />
          </div>
          <div>
            <label>Fornecedor</label>
            <input
              value={form.fornecedor ?? ''}
              onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
              placeholder="Opcional"
            />
          </div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <div className="grow tag">
            Custo unitário: <strong>{formatBRL(custoUnitario(form))}</strong> / {form.unidade}
          </div>
          {editId && (
            <button type="button" className="btn" onClick={resetForm}>
              Cancelar
            </button>
          )}
          <button type="submit" className="btn primary">
            {editId ? 'Salvar alterações' : 'Adicionar mercadoria'}
          </button>
        </div>
      </form>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="empty">Carregando…</div>
        ) : mercadorias.length === 0 ? (
          <div className="empty">Nenhuma mercadoria cadastrada ainda.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Mercadoria</th>
                <th>Categoria</th>
                <th className="num">Embalagem</th>
                <th className="num">Preço</th>
                <th className="num">Custo unit.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {mercadorias.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.nome}</strong>
                    {m.fornecedor && <div className="sub">{m.fornecedor}</div>}
                  </td>
                  <td>{m.categoria || '—'}</td>
                  <td className="num">
                    {formatNum(m.embalagem_qtd)} {m.unidade}
                  </td>
                  <td className="num">{formatBRL(m.embalagem_preco)}</td>
                  <td className="num">
                    {formatBRL(custoUnitario(m))}/{m.unidade}
                  </td>
                  <td className="num">
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn sm" onClick={() => startEdit(m)}>
                        Editar
                      </button>
                      <button className="btn sm ghost" onClick={() => remove(m)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
