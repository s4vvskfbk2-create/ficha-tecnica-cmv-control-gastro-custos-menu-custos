import { useEffect, useMemo, useState } from 'react'
import { repo } from '../lib/db'
import {
  calcularFicha,
  custoItem,
  custoUnitario,
  formatBRL,
  formatNum,
  formatPct,
} from '../lib/calc'
import { exportFichaExcel } from '../lib/excel'
import { exportFichaPDF } from '../lib/pdf'
import type {
  FichaItem,
  FichaTecnica,
  FichaTecnicaInput,
  Mercadoria,
} from '../lib/types'

const novaFicha: FichaTecnicaInput = {
  nome: 'Nova ficha',
  categoria: '',
  rendimento: 1,
  preco_venda: 0,
  modo_preparo: '',
}

export default function FichasPage() {
  const [fichas, setFichas] = useState<FichaTecnica[]>([])
  const [mercadorias, setMercadorias] = useState<Mercadoria[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [itens, setItens] = useState<FichaItem[]>([])
  const [loading, setLoading] = useState(true)

  const mercMap = useMemo(() => new Map(mercadorias.map((m) => [m.id, m])), [mercadorias])
  const selecionada = fichas.find((f) => f.id === selId) ?? null

  async function refreshFichas() {
    const list = await repo.listFichas()
    setFichas(list)
    return list
  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const [, list] = await Promise.all([
        repo.listMercadorias().then(setMercadorias),
        refreshFichas(),
      ])
      if (list.length && !selId) setSelId(list[0].id)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selId) {
      setItens([])
      return
    }
    repo.listItens(selId).then(setItens)
  }, [selId])

  async function criarFicha() {
    const f = await repo.createFicha(novaFicha)
    await refreshFichas()
    setSelId(f.id)
  }

  async function excluirFicha(f: FichaTecnica) {
    if (!confirm(`Excluir a ficha "${f.nome}"?`)) return
    await repo.deleteFicha(f.id)
    const list = await refreshFichas()
    setSelId(list[0]?.id ?? null)
  }

  async function salvarCampos(patch: Partial<FichaTecnicaInput>) {
    if (!selecionada) return
    const updated = { ...selecionada, ...patch }
    setFichas((prev) => prev.map((f) => (f.id === selecionada.id ? updated : f)))
    await repo.updateFicha(selecionada.id, patch)
  }

  async function persistItens(next: FichaItem[]) {
    if (!selId) return
    setItens(next)
    await repo.setItens(
      selId,
      next.map(({ mercadoria_id, quantidade }) => ({ ficha_id: selId, mercadoria_id, quantidade })),
    )
    // Recarrega para obter ids reais gerados pelo repositório.
    setItens(await repo.listItens(selId))
  }

  function addItem(mercadoriaId: string) {
    if (!selId || !mercadoriaId) return
    if (itens.some((i) => i.mercadoria_id === mercadoriaId)) return
    persistItens([
      ...itens,
      { id: `tmp-${mercadoriaId}`, ficha_id: selId, mercadoria_id: mercadoriaId, quantidade: 0 },
    ])
  }

  function updateQtd(itemId: string, quantidade: number) {
    setItens((prev) => prev.map((i) => (i.id === itemId ? { ...i, quantidade } : i)))
  }

  function commitQtd() {
    persistItens(itens)
  }

  function removeItem(itemId: string) {
    persistItens(itens.filter((i) => i.id !== itemId))
  }

  const calc = selecionada
    ? calcularFicha(selecionada, itens, mercMap)
    : { custoTotal: 0, custoPorcao: 0, cmvPct: 0, margem: 0 }

  const cmvClass = calc.cmvPct <= 30 ? 'good' : calc.cmvPct <= 38 ? 'warn' : 'danger'

  if (loading) return <div className="empty">Carregando…</div>

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Fichas Técnicas</h1>
          <div className="sub">Monte receitas, calcule custo, CMV% e margem.</div>
        </div>
        <button className="btn primary" onClick={criarFicha}>
          + Nova ficha
        </button>
      </div>

      {fichas.length === 0 ? (
        <div className="card empty">
          Nenhuma ficha técnica ainda. Clique em <strong>“+ Nova ficha”</strong> para começar.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 18, alignItems: 'start' }}>
          <div className="card" style={{ padding: 8 }}>
            {fichas.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelId(f.id)}
                className="btn"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  marginBottom: 4,
                  border: 'none',
                  background: f.id === selId ? 'var(--accent-soft)' : 'transparent',
                  color: f.id === selId ? 'var(--accent)' : 'inherit',
                }}
              >
                <strong>{f.nome}</strong>
                <div className="sub">{f.categoria || 'Sem categoria'}</div>
              </button>
            ))}
          </div>

          {selecionada && (
            <div>
              <div className="card">
                <div className="form-grid">
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Nome do prato</label>
                    <input
                      value={selecionada.nome}
                      onChange={(e) => salvarCampos({ nome: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Categoria</label>
                    <input
                      value={selecionada.categoria ?? ''}
                      onChange={(e) => salvarCampos({ categoria: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Rendimento (porções)</label>
                    <input
                      type="number"
                      min={1}
                      step="any"
                      value={selecionada.rendimento || ''}
                      onChange={(e) => salvarCampos({ rendimento: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label>Preço de venda / porção (R$)</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={selecionada.preco_venda || ''}
                      onChange={(e) => salvarCampos({ preco_venda: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <label>Modo de preparo</label>
                  <textarea
                    rows={2}
                    value={selecionada.modo_preparo ?? ''}
                    onChange={(e) => salvarCampos({ modo_preparo: e.target.value })}
                  />
                </div>
              </div>

              <div className="card">
                <div className="page-head" style={{ marginBottom: 12 }}>
                  <strong>Itens da receita</strong>
                  <AddItemSelect mercadorias={mercadorias} onAdd={addItem} usados={itens.map((i) => i.mercadoria_id)} />
                </div>

                {itens.length === 0 ? (
                  <div className="empty">Adicione mercadorias para compor a receita.</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Mercadoria</th>
                        <th className="num">Custo unit.</th>
                        <th className="num" style={{ width: 130 }}>
                          Quantidade
                        </th>
                        <th className="num">Custo</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((item) => {
                        const m = mercMap.get(item.mercadoria_id)
                        return (
                          <tr key={item.id}>
                            <td>{m?.nome ?? '(removida)'}</td>
                            <td className="num">{m ? formatBRL(custoUnitario(m)) : '—'}</td>
                            <td className="num">
                              <div className="row" style={{ justifyContent: 'flex-end' }}>
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  style={{ width: 90, textAlign: 'right' }}
                                  value={item.quantidade || ''}
                                  onChange={(e) => updateQtd(item.id, Number(e.target.value))}
                                  onBlur={commitQtd}
                                />
                                <span className="sub">{m?.unidade}</span>
                              </div>
                            </td>
                            <td className="num">{m ? formatBRL(custoItem(item, m)) : '—'}</td>
                            <td className="num">
                              <button className="btn sm ghost" onClick={() => removeItem(item.id)}>
                                ✕
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="card">
                <div className="metrics">
                  <div className="metric">
                    <div className="label">Custo total</div>
                    <div className="value">{formatBRL(calc.custoTotal)}</div>
                  </div>
                  <div className="metric">
                    <div className="label">Custo / porção</div>
                    <div className="value">{formatBRL(calc.custoPorcao)}</div>
                  </div>
                  <div className="metric">
                    <div className="label">CMV %</div>
                    <div className={`value ${cmvClass}`}>{formatPct(calc.cmvPct)}</div>
                  </div>
                  <div className="metric">
                    <div className="label">Margem / porção</div>
                    <div className={`value ${calc.margem >= 0 ? 'good' : 'danger'}`}>
                      {formatBRL(calc.margem)}
                    </div>
                  </div>
                </div>
                <div className="toolbar" style={{ marginTop: 16 }}>
                  <button
                    className="btn primary"
                    onClick={() => exportFichaExcel(selecionada, itens, mercMap)}
                  >
                    ⬇ Excel (fórmulas vivas)
                  </button>
                  <button className="btn" onClick={() => exportFichaPDF(selecionada, itens, mercMap)}>
                    ⬇ PDF
                  </button>
                  <span className="grow" />
                  <button className="btn ghost" onClick={() => excluirFicha(selecionada)}>
                    Excluir ficha
                  </button>
                </div>
                <div className="sub" style={{ marginTop: 8 }}>
                  Rendimento: {formatNum(selecionada.rendimento)} porção(ões) · {itens.length} item(ns)
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function AddItemSelect({
  mercadorias,
  usados,
  onAdd,
}: {
  mercadorias: Mercadoria[]
  usados: string[]
  onAdd: (id: string) => void
}) {
  const [value, setValue] = useState('')
  const disponiveis = mercadorias.filter((m) => !usados.includes(m.id))

  if (mercadorias.length === 0) {
    return <span className="sub">Cadastre mercadorias primeiro.</span>
  }

  return (
    <div className="row" style={{ width: 320 }}>
      <select value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">Adicionar mercadoria…</option>
        {disponiveis.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
      </select>
      <button
        className="btn sm primary"
        disabled={!value}
        onClick={() => {
          onAdd(value)
          setValue('')
        }}
      >
        +
      </button>
    </div>
  )
}
