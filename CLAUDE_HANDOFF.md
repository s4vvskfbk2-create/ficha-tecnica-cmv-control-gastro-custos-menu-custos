# Handoff — Claude → Codex

> Resumo curto deixado pelo Architect (Claude) para o Runner (Codex), conforme
> a regra #3 do `AGENTS.md`.

## 🔐 NOVO — camada de autenticação (frontend, Claude) — precisa de backend (Codex)

Claude adicionou login/sessão (Supabase Auth): `src/lib/auth.tsx`,
`src/pages/LoginPage.tsx`, gate no `main.tsx`, e-mail + "Sair" na topbar.
- Quando **Supabase configurado** → exige login (e-mail/senha, cadastro, magic link).
- Quando **não configurado** → modo local/demo sem login (sem regressão, validado).

**Dependência para o Codex (backend/RLS — seu domínio):** para o onboarding
funcionar sob RLS, ao criar um `estabelecimento` o usuário criador precisa ser
vinculado automaticamente como `owner` em `usuario_estabelecimento` (senão a RLS
bloqueia o próprio usuário de ver o que acabou de criar). Você descreveu isso na
migração `0003_saas_backend_foundation.sql` (trigger owner + assinatura trial) —
ela **ainda não está neste repo**. Por favor traga a `0003` (push no branch ou
patch, como fizemos com a Edge Function) para fechar o multi-tenant.

Resumo do contrato que o frontend espera do backend de auth/tenant:
1. `usuario_estabelecimento(user_id, estabelecimento_id, papel)` com RLS.
2. Trigger: ao inserir `estabelecimento`, inserir vínculo `owner` para `auth.uid()`.
3. RLS de `mercadorias`/`receitas`/itens por vínculo do usuário (já em 0001).

---

## ✅ ATUALIZAÇÃO — backend do Codex integrado (commit f71ecea via patch)

O Codex não conseguiu `git push` (proxy 403) e entregou o trabalho como patch.
Claude landou a Edge Function `ai-recipe-import` neste repo a partir do patch
(ver `handoff/README.md`): `supabase/functions/ai-recipe-import/{index.ts,README.md}`,
`supabase/config.toml`, `src/lib/aiRecipe.ts` alinhado e docs confirmados.
O contrato bate 100% com o frontend. **Falta só o deploy** (segredo
`OPENAI_API_KEY` + `supabase functions deploy`), que depende do dono.
Codex: se conseguir push depois, mande no branch oficial; este landing é a ponte.

---

## Estado deste branch
- Repo: `ficha-tecnica-cmv-control-gastro-custos-menu-custos`
- Branch: `claude/mvp-app-scaffold-vite-muzhyx`
- Último commit relevante: tela "Importar receita" (frontend).
- `npm run build` (tsc + vite): **verde**. Fluxo validado no navegador (mobile).

## ⚠️ Divergência de base a resolver
A base do Codex (branch `work`, commit `234c8f5`) **não está presente neste
branch/ambiente**. Ausentes aqui: `AGENT_OWNERSHIP.md`, `docs/BACKEND_CONTRACT.md`,
`supabase/functions/ai-recipe-import/index.ts`, migrações `0002/0003`,
`src/lib/number.ts`, `handoff/codex-4848ffe.patch`.

Para reconciliar: dar `push` do branch `work` para este repo no GitHub, ou
aplicar o patch `codex-4848ffe.patch` sobre este branch.

## O que Claude (frontend) já construiu
- `src/pages/ImportarReceitaPage.tsx` — colar texto, upload de foto, revisão
  editável, avisos da IA, confirmação antes de salvar.
- `src/lib/aiRecipeClient.ts` — chama **somente** a Edge Function
  `ai-recipe-import` (nunca OpenAI no browser; sem `OPENAI_API_KEY`). Fallback
  local sem IA apenas para testes.
- `src/lib/aiRecipe.ts` — **espelho** do contrato `AiRecipeDraft`. Reconcilie
  com o teu `src/lib/aiRecipe.ts` oficial (mantém os nomes).
- `docs/AI_RECIPE_IMPORT.md` — contrato esperado + lacunas a confirmar.

## O que preciso de você (Codex / backend)
1. Confirmar o shape final de `AiRecipeDraft` e o nome/assinatura da Edge Function.
2. Auth: a função exige JWT de usuário logado? (hoje chamo com a sessão atual.)
3. Se o modelo final usa `org_id`/multi-tenant, avise para o frontend incluir o
   tenant ao criar ficha/mercadoria.
4. Limites de imagem / rate limit / custo por chamada.

Só `src/lib/aiRecipe.ts` e `docs/AI_RECIPE_IMPORT.md` se sobrepõem ao teu
trabalho; o restante do frontend encaixa direto no contrato.

---

## Codex → Claude — continuidade em 2026-06-30

Codex analisou o handoff e manteve o contrato de importação por IA já reconciliado. Pequena melhoria aplicada no fluxo pós-importação: ao criar uma ficha importada, a tela da ficha agora recebe um aviso persistente via estado de navegação informando se foram criados insumos novos com preço R$ 0,00 e oferecendo atalho para Mercadorias. Isso evita que o aviso seja perdido pela navegação imediata após salvar.
