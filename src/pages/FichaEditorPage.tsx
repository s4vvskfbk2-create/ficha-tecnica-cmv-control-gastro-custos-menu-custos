import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { uid } from '../lib/db'
import {
  buildContext,
  calcularFicha,
  custoDaPorcao,
  formatBRL,
  formatBRL4,
  formatNum,
  formatPct,
  formatX,
} from '../lib/calc'
import { avaliarCMV } from '../lib/benchmark'
import { UNIDADES, type CustoExtra, type Porcao, type Receita, type ReceitaItem, type Unidade } from '../lib/types'

type Vista = 'gerencial' | 'operacional'

export default function FichaEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const importNotice = (location.state as { importNotice?: string } | null)?.importNotice
  const store = useStore()
  const { snapshot, estabelecimento } = store
  const receita = snapshot.receitas.find((r) => r.id === id)

  // Estado editável local (sincronizado a partir do snapshot).
  const [header, setHeader] = useState<Receita | null>(null)
  const [itens, setItens] = useState<ReceitaItem[]>([])
  const [extras, setExtras] = useState<CustoExtra[]>([])
  const [porcoes, setPorcoes] = useState<Porcao[]>([])
  const [vista, setVista] = useState<Vista>('gerencial')
  const [salvando, setSalvando] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!receita) return
    setHeader({ ...receita })
    setItens(snapshot.itens.filter((i) => i.receita_id === receita.id).sort((a, b) => a.ordem - b.ordem))
    setExtras(snapshot.custosExtras.filter((c) => c.receita_id === receita.id))
    setPorcoes(snapshot.porcoes.filter((p) => p.receita_id === receita.id))
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receita?.id, snapshot])

  // Contexto de cálculo com os dados EDITADOS desta ficha (preview ao vivo).
  const calc = useMemo(() => {
    if (!header) return null
    const outrasReceitas = snapshot.receitas.filter((r) => r.id !== header.id)
    const outrosItens = snapshot.itens.filter((i) => i.receita_id !== header.id)
    const outrosExtras = snapshot.custosExtras.filter((c) => c.receita_id !== header.id)
    const ctx = buildContext(
      snapshot.mercadorias,
      [...outrasReceitas, header],
      [...outrosItens, ...itens],
      [...outrosExtras, ...extras],
    )
    return { ctx, ficha: calcularFicha(header, ctx) }
  }, [header, itens, extras, snapshot])

  if (!receita || !header) {
    return (
      <div className="empty">
        Ficha não encontrada. <button className="link" onClick={() => navigate('/fichas')}>Voltar</button>
      </div>
    )
  }

  const segmento = estabelecimento?.segmento ?? 'outro'
  const status = avaliarCMV(calc!.ficha.cmvPct, segmento)
  const subfichas = snapshot.receitas.filter((r) => r.id !== header.id)

  function patch(p: Partial<Receita>) {
    setHeader((h) => (h ? { ...h, ...p } : h))
    setDirty(true)
  }

  function addItem(tipo: 'mercadoria' | 'receita') {
    const refId = tipo === 'mercadoria' ? snapshot.mercadorias[0]?.id : subfichas[0]?.id
    if (!refId) {
      alert(tipo === 'mercadoria' ? 'Cadastre uma mercadoria primeiro.' : 'Crie uma ficha de produção primeiro.')
      return
    }
    const ref = tipo === 'mercadoria'
      ? snapshot.mercadorias.find((m) => m.id === refId)
      : subfichas.find((s) => s.id === refId)
    const unidade: Unidade = tipo === 'mercadoria'
      ? (ref as { unidade: Unidade }).unidade
      : (ref as Receita).rendimento_unidade
    setItens((arr) => [
      ...arr,
      {
        id: uid(),
        receita_id: header!.id,
        ordem: arr.length,
        titulo_secao: null,
        tipo,
        ref_id: refId,
        qtd_liquida: 0,
        unidade,
        perc_aproveitamento: 1,
        medida_caseira: '',
      },
    ])
    setDirty(true)
  }

  function patchItem(itemId: string, p: Partial<ReceitaItem>) {
    setItens((arr) => arr.map((it) => (it.id === itemId ? { ...it, ...p } : it)))
    setDirty(true)
  }
  function removeItem(itemId: string) {
    setItens((arr) => arr.filter((it) => it.id !== itemId))
    setDirty(true)
  }

  async function salvar() {
    if (!header) return
    setSalvando(true)
    try {
      await store.atualizarReceita(header.id, {
        nome: header.nome,
        categoria: header.categoria,
        tipo: header.tipo,
        rendimento_valor: header.rendimento_valor,
        rendimento_unidade: header.rendimento_unidade,
        rendimento_final_peso: header.rendimento_final_peso,
        tempo_preparo_min: header.tempo_preparo_min,
        validade_congelado_dias: header.validade_congelado_dias,
        validade_refrigerado_dias: header.validade_refrigerado_dias,
        validade_ambiente_dias: header.validade_ambiente_dias,
        preco_venda: header.preco_venda,
        cmv_meta: header.cmv_meta,
        modo_preparo: header.modo_preparo,
        observacoes: header.observacoes,
      })
      await store.salvarItens(
        header.id,
        itens.map((it, i) => ({
          receita_id: header.id,
          ordem: i,
          titulo_secao: it.titulo_secao,
          tipo: it.tipo,
          ref_id: it.ref_id,
          qtd_liquida: it.qtd_liquida,
          unidade: it.unidade,
          perc_aproveitamento: it.perc_aproveitamento,
          medida_caseira: it.medida_caseira,
        })),
      )
      await store.salvarCustosExtras(
        header.id,
        extras.map((e) => ({ receita_id: header.id, descricao: e.descricao, valor: e.valor })),
      )
      await store.salvarPorcoes(
        header.id,
        porcoes.map((p) => ({ receita_id: header.id, nome: p.nome, unidade: p.unidade, quantidade_que_faz: p.quantidade_que_faz })),
      )
      setDirty(false)
    } finally {
      setSalvando(false)
    }
  }

  async function exportarExcel() {
    const { exportFichaExcel } = await import('../lib/excel')
    await exportFichaExcel(header!, calc!.ctx, extras, porcoes)
  }
  async function exportarPDF() {
    const { exportFichaPDF } = await import('../lib/pdf')
    exportFichaPDF(header!, calc!.ctx, porcoes, segmento)
  }

  const f = calc!.ficha

  return (
    <>
      <div className="page-head">
        <div>
          <button className="link" onClick={() => navigate('/fichas')}>← Fichas</button>
          <h1 style={{ marginTop: 4 }}>{header.nome || 'Nova ficha'}</h1>
          <div className="sub">
            <span className={`badge ${header.tipo === 'cardapio' ? 'tipo' : 'prod'}`}>
              {header.tipo === 'cardapio' ? 'Cardápio' : 'Produção'}
            </span>{' '}
            {header.categoria}
          </div>
        </div>
        <div className="toolbar">
          <div className="tabs">
            <button className={vista === 'gerencial' ? 'active' : ''} onClick={() => setVista('gerencial')}>Gerencial</button>
            <button className={vista === 'operacional' ? 'active' : ''} onClick={() => setVista('operacional')}>Operacional</button>
          </div>
          <button className="btn" onClick={exportarPDF}>⬇ PDF</button>
          <button className="btn" onClick={exportarExcel}>⬇ Excel</button>
          <button className="btn primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : dirty ? 'Salvar alterações' : 'Salvo ✓'}
          </button>
        </div>
      </div>

      {importNotice && (
        <div className="notice" role="status">
          {importNotice}{' '}
          <button className="link" onClick={() => navigate('/mercadorias')}>Atualizar preços em Mercadorias</button>
        </div>
      )}

      <div className="editor-grid">
        <div>
          {/* Cabeçalho da ficha */}
          <div className="card">
            <div className="form-grid">
              <div>
                <label>Nome</label>
                <input value={header.nome} onChange={(e) => patch({ nome: e.target.value })} />
              </div>
              <div>
                <label>Categoria</label>
                <input value={header.categoria ?? ''} onChange={(e) => patch({ categoria: e.target.value })} />
              </div>
              <div>
                <label>Tipo</label>
                <select value={header.tipo} onChange={(e) => patch({ tipo: e.target.value as Receita['tipo'] })}>
                  <option value="cardapio">Cardápio (venda)</option>
                  <option value="producao">Produção (subficha)</option>
                </select>
              </div>
              <div>
                <label>Rendimento</label>
                <input type="number" min={0} step="any" value={header.rendimento_valor || ''} onChange={(e) => patch({ rendimento_valor: Number(e.target.value) })} />
              </div>
              <div>
                <label>Unidade rend.</label>
                <select value={header.rendimento_unidade} onChange={(e) => patch({ rendimento_unidade: e.target.value as Unidade })}>
                  {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label>Rend. final pós-cocção ({header.rendimento_unidade}) </label>
                <input type="number" min={0} step="any" value={header.rendimento_final_peso || ''} onChange={(e) => patch({ rendimento_final_peso: Number(e.target.value) })} placeholder="opcional" />
              </div>
              <div>
                <label>Tempo de preparo (min)</label>
                <input type="number" min={0} value={header.tempo_preparo_min || ''} onChange={(e) => patch({ tempo_preparo_min: Number(e.target.value) })} />
              </div>
            </div>
            <div className="form-grid mt">
              <div>
                <label>Validade congelado (dias)</label>
                <input type="number" min={0} value={header.validade_congelado_dias || ''} onChange={(e) => patch({ validade_congelado_dias: Number(e.target.value) })} />
              </div>
              <div>
                <label>Validade refrigerado (dias)</label>
                <input type="number" min={0} value={header.validade_refrigerado_dias || ''} onChange={(e) => patch({ validade_refrigerado_dias: Number(e.target.value) })} />
              </div>
              <div>
                <label>Validade ambiente (dias)</label>
                <input type="number" min={0} value={header.validade_ambiente_dias || ''} onChange={(e) => patch({ validade_ambiente_dias: Number(e.target.value) })} />
              </div>
            </div>
          </div>

          {vista === 'gerencial' ? (
            <GerencialView
              itens={itens}
              calc={f}
              mercadorias={snapshot.mercadorias}
              subfichas={subfichas}
              extras={extras}
              addItem={addItem}
              patchItem={patchItem}
              removeItem={removeItem}
              setExtras={(x) => { setExtras(x); setDirty(true) }}
            />
          ) : (
            <OperacionalView
              header={header}
              itens={itens}
              patchItem={patchItem}
              patch={patch}
            />
          )}

          {/* Porções */}
          <div className="card">
            <div className="row">
              <h3 className="grow" style={{ margin: 0 }}>Porções</h3>
              <button className="btn sm" onClick={() => { setPorcoes((p) => [...p, { id: uid(), receita_id: header.id, nome: 'Nova porção', unidade: header.rendimento_unidade, quantidade_que_faz: 1 }]); setDirty(true) }}>+ Porção</button>
            </div>
            <div className="muted-sm mb">Transforme o rendimento em unidades práticas (fatia, unidade, concha…).</div>
            {porcoes.length === 0 ? (
              <div className="muted-sm">Nenhuma porção definida — usa o rendimento ({formatNum(header.rendimento_valor)} {header.rendimento_unidade}).</div>
            ) : (
              <table>
                <thead><tr><th>Nome</th><th className="num">Faz (qtd)</th><th className="num">Custo/porção</th><th /></tr></thead>
                <tbody>
                  {porcoes.map((p) => (
                    <tr key={p.id}>
                      <td><input value={p.nome} onChange={(e) => { setPorcoes((arr) => arr.map((x) => x.id === p.id ? { ...x, nome: e.target.value } : x)); setDirty(true) }} /></td>
                      <td className="num"><input className="inline-input" type="number" min={0} step="any" value={p.quantidade_que_faz || ''} onChange={(e) => { setPorcoes((arr) => arr.map((x) => x.id === p.id ? { ...x, quantidade_que_faz: Number(e.target.value) } : x)); setDirty(true) }} /></td>
                      <td className="num">{formatBRL(custoDaPorcao(f, p))}</td>
                      <td className="num"><button className="btn sm ghost" onClick={() => { setPorcoes((arr) => arr.filter((x) => x.id !== p.id)); setDirty(true) }}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Painel de indicadores */}
        <div className="sticky">
          <div className="card">
            <div className="section-title">Indicadores</div>
            <Indicador label="Custo de mercadoria" valor={formatBRL(f.custoMercadoria)} />
            <Indicador label="Custos extras" valor={formatBRL(f.custoExtras)} />
            <Indicador label="Custo total" valor={formatBRL(f.custoTotal)} forte />
            <Indicador label={`Custo / ${header.rendimento_unidade} (rend.)`} valor={formatBRL4(f.custoPorUnidRend)} />
            <Indicador label="Custo por porção" valor={formatBRL(f.custoPorcao)} forte />

            {header.tipo === 'cardapio' && (
              <>
                <div className="section-title mt">Precificação</div>
                <div className="mb">
                  <label>Preço de venda (R$)</label>
                  <input type="number" min={0} step="any" value={header.preco_venda || ''} onChange={(e) => patch({ preco_venda: Number(e.target.value) })} />
                </div>
                <Indicador label="CMV %" valor={formatPct(f.cmvPct)} badge={<span className={`badge ${status.nivel}`}>{status.texto}</span>} />
                <Indicador label="Margem de contribuição" valor={`${formatBRL(f.margemRs)} · ${formatPct(f.margemPct)}`} />
                <Indicador label="Markup" valor={formatX(f.markup)} />
                <Indicador label="Preço psicológico" valor={formatBRL(f.precoPsicologico)} />

                <div className="section-title mt">Simulador por meta de CMV</div>
                <div className="row">
                  <div className="grow">
                    <label>Meta de CMV</label>
                    <input type="number" min={0} max={100} step="any" value={header.cmv_meta ? Math.round(header.cmv_meta * 1000) / 10 : ''} onChange={(e) => patch({ cmv_meta: Number(e.target.value) / 100 })} />
                  </div>
                  <div className="grow right">
                    <label>Preço sugerido</label>
                    <div className="metric" style={{ padding: '8px 10px' }}>
                      <div className="value" style={{ fontSize: 18 }}>{formatBRL(f.precoPorMeta)}</div>
                    </div>
                  </div>
                </div>
                <button className="btn mt" style={{ width: '100%' }} disabled={f.precoPorMeta <= 0} onClick={() => patch({ preco_venda: Math.round(f.precoPorMeta * 100) / 100 })}>
                  Aplicar preço da meta
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function Indicador({ label, valor, forte, badge }: { label: string; valor: string; forte?: boolean; badge?: React.ReactNode }) {
  return (
    <div className="rule-line">
      <span className="text-muted">{label}</span>
      <span className="v">
        {badge} {forte ? <strong>{valor}</strong> : valor}
      </span>
    </div>
  )
}

// --------------------------------------------------------------------------
// Vista Gerencial — composição com custos
// --------------------------------------------------------------------------
function GerencialView({
  itens, calc, mercadorias, subfichas, extras, addItem, patchItem, removeItem, setExtras,
}: {
  itens: ReceitaItem[]
  calc: ReturnType<typeof calcularFicha>
  mercadorias: { id: string; nome: string; unidade: Unidade }[]
  subfichas: Receita[]
  extras: CustoExtra[]
  addItem: (t: 'mercadoria' | 'receita') => void
  patchItem: (id: string, p: Partial<ReceitaItem>) => void
  removeItem: (id: string) => void
  setExtras: (x: CustoExtra[]) => void
}) {
  const calcById = new Map(calc.itens.map((l) => [l.item.id, l]))
  return (
    <>
      <div className="card">
        <div className="row mb">
          <h3 className="grow" style={{ margin: 0 }}>Composição</h3>
          <button className="btn sm" onClick={() => addItem('mercadoria')}>+ Mercadoria</button>
          <button className="btn sm" onClick={() => addItem('receita')}>+ Subficha</button>
        </div>
        {itens.length === 0 ? (
          <div className="empty">Nenhum ingrediente. Adicione mercadorias ou subfichas.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ingrediente</th>
                <th className="num">Qtd líq.</th>
                <th>Un</th>
                <th className="num">Aprov.</th>
                <th className="num">Qtd bruta</th>
                <th className="num">Custo un.</th>
                <th className="num">Custo</th>
                <th className="num">%</th>
                <th>Seção</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {itens.map((it) => {
                const l = calcById.get(it.id)
                return (
                  <tr key={it.id} className={l?.invalido ? 'text-danger' : ''}>
                    <td>
                      <select value={it.ref_id} onChange={(e) => {
                        const novo = e.target.value
                        if (it.tipo === 'mercadoria') {
                          const m = mercadorias.find((x) => x.id === novo)
                          patchItem(it.id, { ref_id: novo, unidade: m?.unidade ?? it.unidade })
                        } else {
                          const s = subfichas.find((x) => x.id === novo)
                          patchItem(it.id, { ref_id: novo, unidade: s?.rendimento_unidade ?? it.unidade })
                        }
                      }}>
                        {it.tipo === 'mercadoria'
                          ? mercadorias.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)
                          : subfichas.map((s) => <option key={s.id} value={s.id}>↳ {s.nome}</option>)}
                      </select>
                    </td>
                    <td className="num"><input className="inline-input" type="number" min={0} step="any" value={it.qtd_liquida || ''} onChange={(e) => patchItem(it.id, { qtd_liquida: Number(e.target.value) })} /></td>
                    <td>
                      <select value={it.unidade} onChange={(e) => patchItem(it.id, { unidade: e.target.value as Unidade })} style={{ width: 70 }}>
                        {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="num"><input className="inline-input" type="number" min={0} max={100} step="any" value={Math.round((it.perc_aproveitamento || 1) * 1000) / 10} onChange={(e) => patchItem(it.id, { perc_aproveitamento: Number(e.target.value) / 100 })} />%</td>
                    <td className="num">{formatNum(l?.qtdBruta ?? 0)}</td>
                    <td className="num">{formatBRL4(l?.custoUnit ?? 0)}</td>
                    <td className="num">{formatBRL(l?.custoTotal ?? 0)}</td>
                    <td className="num">{formatPct((l?.custoPct ?? 0) * 100)}</td>
                    <td><input style={{ width: 90 }} value={it.titulo_secao ?? ''} onChange={(e) => patchItem(it.id, { titulo_secao: e.target.value || null })} placeholder="—" /></td>
                    <td className="num"><button className="btn sm ghost" onClick={() => removeItem(it.id)}>×</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="row mb">
          <h3 className="grow" style={{ margin: 0 }}>Custos extras</h3>
          <button className="btn sm" onClick={() => setExtras([...extras, { id: uid(), receita_id: '', descricao: '', valor: 0 }])}>+ Custo extra</button>
        </div>
        {extras.length === 0 ? (
          <div className="muted-sm">Embalagem, gás, etc. (opcional).</div>
        ) : (
          <table>
            <thead><tr><th>Descrição</th><th className="num">Valor</th><th /></tr></thead>
            <tbody>
              {extras.map((ex) => (
                <tr key={ex.id}>
                  <td><input value={ex.descricao} onChange={(e) => setExtras(extras.map((x) => x.id === ex.id ? { ...x, descricao: e.target.value } : x))} placeholder="Embalagem" /></td>
                  <td className="num"><input className="inline-input" type="number" min={0} step="any" value={ex.valor || ''} onChange={(e) => setExtras(extras.map((x) => x.id === ex.id ? { ...x, valor: Number(e.target.value) } : x))} /></td>
                  <td className="num"><button className="btn sm ghost" onClick={() => setExtras(extras.filter((x) => x.id !== ex.id))}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

// --------------------------------------------------------------------------
// Vista Operacional — medida caseira + modo de preparo
// --------------------------------------------------------------------------
function OperacionalView({
  header, itens, patchItem, patch,
}: {
  header: Receita
  itens: ReceitaItem[]
  patchItem: (id: string, p: Partial<ReceitaItem>) => void
  patch: (p: Partial<Receita>) => void
}) {
  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ingredientes (medida caseira)</h3>
        {itens.length === 0 ? (
          <div className="muted-sm">Adicione ingredientes na vista gerencial.</div>
        ) : (
          <table>
            <thead><tr><th>Ingrediente</th><th className="num">Qtd</th><th>Medida caseira</th></tr></thead>
            <tbody>
              {itens.map((it) => (
                <tr key={it.id}>
                  <td>{it.titulo_secao ? <span className="muted-sm">[{it.titulo_secao}] </span> : null}<RefNome it={it} /></td>
                  <td className="num">{formatNum(it.qtd_liquida)} {it.unidade}</td>
                  <td><input value={it.medida_caseira ?? ''} onChange={(e) => patchItem(it.id, { medida_caseira: e.target.value })} placeholder="2 xícaras" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Modo de preparo</h3>
        <textarea rows={8} value={header.modo_preparo ?? ''} onChange={(e) => patch({ modo_preparo: e.target.value })} placeholder="1) ...&#10;2) ..." />
        <div className="section-title mt">Observações</div>
        <textarea rows={3} value={header.observacoes ?? ''} onChange={(e) => patch({ observacoes: e.target.value })} />
      </div>
    </>
  )
}

function RefNome({ it }: { it: ReceitaItem }) {
  const { snapshot } = useStore()
  const nome = it.tipo === 'mercadoria'
    ? snapshot.mercadorias.find((m) => m.id === it.ref_id)?.nome
    : snapshot.receitas.find((r) => r.id === it.ref_id)?.nome
  return <>{nome ?? '(removido)'}</>
}
