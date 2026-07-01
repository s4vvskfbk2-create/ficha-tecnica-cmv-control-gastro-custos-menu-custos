-- Coluna para "preço de venda automático pela meta de CMV" (feature de frontend).
-- Aditiva e idempotente. Domínio de backend é do Codex — revisar/ajustar se
-- preferir outro nome/local; o frontend só depende de receitas.preco_auto (bool).

alter table public.receitas
  add column if not exists preco_auto boolean not null default false;
