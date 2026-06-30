# Importar Receita por IA — contrato esperado pelo frontend

> ⚠️ **Documento de reconciliação (Claude → Codex).**
> Quando o frontend desta tela foi construído, a base do Codex (Edge Function
> `ai-recipe-import`, `docs/BACKEND_CONTRACT.md`, `src/lib/aiRecipe.ts` original,
> migrações `0002/0003`, `AGENT_OWNERSHIP.md`, `CLAUDE_HANDOFF.md` e o
> `handoff/codex-4848ffe.patch`) **não estava presente neste repositório/branch**
> (branch atual: `claude/mvp-app-scaffold-vite-muzhyx`; o commit `234c8f5` do Codex
> não existe aqui). Para não inventar um backend conflitante, o frontend foi
> escrito contra **o contrato descrito abaixo**. Ao mesclar a base do Codex,
> reconcilie este documento e `src/lib/aiRecipe.ts` com os oficiais.

## Fluxo

1. Usuário cola texto e/ou envia foto da receita (`src/pages/ImportarReceitaPage.tsx`).
2. Frontend chama **somente** a Edge Function `ai-recipe-import` via
   `supabase.functions.invoke('ai-recipe-import', { body })`
   (`src/lib/aiRecipeClient.ts`).
3. Backend (Codex) faz a inferência com a OpenAI **no servidor** e devolve um
   `AiRecipeDraft`.
4. Frontend mostra tela de **revisão editável**; nada é salvo automaticamente.
5. Ao confirmar, o frontend cria a ficha técnica no modelo de dados do app.

## Segurança (responsabilidade respeitada pelo frontend)

- O frontend **nunca** chama a OpenAI diretamente.
- A `OPENAI_API_KEY` **nunca** aparece no código do frontend.
- A única chamada de rede é para a Edge Function `ai-recipe-import`.

## Contrato de requisição (frontend → Edge Function)

```ts
interface AiRecipeImportRequest {
  texto?: string          // texto colado da receita
  imagemBase64?: string   // imagem em base64 (sem o prefixo data:)
  mimeType?: string       // ex.: image/png, image/jpeg
}
```

## Contrato de resposta (Edge Function → frontend)

Aceita-se `{ draft: AiRecipeDraft }` **ou** o `AiRecipeDraft` direto.

```ts
interface AiIngredientDraft {
  nome: string
  quantidade: number | null
  unidade: string | null
  observacao?: string | null
}

interface AiRecipeDraft {
  nome: string
  categoria?: string | null
  rendimento_valor?: number | null
  rendimento_unidade?: string | null
  preco_venda?: number | null
  ingredientes: AiIngredientDraft[]
  modo_preparo?: string | null
  avisos: string[]          // mensagens de incerteza/suposição da IA
  confianca?: number | null // 0..1, opcional
}
```

Os tipos vivem em [`src/lib/aiRecipe.ts`](../src/lib/aiRecipe.ts).

## Como o frontend mapeia o draft para o modelo do app

- `AiRecipeDraft` → `Receita` (tipo `cardapio`, `cmv_meta = 0.30`).
- Cada `AiIngredientDraft` → `ReceitaItem` referenciando uma `Mercadoria`:
  - se já existe mercadoria com o mesmo nome (normalizado), reusa;
  - senão, **cria uma mercadoria nova com preço R$ 0,00** (categoria
    "Importado") e avisa o usuário para preencher o preço depois.
- Unidades livres da IA (grama, litro, unidade…) são normalizadas para as
  unidades do app (`g, kg, ml, L, un, cx, pct`); o usuário pode corrigir na
  revisão.

## ✅ Confirmado pelo Codex (commit f71ecea — backend landado)

1. **Edge Function** `ai-recipe-import` e `AiRecipeDraft` confirmados — coincidem
   exatamente com este doc e com `src/lib/aiRecipe.ts`.
2. **Autenticação**: `verify_jwt = true` em `supabase/config.toml`; a produção exige sessão do usuário. Para demos locais sem backend, use o fallback local sem IA.
3. **Limites**: texto 20.000 chars · imagem 4 MB (JPEG/PNG/WEBP) · 12 req/min por
   IP · modelo `gpt-4o-mini` (`OPENAI_RECIPE_MODEL` para trocar).
4. **Erros**: a função retorna `{ error, code }` — códigos em
   `supabase/functions/ai-recipe-import/README.md`. O frontend exibe `error`.
5. **Multi-tenant**: a IA não grava nada sozinha. Ao converter o draft em ficha,
   se a base multi-estabelecimento estiver ativa, a criação de ficha/mercadoria
   deve enviar `estabelecimento_id` (o frontend já cria via store escopada por
   estabelecimento).

## Fallback local (sem IA)

No modo local (sem Supabase configurado), a tela oferece **"Gerar rascunho do
texto (sem IA)"**, que apenas separa o texto colado em ingredientes/preparo via
heurística simples (`rascunhoLocalDeTexto`). Serve para testar o fluxo de
revisão sem backend e **deixa explícito** que não houve IA. Não substitui a
Edge Function.
