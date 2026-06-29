-- Schema inicial do MVP: Mercadorias, Fichas Técnicas e itens de ficha.
-- Aplique no seu projeto Supabase (SQL Editor ou `supabase db push`).

create extension if not exists "pgcrypto";

-- Mercadorias / insumos -----------------------------------------------------
create table if not exists public.mercadorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text,
  unidade text not null default 'g',
  embalagem_qtd numeric not null default 0,
  embalagem_preco numeric not null default 0,
  fornecedor text,
  created_at timestamptz not null default now()
);

-- Fichas técnicas / receitas ------------------------------------------------
create table if not exists public.fichas_tecnicas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text,
  rendimento numeric not null default 1,
  preco_venda numeric not null default 0,
  modo_preparo text,
  created_at timestamptz not null default now()
);

-- Itens da ficha (mercadoria + quantidade usada) ----------------------------
create table if not exists public.ficha_itens (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.fichas_tecnicas(id) on delete cascade,
  mercadoria_id uuid not null references public.mercadorias(id) on delete cascade,
  quantidade numeric not null default 0
);

create index if not exists ficha_itens_ficha_id_idx on public.ficha_itens(ficha_id);
create index if not exists ficha_itens_mercadoria_id_idx on public.ficha_itens(mercadoria_id);

-- Row Level Security --------------------------------------------------------
-- MVP: libera acesso para usuários autenticados. Ajuste conforme o modelo de
-- multi-tenant (ex.: coluna org_id + policies por organização) na evolução.
alter table public.mercadorias enable row level security;
alter table public.fichas_tecnicas enable row level security;
alter table public.ficha_itens enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'mercadorias' and policyname = 'auth_all') then
    create policy auth_all on public.mercadorias for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'fichas_tecnicas' and policyname = 'auth_all') then
    create policy auth_all on public.fichas_tecnicas for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ficha_itens' and policyname = 'auth_all') then
    create policy auth_all on public.ficha_itens for all to authenticated using (true) with check (true);
  end if;
end $$;
