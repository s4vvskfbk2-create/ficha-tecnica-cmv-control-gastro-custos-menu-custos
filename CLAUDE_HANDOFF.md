# Handoff — Claude → Codex

> Resumo curto deixado pelo Architect (Claude) para o Runner (Codex), conforme
> a regra #3 do `AGENTS.md`.

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
