import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { calcularFicha, formatBRL, formatPct } from '../lib/calc'
import { avaliarCMV } from '../lib/benchmark'

export default function RelatoriosPage() {
  const { snapshot, calcCtx, estabelecimento } = useStore()
  const navigate = useNavigate()
  const [faturamento, setFaturamento] = useState(50000)
  const [maoObraPct, setMaoObraPct] = useState(28)
  const [despesasPct, setDespesasPct] = useState(22)
  const [impostosPct, setImpostosPct] = useState(8)

  const cardapio = useMemo(
    () => snapshot.receitas.filter((r) => r.tipo === 'cardapio').map((r) => ({ receita: r, calc: calcularFicha(r, calcCtx) })),
    [snapshot.receitas, calcCtx],
  )
  const comPreco = cardapio.filter((x) => x.receita.preco_venda > 0)
  const cmvMedio = comPreco.length ? comPreco.reduce((s, x) => s + x.calc.cmvPct, 0) / comPreco.length : 0
  const cmvRs = faturamento * (cmvMedio / 100)
  const maoObraRs = faturamento * (maoObraPct / 100)
  const despesasRs = faturamento * (despesasPct / 100)
  const impostosRs = faturamento * (impostosPct / 100)
  const primeCostRs = cmvRs + maoObraRs
  const primeCostPct = faturamento > 0 ? (primeCostRs / faturamento) * 100 : 0
  const resultadoRs = faturamento - cmvRs - maoObraRs - despesasRs - impostosRs
  const resultadoPct = faturamento > 0 ? (resultadoRs / faturamento) * 100 : 0
  const seg = estabelecimento?.segmento ?? 'outro'
  const criticos = comPreco
    .filter((x) => avaliarCMV(x.calc.cmvPct, seg).nivel === 'danger')
    .sort((a, b) => b.calc.cmvPct - a.calc.cmvPct)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Relatórios &amp; Prime Cost</h1>
          <div className="sub">Simulador gerencial da fase 2 — {estabelecimento?.nome}. Usa o CMV teórico das fichas já cadastradas.</div>
        </div>
      </div>

      <div className="notice" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af' }}>
        Esta tela não altera dados. Ela usa o cardápio atual para projetar CMV, Prime Cost e resultado operacional simplificado.
      </div>

      <div className="card">
        <div className="form-grid">
          <div>
            <label>Faturamento projetado (R$)</label>
            <input type="number" min={0} step="any" value={faturamento || ''} onChange={(e) => setFaturamento(Number(e.target.value))} />
          </div>
          <div>
            <label>Mão de obra / CMO (%)</label>
            <input type="number" min={0} step="any" value={maoObraPct || ''} onChange={(e) => setMaoObraPct(Number(e.target.value))} />
          </div>
          <div>
            <label>Despesas operacionais (%)</label>
            <input type="number" min={0} step="any" value={despesasPct || ''} onChange={(e) => setDespesasPct(Number(e.target.value))} />
          </div>
          <div>
            <label>Impostos/taxas (%)</label>
            <input type="number" min={0} step="any" value={impostosPct || ''} onChange={(e) => setImpostosPct(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <div className="metrics mb">
        <Metric label="CMV teórico médio" value={comPreco.length ? formatPct(cmvMedio) : '—'} tone={cmvMedio > 40 ? 'danger' : 'good'} />
        <Metric label="CMV projetado" value={formatBRL(cmvRs)} />
        <Metric label="Mão de obra" value={formatBRL(maoObraRs)} />
        <Metric label="Prime Cost" value={`${formatBRL(primeCostRs)} · ${formatPct(primeCostPct)}`} tone={primeCostPct > 65 ? 'danger' : primeCostPct > 55 ? 'warn' : 'good'} />
        <Metric label="Despesas + impostos" value={formatBRL(despesasRs + impostosRs)} />
        <Metric label="Resultado projetado" value={`${formatBRL(resultadoRs)} · ${formatPct(resultadoPct)}`} tone={resultadoRs < 0 ? 'danger' : resultadoPct < 10 ? 'warn' : 'good'} />
      </div>

      <div className="card">
        <div className="row mb">
          <h3 className="grow" style={{ margin: 0 }}>Itens críticos para revisão</h3>
          <span className="muted-sm">Ordenado por maior CMV</span>
        </div>
        {criticos.length === 0 ? (
          <div className="empty">Nenhum item crítico com preço definido.</div>
        ) : (
          <table>
            <thead><tr><th>Ficha</th><th className="num">Custo/porção</th><th className="num">Preço</th><th className="num">CMV</th><th>Status</th></tr></thead>
            <tbody>
              {criticos.map(({ receita, calc }) => {
                const status = avaliarCMV(calc.cmvPct, seg)
                return (
                  <tr key={receita.id}>
                    <td><button className="link" onClick={() => navigate(`/fichas/${receita.id}`)}>{receita.nome}</button></td>
                    <td className="num">{formatBRL(calc.custoPorcao)}</td>
                    <td className="num">{formatBRL(receita.preco_venda)}</td>
                    <td className="num">{formatPct(calc.cmvPct)}</td>
                    <td><span className={`badge ${status.nivel}`}>{status.texto}</span></td>
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

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'danger' }) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <div className={`value ${tone ?? ''}`}>{value}</div>
    </div>
  )
}
