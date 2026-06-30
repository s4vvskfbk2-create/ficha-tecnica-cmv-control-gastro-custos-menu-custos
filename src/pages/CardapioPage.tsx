import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { calcularFicha, formatBRL, formatPct, formatX } from '../lib/calc'
import { avaliarCMV, FAIXA_CMV } from '../lib/benchmark'

export default function CardapioPage() {
  const { snapshot, calcCtx, estabelecimento, atualizarReceita } = useStore()
  const navigate = useNavigate()
  const seg = estabelecimento?.segmento ?? 'outro'

  const itens = useMemo(
    () =>
      snapshot.receitas
        .filter((r) => r.tipo === 'cardapio')
        .map((r) => ({ r, c: calcularFicha(r, calcCtx) }))
        .sort((a, b) => a.r.nome.localeCompare(b.r.nome)),
    [snapshot.receitas, calcCtx],
  )

  async function setPreco(id: string, preco: number) {
    await atualizarReceita(id, { preco_venda: preco })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cardápio &amp; Precificação</h1>
          <div className="sub">
            Preços de venda, CMV e margem — {estabelecimento?.nome}. Faixa ideal: {FAIXA_CMV[seg].rotulo}.
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {itens.length === 0 ? (
          <div className="empty">Nenhuma ficha de cardápio. <button className="link" onClick={() => navigate('/fichas')}>Criar ficha</button></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Prato</th>
                <th className="num">Custo/porção</th>
                <th className="num">Preço de venda</th>
                <th className="num">Preço p/ meta</th>
                <th className="num">CMV</th>
                <th className="num">Margem</th>
                <th className="num">Markup</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {itens.map(({ r, c }) => {
                const st = avaliarCMV(c.cmvPct, seg)
                return (
                  <tr key={r.id}>
                    <td>
                      <button className="link" onClick={() => navigate(`/fichas/${r.id}`)}>{r.nome}</button>
                      {r.categoria && <div className="muted-sm">{r.categoria}</div>}
                    </td>
                    <td className="num">{formatBRL(c.custoPorcao)}</td>
                    <td className="num">
                      <input
                        className="inline-input wide"
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={r.preco_venda || ''}
                        onBlur={(e) => {
                          const v = Number(e.target.value)
                          if (v !== r.preco_venda) setPreco(r.id, v)
                        }}
                      />
                    </td>
                    <td className="num">
                      <span className="muted-sm" title={`Meta ${formatPct(r.cmv_meta * 100)}`}>{formatBRL(c.precoPorMeta)}</span>
                    </td>
                    <td className="num">{r.preco_venda > 0 ? formatPct(c.cmvPct) : '—'}</td>
                    <td className="num">{r.preco_venda > 0 ? `${formatBRL(c.margemRs)} · ${formatPct(c.margemPct)}` : '—'}</td>
                    <td className="num">{c.markup > 0 ? formatX(c.markup) : '—'}</td>
                    <td><span className={`badge ${st.nivel}`}>{st.texto}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="notice" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af' }}>
        💡 Edite o preço diretamente nesta tela (sai do campo para salvar). A coluna <strong>Preço p/ meta</strong> mostra
        o preço sugerido para atingir a meta de CMV definida em cada ficha. Regra de ouro: <strong>Margem % + CMV % = 100%</strong>.
      </div>
    </>
  )
}
