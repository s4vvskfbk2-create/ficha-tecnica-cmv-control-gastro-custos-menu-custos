# Entrega — Ficha Técnica & CMV

Resumo do estado do app, como publicar e o que falta para virar SaaS pago.

## ✅ O que já está pronto (funcional e testado)

- **Multi-estabelecimento**: seletor global de unidade, dados isolados por
  estabelecimento, benchmark de CMV por segmento.
- **Mercadorias**: CRUD, custo unitário derivado, **histórico de preços**,
  filtros por categoria/fornecedor.
- **Fichas técnicas** (operacional ⇄ gerencial): composição com seções,
  **subfichas recursivas**, **% de aproveitamento → qtd bruta**, custos extras,
  rendimento pós-cocção, porções reutilizáveis.
- **Cálculos** (cascata, em `src/lib/calc.ts`): custo total, custo por porção,
  **CMV, lucro/margem ($ e %), markup, preço sugerido por meta de CMV** e preço
  psicológico. Validação Margem % + CMV % = 100%.
- **Cardápio & Precificação**: preço editável, CMV/margem/markup, simulador.
- **Dashboard**: KPIs + engenharia de cardápio (CMV por item).
- **Importar receita** (`src/pages/ImportarReceitaPage.tsx`): colar texto ou
  enviar foto → IA (Edge Function) → **revisão editável** → cria ficha. Fallback
  local sem IA para testar. Mobile-friendly.
- **Export Excel** com **fórmulas vivas** (3 abas: Tabela de Preços, Ficha
  Técnica, Receita Operacional) e **PDF** (gerencial + operacional). Carregados
  sob demanda (bundle inicial enxuto).
- **Modo local (localStorage)** para rodar/demonstrar sem backend.
- **Supabase opcional** via `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## ▶️ Como rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + build de produção (dist/)
npm run preview  # pré-visualiza o build
```

## 🚀 Deploy (Vercel ou similar — SPA)

1. `vercel.json` já configura framework Vite, build e **rewrites para SPA**
   (todas as rotas → `index.html`), necessário para rotas como `/fichas/importar`.
2. Configure as variáveis de ambiente (veja `.env.production.example`):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (opcionais — sem elas, modo local).
3. Build command: `npm run build` · Output: `dist`.

Pode ser automatizado por qualquer provedor de SPA (Vercel, Netlify, Cloudflare
Pages). Sem credenciais externas obrigatórias para a versão de demonstração.

## 🔐 Segurança (importante)

- A `OPENAI_API_KEY` **nunca** vai no frontend — é secret do backend (Edge
  Function `ai-recipe-import`). O frontend só chama a Edge Function.
- A `service_role` do Supabase também não vai no frontend (apenas a anon key).
- Em produção real, as policies de RLS não devem ficar abertas (ver abaixo).

## ⏳ O que falta para SaaS vendável (próximas etapas)

Estas etapas dependem do **backend (Codex)** e de credenciais externas; estão
documentadas mas não implementadas neste frontend:

1. **Autenticação** (Supabase Auth: e-mail/senha + magic link).
2. **Organização/empresa** + `org_id` em todas as tabelas (multi-tenant).
3. **RLS segura por empresa/usuário** (substituir qualquer policy aberta de MVP).
4. **Paywall + cobrança** (ex.: Stripe Checkout + webhook) e **bloqueio de
   assinatura vencida**.
5. Painel administrativo, monitoramento de erros, backups.
6. Termos de uso / privacidade / **LGPD**.
7. Testes automatizados mais fortes.

## 🤝 Divisão entre agentes

Ver `AGENTS.md` e `CLAUDE_HANDOFF.md`. Frontend/UX = Claude; backend/Supabase/
RLS/Edge Functions/contratos/segurança = Codex. O contrato da importação por IA
está em `docs/AI_RECIPE_IMPORT.md` (reconciliar com a base do Codex ao mesclar).

## ✔️ Checklist de entrega

- [x] `npm run build` verde (typecheck + build).
- [x] Modo local funciona sem backend.
- [x] Export Excel (fórmulas vivas) e PDF.
- [x] Importar receita (texto/foto → revisão → ficha).
- [x] Responsivo (mobile).
- [x] `vercel.json` + `.env.production.example`.
- [ ] Auth + multi-tenant + RLS segura (backend/Codex).
- [ ] Paywall + cobrança (backend/Codex).
