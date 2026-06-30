# Backend pronto para produção — Supabase + IA

Este documento consolida o backend necessário para rodar o app fora do modo local.

## Componentes entregues

- Migração base `supabase/migrations/0001_init.sql` com tabelas, índices e RLS por estabelecimento.
- Migração de hardening `supabase/migrations/0002_backend_production_hardening.sql` com:
  - constraints de domínio para segmentos, unidades, tipos e valores não negativos;
  - trigger de `atualizado_em` para receitas;
  - RPC `criar_estabelecimento_com_usuario` para criar a primeira unidade do usuário autenticado sem quebrar RLS;
  - trigger `receita_itens_validar_ref` para impedir itens apontando para outro estabelecimento ou autorreferência direta.
- Edge Function `ai-recipe-import` com validação real de usuário autenticado antes de ler `OPENAI_API_KEY`, OpenAI server-side, schema JSON, limite de texto/imagem e rate limit.
- `supabase/config.toml` com `verify_jwt = true` para produção.
- Script `npm run audit:backend` para checagens estáticas do backend.

## Deploy do banco

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Ou aplique as migrações em ordem no SQL Editor:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_backend_production_hardening.sql`

## Deploy da Edge Function de IA

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set OPENAI_RECIPE_MODEL=gpt-4o-mini
supabase functions deploy ai-recipe-import
```

A função exige JWT em produção. No frontend, use `supabase.functions.invoke`, que envia a sessão automaticamente quando existe usuário autenticado.

## Bootstrap de estabelecimentos

Com RLS ativo, um usuário novo ainda não pertence a nenhum estabelecimento. Por isso o frontend deve criar unidades pelo RPC:

```ts
supabase.rpc('criar_estabelecimento_com_usuario', {
  p_nome: 'Minha Unidade',
  p_segmento: 'bistro',
})
```

A camada `src/lib/db.ts` já usa esse RPC quando o Supabase está configurado.

## Auditoria local

```bash
npm run audit:backend
npm run audit:excel
npm run test:core
npm run typecheck
npm run build
```

## Checklist de produção

- [ ] Projeto Supabase criado e linkado.
- [ ] Migrações aplicadas sem erro.
- [ ] Usuários autenticados conseguem criar o primeiro estabelecimento via RPC.
- [ ] RLS bloqueia acesso a estabelecimentos não vinculados.
- [ ] `OPENAI_API_KEY` configurada como secret da Edge Function, nunca no frontend.
- [ ] `ai-recipe-import` deployada com `verify_jwt = true` e testada sem usuário logado para confirmar erro `auth_required`.
- [ ] Frontend publicado com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- [ ] Fluxo completo validado: Mercadorias → Fichas → Cardápio → Exportações → Importação IA.
