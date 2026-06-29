# Ficha Técnica & CMV — Controle de Custos para Gastronomia

MVP para controle de custos de restaurantes/bares: cadastro de **Mercadorias**
(insumos), montagem de **Fichas Técnicas** (receitas) com cálculo automático de
**custo, CMV% e margem**, e **exportação em Excel (com fórmulas vivas) e PDF**.

## Stack

- **Vite + React + TypeScript**
- **Supabase** (Postgres) como backend — com *fallback* local (localStorage)
  para rodar e testar sem backend configurado
- **ExcelJS** para export `.xlsx` com fórmulas vivas
- **jsPDF + autotable** para export `.pdf`

## Escopo do MVP

1. **Mercadorias** — nome, categoria, unidade base, embalagem (qtd + preço),
   fornecedor. O custo unitário é derivado automaticamente (preço ÷ quantidade).
2. **Ficha Técnica** — receita com rendimento, preço de venda e itens
   (mercadoria + quantidade). Calcula custo total, custo por porção, CMV% e margem.
3. **Download Excel / PDF** — exporta mercadorias e fichas.

### Fórmulas vivas no Excel

O export `.xlsx` **não** grava valores pré-calculados: as células contêm
fórmulas reais. A aba *Ficha Técnica* referencia o custo unitário de cada
insumo na aba *Mercadorias* (`=Mercadorias!F{linha}`), e custo, CMV% e margem
são fórmulas (`=C*D`, `=SUM(...)`, `=custo/preço`). Assim, ao editar um preço de
embalagem ou uma quantidade no próprio Excel, **tudo recalcula sozinho**.

## Como rodar

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`. Sem variáveis de ambiente, o app inicia em
**modo local** com dados de exemplo (uma pizza Margherita) salvos no navegador.

### Conectando ao Supabase

1. Crie um projeto no Supabase e rode a migração em
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
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

## Estrutura

```
src/
  lib/
    types.ts      # modelos de domínio
    calc.ts       # cálculos de custo / CMV (puros)
    supabase.ts   # client Supabase
    db.ts         # camada de dados (Supabase ↔ localStorage)
    excel.ts      # export .xlsx com fórmulas vivas
    pdf.ts        # export .pdf
    download.ts   # utilitários de download
  pages/
    MercadoriasPage.tsx
    FichasPage.tsx
  App.tsx         # layout + navegação
supabase/
  migrations/0001_init.sql
```

## Próximos passos (pós-MVP)

- Autenticação e multi-tenant (org_id + RLS por organização)
- Fator de correção / rendimento por insumo (perdas de limpeza/cocção)
- Sub-receitas (ficha usada como insumo de outra ficha)
- Histórico de preços e curva de CMV
