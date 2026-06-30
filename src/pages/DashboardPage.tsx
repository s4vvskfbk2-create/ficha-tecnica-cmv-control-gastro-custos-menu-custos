import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { calcularFicha, formatBRL, formatPct } from '../lib/calc'
import { avaliarCMV, labelSegmento, FAIXA_CMV, SEGMENTOS } from '../lib/benchmark'
import type { Segmento } from '../lib/types'

export default function DashboardPage() {
  const { snapshot, calcCtx, estabelecimento, loading, criarEstabelecimento } = useStore()
  const navigate = useNavigate()
  const [novo, setNovo] = useState(false)
  const [nome, setNome] = useState('')
  const [segmento, setSegmento] = useState<Segmento>('bistro')

  const cardapio = useMemo(
    () => snapshot.receitas.filter((r) => r.tipo === 'cardapio').map((r) => ({ r, c: calcularFicha(r, calcCtx) })),
    [snapshot.receitas, calcCtx],
  )

  const comPreco = cardapio.filter((x) => x.r.preco_venda > 0)
  const cmvMedio = comPreco.length ? comPreco.reduce((s, x) => s + x.c.cmvPct, 0) / comPreco.length : 0
  const seg = estabelecimento?.segmento ?? 'outro'
  const alertas = comPreco.filter((x) => avaliarCMV(x.c.cmvPct, seg).nivel === 'danger')
  const semPreco = snapshot.mercadorias.filter((m) => m.embalagem_preco <= 0)
  const faturamentoPotencial = comPreco.reduce((s, x) => s + x.r.preco_venda, 0)

  if (loading) return <div className="empty">Carregando…</div>

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    await criarEstabelecimento({ nome: nome.trim(), segmento })
    setNovo(false)
    setNome('')
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">
            {estabelecimento ? `${estabelecimento.nome} · ${labelSegmento(estabelecimento.segmento)}` : 'Sem estabelecimento'}
          </div>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={() => setNovo((v) => !v)}>+ Estabelecimento</button>
        </div>
      </div>

      {semPreco.length > 0 && (
        <div className="notice">
          Existem <strong>{semPreco.length}</strong> mercadoria(s) com preço R$ 0,00. Atualize esses preços para o CMV ficar confiável.
          {' '}<button className="link" onClick={() => navigate('/mercadorias')}>Ver mercadorias</button>
        </div>
      )}

      {novo && (
        <form className="card" onSubmit={criar}>
          <div className="form-grid">
            <div>
              <label>Nome do estabelecimento</label>
              <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Úrica Maison" />
            </div>
            <div>
              <label>Segmento</label>
              <select value={segmento} onChange={(e) => setSegmento(e.target.value as Segmento)}>
                {SEGMENTOS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="row mt" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => setNovo(false)}>Cancelar</button>
            <button type="submit" className="btn primary">Criar</button>
          </div>
        </form>
      )}

      <div className="metrics mb">
        <div className="metric">
          <div className="label">Mercadorias</div>
          <div className="value">{snapshot.mercadorias.length}</div>
        </div>
        <div className="metric">
          <div className="label">Fichas de cardápio</div>
          <div className="value">{cardapio.length}</div>
        </div>
        <div className="metric">
          <div className="label">Subfichas (produção)</div>
          <div className="value">{snapshot.receitas.length - cardapio.length}</div>
        </div>
        <div className="metric">
          <div className="label">CMV médio do cardápio</div>
          <div className={`value ${cmvMedio > 40 ? 'danger' : cmvMedio > 0 && cmvMedio < (FAIXA_CMV[seg].max * 100) ? 'good' : 'warn'}`}>
            {comPreco.length ? formatPct(cmvMedio) : '—'}
          </div>
        </div>
        <div className="metric">
          <div className="label">Itens com CMV alto</div>
          <div className={`value ${alertas.length ? 'danger' : 'good'}`}>{alertas.length}</div>
        </div>
        <div className="metric">
          <div className="label">Preço somado (cardápio)</div>
          <div className="value">{formatBRL(faturamentoPotencial)}</div>
        </div>
      </div>

      <div className="card">
        <div className="row mb">
          <h3 className="grow" style={{ margin: 0 }}>Engenharia de cardápio — CMV por item</h3>
          <span className="muted-sm">Faixa ideal do segmento: {FAIXA_CMV[seg].rotulo}</span>
        </div>
        {cardapio.length === 0 ? (
          <div className="empty">Nenhuma ficha de cardápio. <button className="link" onClick={() => navigate('/fichas')}>Criar ficha</button></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Prato</th>
                <th className="num">Custo/porção</th>
                <th className="num">Preço</th>
                <th className="num">CMV</th>
                <th className="num">Margem</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cardapio
                .slice()
                .sort((a, b) => b.c.cmvPct - a.c.cmvPct)
                .map(({ r, c }) => {
                  const st = avaliarCMV(c.cmvPct, seg)
                  return (
                    <tr key={r.id}>
                      <td><button className="link" onClick={() => navigate(`/fichas/${r.id}`)}>{r.nome}</button></td>
                      <td className="num">{formatBRL(c.custoPorcao)}</td>
                      <td className="num">{r.preco_venda > 0 ? formatBRL(r.preco_venda) : '—'}</td>
                      <td className="num">{r.preco_venda > 0 ? formatPct(c.cmvPct) : '—'}</td>
                      <td className="num">{r.preco_venda > 0 ? formatPct(c.margemPct) : '—'}</td>
                      <td><span className={`badge ${st.nivel}`}>{st.texto}</span></td>
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
