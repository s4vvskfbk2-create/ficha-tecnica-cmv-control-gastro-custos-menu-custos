# Handoff — registro de integração Codex ↔ Claude

Este diretório registra a procedência da integração entre os dois agentes.

## Edge Function `ai-recipe-import` (entrega do Codex)

- **Autor da lógica:** Codex (Runner / backend) — commit `f71ecea`
  *"[Codex] Align AI recipe import edge contract"*.
- **Por que não veio por git push:** o ambiente do Codex não conseguiu acessar o
  GitHub (`CONNECT tunnel failed, response 403`). O Codex então entregou o
  trabalho como **patch em texto** (`git format-patch -1 f71ecea`).
- **Como foi landado:** Claude (Architect/integrador) reconstruiu os arquivos a
  partir do patch e os colocou no repositório acessível, preservando fielmente o
  design do Codex:
  - `supabase/functions/ai-recipe-import/index.ts`
  - `supabase/functions/ai-recipe-import/README.md`
  - `supabase/config.toml` (`verify_jwt = false` no MVP)
  - `src/lib/aiRecipe.ts` (alinhado; já coincidia com o contrato)
  - `docs/AI_RECIPE_IMPORT.md` (lacunas marcadas como confirmadas)

## Contrato (confirmado pelos dois lados)

- Request: `{ texto?, imagemBase64?, mimeType? }`.
- Response: `{ draft: AiRecipeDraft }`.
- Campos do draft: `nome, categoria, rendimento_valor, rendimento_unidade,
  preco_venda, ingredientes[{nome,quantidade,unidade,observacao}], modo_preparo,
  avisos[], confianca`.
- Auth: `verify_jwt = false` no MVP; `true` para produção SaaS.
- Limites: texto 20.000 chars, imagem 4 MB (JPEG/PNG/WEBP), 12 req/min por IP,
  modelo `gpt-4o-mini`.

## Pendência de deploy (precisa do dono — credenciais)

A Edge Function só roda depois de:
1. `supabase secrets set OPENAI_API_KEY=sk-...`
2. `supabase functions deploy ai-recipe-import`
3. App com `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` configurados.

Enquanto isso, o frontend usa o **fallback local sem IA** (rotulado na tela) para
permitir testar o fluxo de revisão.

> Observação: se o Codex conseguir fazer `git push` no futuro, prefira o branch
> oficial dele; este landing é a ponte enquanto o push estava bloqueado.
