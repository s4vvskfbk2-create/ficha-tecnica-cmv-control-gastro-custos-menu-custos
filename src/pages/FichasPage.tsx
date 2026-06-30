import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { calcularFicha, formatBRL, formatPct } from '../lib/calc'
import { avaliarCMV } from '../lib/benchmark'
import type { ReceitaInput, ReceitaTipo, Unidade } from '../lib/types'
import { UNIDADES } from '../lib/types'

const novaReceita = (tipo: ReceitaTipo): Omit<ReceitaInput, 'estabelecimento_id'> => ({
  nome: '',
  categoria: '',
  tipo,
  rendimento_valor: 1,
  rendimento_unidade: tipo === 'cardapio' ? 'un' : 'g',
  rendimento_final_peso: 0,
  tempo_preparo_min: 0,
  validade_congelado_dias: 0,
  validade_refrigerado_dias: 0,
  validade_ambiente_dias: 0,
  preco_venda: 0,
  cmv_meta: 0.3,
  modo_preparo: '',
  observacoes: '',
})

export default function FichasPage() {
  const { snapshot, calcCtx, estabelecimento, criarReceita, excluirReceita } = useStore()
  const navigate = useNavigate()
  const [novo, setNovo] = useState(false)
  const [form, setForm] = useState(novaReceita('cardapio'))
  const [filtroTipo, setFiltroTipo] = useState<'todos' | ReceitaTipo>('todos')

  const fichas = useMemo(() => {
    return snapshot.receitas
      .filter((r) => filtroTipo === 'todos' || r.tipo === filtroTipo)
      .map((r) => ({ receita: r, calc: calcularFicha(r, calcCtx) }))
  }, [snapshot.receitas, calcCtx, filtroTipo])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim() || !estabelecimento) return
    const r = await criarReceita({ ...form, estabelecimento_id: estabelecimento.id })
    setNovo(false)
    setForm(novaReceita('cardapio'))
    navigate(`/fichas/${r.id}`)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Fichas Técnicas</h1>
          <div className="sub">Receitas de cardápio e de produção (subfichas) — {estabelecimento?.nome}.</div>
        </div>
        <div className="toolbar">
          <div className="tabs">
            {(['todos', 'cardapio', 'producao'] as const).map((t) => (
              <button key={t} className={filtroTipo === t ? 'active' : ''} onClick={() => setFiltroTipo(t)}>
                {t === 'todos' ? 'Todas' : t === 'cardapio' ? 'Cardápio' : 'Produção'}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => navigate('/fichas/importar')}>📷 Importar receita</button>
          <button className="btn primary" onClick={() => setNovo((v) => !v)}>+ Nova ficha</button>
        </div>
      </div>

      {novo && (
        <form className="card" onSubmit={criar}>
          <div className="form-grid">
            <div>
              <label>Nome</label>
              <input autoFocus value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Risoto de funghi" />
            </div>
            <div>
              <label>Categoria</label>
              <input value={form.categoria ?? ''} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Pratos principais" />
            </div>
            <div>
              <label>Tipo</label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as ReceitaTipo })}>
                <option value="cardapio">Cardápio (venda)</option>
                <option value="producao">Produção (subficha)</option>
              </select>
            </div>
            <div>
              <label>Rendimento</label>
              <input type="number" min={0} step="any" value={form.rendimento_valor || ''} onChange={(e) => setForm({ ...form, rendimento_valor: Number(e.target.value) })} />
            </div>
            <div>
              <label>Unidade rend.</label>
              <select value={form.rendimento_unidade} onChange={(e) => setForm({ ...form, rendimento_unidade: e.target.value as Unidade })}>
                {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="row mt" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => setNovo(false)}>Cancelar</button>
            <button type="submit" className="btn primary">Criar e editar</button>
          </div>
        </form>
      )}

      <div className="card" style={{ padding: 0 }}>
        {fichas.length === 0 ? (
          <div className="empty">Nenhuma ficha cadastrada. Clique em “+ Nova ficha”.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ficha</th>
                <th>Tipo</th>
                <th className="num">Custo/porção</th>
                <th className="num">Preço</th>
                <th className="num">CMV</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fichas.map(({ receita, calc }) => {
                const status = avaliarCMV(calc.cmvPct, estabelecimento?.segmento ?? 'outro')
                return (
                  <tr key={receita.id}>
                    <td>
                      <button className="link" onClick={() => navigate(`/fichas/${receita.id}`)}>{receita.nome}</button>
                      {receita.categoria && <div className="muted-sm">{receita.categoria}</div>}
                    </td>
                    <td>
                      <span className={`badge ${receita.tipo === 'cardapio' ? 'tipo' : 'prod'}`}>
                        {receita.tipo === 'cardapio' ? 'Cardápio' : 'Produção'}
                      </span>
                    </td>
                    <td className="num">{formatBRL(calc.custoPorcao)}</td>
                    <td className="num">{receita.tipo === 'cardapio' ? formatBRL(receita.preco_venda) : '—'}</td>
                    <td className="num">{receita.preco_venda > 0 ? formatPct(calc.cmvPct) : '—'}</td>
                    <td>{receita.tipo === 'cardapio' ? <span className={`badge ${status.nivel}`}>{status.texto}</span> : <span className="muted-sm">subficha</span>}</td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn sm" onClick={() => navigate(`/fichas/${receita.id}`)}>Abrir</button>
                        <button className="btn sm ghost" onClick={() => excluirReceita(receita.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
