# Ficha Técnica & CMV — Controle de Custos para Gastronomia

Sistema de gestão de custos para restaurantes/bares **multi-estabelecimento**:
cadastro de **Mercadorias** (insumos com histórico de preço), montagem de
**Fichas Técnicas** (receitas operacionais + gerenciais, com composição
recursiva e % de aproveitamento), **precificação** com CMV/margem/markup e
simulador por meta de CMV, e **exportação Excel (fórmulas vivas) e PDF**.

Consolida o material de estudo (notas 01–05: CMV/ficha técnica, sistema de
3 abas, Prime Cost/TRA, benchmark MenuControl) em um produto concreto.

## Stack

- **Vite + React + TypeScript**
- **Supabase** (Postgres/Auth/RLS) como backend — com *fallback* local
  (localStorage) para rodar e testar sem backend configurado
- **ExcelJS** para export `.xlsx` com fórmulas vivas
- **jsPDF + autotable** para export `.pdf`

## Funcionalidades

### Multi-estabelecimento
Seletor global de unidade (seed: **Nobre Bistrô**, **Úrica Maison**,
**Sushi Boys**). Todo dado é escopado por estabelecimento. Cada segmento tem
**benchmark de CMV** próprio para os alertas (notas 02/03 — Abrasel/TRA).

### Mercadorias
- CRUD com categoria, unidade base (g, kg, ml, L, un, cx, pct), embalagem
  (qtd + preço) e fornecedor.
- **Custo unitário derivado** (preço ÷ quantidade).
- **Histórico de preços** por insumo (rastreabilidade de compras).
- Busca e filtros por categoria/fornecedor.

### Fichas Técnicas (operacional ⇄ gerencial)
- Receitas de **cardápio** (venda) e de **produção** (subfichas/processados).
- **Composição recursiva:** uma ficha pode usar outra ficha como ingrediente
  (com proteção contra ciclos).
- **% de aproveitamento** por item → `qtd bruta = qtd líquida / aproveitamento`.
- **Custos extras** (embalagem, gás…), **rendimento** + rendimento final
  pós-cocção, **porções reutilizáveis** (com custo por porção).
- Vista **operacional** (medida caseira + modo de preparo, validades) e
  **gerencial** (custos, custo %, indicadores).
- Cálculo em **cascata em tempo real**: preço da mercadoria → custo do
  ingrediente → custo da receita → custo da porção → CMV/margem/markup.

### Cardápio & Precificação
- Tabela com custo/porção, preço (editável), **CMV %, margem, markup** e status.
- **Simulador por meta de CMV**: preço sugerido = custo ÷ meta.
- Regra de ouro validada: **Margem % + CMV % = 100%**.

### Dashboard
- Indicadores do estabelecimento (nº de insumos/fichas, CMV médio, alertas de
  CMV alto) e **engenharia de cardápio** (CMV por item, ordenado).

### Export Excel com fórmulas vivas (diferencial)
O `.xlsx` **não** grava valores congelados — as células contêm fórmulas reais,
em **3 abas** (espelha a nota 02):

1. **Tabela de Preços** — `Custo Unitário = Preço Pago / Qtd`.
2. **Ficha Técnica** — `Qtd Bruta = Líquida / Aprov.`, `Custo Unit.` referencia
   a aba de preços (`='Tabela de Preços'!F5`), `Custo = Bruta × Unit`,
   `Custo % `, `Custo Total`, `Custo/Porção`, `CMV%`, `Margem`, `Markup`,
   `Preço p/ meta`.
3. **Receita Operacional** — ingredientes em medida caseira + modo de preparo
   (sem custos).

Ao editar um preço na aba de preços, **todo o Excel recalcula sozinho**.
O **PDF** sai no layout padronizado (gerencial + operacional, com espaço para
responsável/assinatura).

## Como rodar

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`. Sem variáveis de ambiente, o app inicia em
**modo local** com 3 estabelecimentos e dados de exemplo (Pizza Margherita +
subficha Molho de tomate) salvos no navegador.

### Conectando ao Supabase

1. Crie um projeto no Supabase e rode as migrações em ordem:
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) e
   [`supabase/migrations/0002_backend_production_hardening.sql`](supabase/migrations/0002_backend_production_hardening.sql)
   (tabelas + RLS por estabelecimento, RPC de bootstrap e validações de integridade).
2. Copie `.env.example` para `.env.local` e preencha:

   ```
   VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
   VITE_SUPABASE_ANON_KEY=<sua-anon-key>
   ```

3. Reinicie o `npm run dev`. O cabeçalho passa a indicar **“Supabase”**.

## Scripts

| Script              | Descrição                          |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Servidor de desenvolvimento (Vite) |
| `npm run build`     | Type-check + build de produção     |
| `npm run preview`   | Pré-visualiza o build              |
| `npm run typecheck` | Apenas checagem de tipos           |
| `npm run audit:backend` | Auditoria estática do backend Supabase/IA |

## Estrutura

```
src/
  lib/
    types.ts       # modelos de domínio
    units.ts       # conversão de unidades (massa/volume/contagem)
    benchmark.ts   # faixas de CMV por segmento + status
    calc.ts        # motor de cálculo (cascata + composição recursiva)
    supabase.ts    # client Supabase
    db.ts          # camada de dados (Supabase ↔ localStorage) + seed
    store.tsx      # store global (estabelecimento + snapshot + CRUD)
    excel.ts       # export .xlsx com fórmulas vivas (3 abas)
    pdf.ts         # export .pdf (gerencial + operacional)
    download.ts    # utilitários de download
  pages/
    DashboardPage.tsx
    MercadoriasPage.tsx
    FichasPage.tsx
    FichaEditorPage.tsx
    CardapioPage.tsx
  App.tsx          # layout + seletor de estabelecimento + navegação
supabase/
  migrations/0001_init.sql
```

## Fórmulas (fonte da verdade — `calc.ts`)

```
custo_unitario       = preço_embalagem / qtd_embalagem
qtd_bruta            = qtd_liquida / perc_aproveitamento
custo_item           = custo_unitario(convertido p/ unidade) * qtd_bruta
custo_mercadoria     = Σ custo_item
custo_total          = custo_mercadoria + Σ custos_extras
custo_por_porcao     = custo_total / rendimento
CMV %                = custo_por_porcao / preco_venda * 100
margem $             = preco_venda - custo_por_porcao
margem %             = margem$ / preco_venda * 100        (margem% + CMV% = 100)
markup               = preco_venda / custo_por_porcao
preco_por_meta_CMV   = custo_por_porcao / CMV_alvo
```

## Próximos passos (fase 2)

- Precificação por canal de venda + embalagens.
- DRE / Prime Cost / CMO / custos operacionais (nota 03), por unidade e
  consolidado.
- CMV teórico × real (estoque + compras) e lista de compras.
- Rótulo nutricional (100g/porção).
