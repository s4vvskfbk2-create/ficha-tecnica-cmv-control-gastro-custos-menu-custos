# Supabase Edge Function: ai-recipe-import

> Entregue pelo **Codex** (commit `f71ecea`) e landada por Claude a partir de
> `handoff/codex-f71ecea.patch` (o push direto do Codex falhou por proxy 403).
> Backend é domínio do Codex — ver `AGENTS.md`.

Importa receita por **texto e/ou foto/screenshot** usando OpenAI no servidor e
retorna um rascunho editável de ficha técnica. A `OPENAI_API_KEY` nunca vai ao
navegador.

## Deploy

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set OPENAI_RECIPE_MODEL=gpt-4o-mini   # opcional
supabase functions deploy ai-recipe-import
```

## Auth atual

- **Produção:** exige usuário autenticado (`verify_jwt = true` em `supabase/config.toml`).
- A função também valida a sessão em `/auth/v1/user` antes de ler `OPENAI_API_KEY`.
  Isso bloqueia o fallback do `supabase-js` que envia `Authorization: Bearer <anon key>` quando não há usuário logado.
- Com `supabase.functions.invoke`, a sessão é enviada automaticamente quando
  existir usuário autenticado; em `fetch` manual, envie
  `Authorization: Bearer <access_token>`.
- Para demonstração sem backend/login, use o fallback local de texto no frontend; ele não chama IA.

## Request

```json
{
  "texto": "texto colado da receita",
  "imagemBase64": "base64 sem prefixo data:",
  "mimeType": "image/jpeg"
}
```

Também aceita os nomes legados `text`, `imageBase64` e `imageMimeType`.

## Response

```json
{
  "draft": {
    "nome": "...",
    "categoria": null,
    "rendimento_valor": null,
    "rendimento_unidade": null,
    "preco_venda": null,
    "ingredientes": [],
    "modo_preparo": null,
    "avisos": ["..."],
    "confianca": 0.7
  }
}
```

## Limites

- Texto: 20.000 caracteres.
- Imagem: 4 MB.
- Tipos: JPEG, PNG e WEBP.
- Rate limit MVP: 12 requisições/minuto por IP, em memória.
- Modelo padrão: `gpt-4o-mini` (`OPENAI_RECIPE_MODEL` para trocar).

## Erros (campo `code`)

`auth_required` · `invalid_session` · `missing_supabase_url` · `missing_input` · `text_too_large` · `image_too_large` ·
`unsupported_image_type` · `rate_limit_exceeded` · `missing_openai_key` ·
`openai_error` · `missing_structured_output` · `invalid_ai_json`.
O frontend exibe o campo `error` ao usuário.
