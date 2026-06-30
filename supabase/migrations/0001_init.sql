-- Schema do app de Ficha Técnica & CMV (multi-estabelecimento).
-- Aplique no seu projeto Supabase (SQL Editor ou `supabase db push`).

create extension if not exists "pgcrypto";

-- Núcleo multi-estabelecimento -------------------------------------------------
create table if not exists public.estabelecimentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  segmento text not null default 'outro',
  created_at timestamptz not null default now()
);

-- Vínculo usuário ↔ estabelecimento (base para RLS por unidade).
create table if not exists public.usuario_estabelecimento (
  user_id uuid not null references auth.users(id) on delete cascade,
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  papel text not null default 'gestor',
  primary key (user_id, estabelecimento_id)
);

-- Mercadorias / insumos --------------------------------------------------------
create table if not exists public.mercadorias (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  nome text not null,
  categoria text,
  unidade text not null default 'g',
  embalagem_qtd numeric not null default 0,
  embalagem_preco numeric not null default 0,
  fornecedor text,
  atualizado_em date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists mercadorias_estab_idx on public.mercadorias(estabelecimento_id);

create table if not exists public.mercadoria_preco_hist (
  id uuid primary key default gen_random_uuid(),
  mercadoria_id uuid not null references public.mercadorias(id) on delete cascade,
  preco numeric not null default 0,
  qtd numeric not null default 0,
  unidade text not null default 'g',
  data date not null default current_date,
  fornecedor text
);
create index if not exists preco_hist_merc_idx on public.mercadoria_preco_hist(mercadoria_id);

-- Receitas / fichas técnicas ---------------------------------------------------
create table if not exists public.receitas (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  nome text not null,
  categoria text,
  tipo text not null default 'cardapio',          -- cardapio | producao
  rendimento_valor numeric not null default 1,
  rendimento_unidade text not null default 'un',
  rendimento_final_peso numeric not null default 0,
  tempo_preparo_min integer not null default 0,
  validade_congelado_dias integer not null default 0,
  validade_refrigerado_dias integer not null default 0,
  validade_ambiente_dias integer not null default 0,
  preco_venda numeric not null default 0,
  cmv_meta numeric not null default 0.3,
  modo_preparo text,
  observacoes text,
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists receitas_estab_idx on public.receitas(estabelecimento_id);

-- Itens da ficha (mercadoria OU subficha) — composição recursiva ---------------
create table if not exists public.receita_itens (
  id uuid primary key default gen_random_uuid(),
  receita_id uuid not null references public.receitas(id) on delete cascade,
  ordem integer not null default 0,
  titulo_secao text,
  tipo text not null default 'mercadoria',         -- mercadoria | receita
  ref_id uuid not null,
  qtd_liquida numeric not null default 0,
  unidade text not null default 'g',
  perc_aproveitamento numeric not null default 1,
  medida_caseira text
);
create index if not exists receita_itens_receita_idx on public.receita_itens(receita_id);
create index if not exists receita_itens_ref_idx on public.receita_itens(ref_id);

create table if not exists public.receita_custos_extras (
  id uuid primary key default gen_random_uuid(),
  receita_id uuid not null references public.receitas(id) on delete cascade,
  descricao text not null default '',
  valor numeric not null default 0
);
create index if not exists custos_extras_receita_idx on public.receita_custos_extras(receita_id);

create table if not exists public.porcoes (
  id uuid primary key default gen_random_uuid(),
  receita_id uuid not null references public.receitas(id) on delete cascade,
  nome text not null default '',
  unidade text not null default 'un',
  quantidade_que_faz numeric not null default 1
);
create index if not exists porcoes_receita_idx on public.porcoes(receita_id);

-- Row Level Security -----------------------------------------------------------
-- RLS por estabelecimento: usuário só enxerga unidades às quais está vinculado.
alter table public.estabelecimentos enable row level security;
alter table public.usuario_estabelecimento enable row level security;
alter table public.mercadorias enable row level security;
alter table public.mercadoria_preco_hist enable row level security;
alter table public.receitas enable row level security;
alter table public.receita_itens enable row level security;
alter table public.receita_custos_extras enable row level security;
alter table public.porcoes enable row level security;

-- Estabelecimentos que o usuário pode acessar.
create or replace function public.estabs_do_usuario()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select estabelecimento_id from public.usuario_estabelecimento where user_id = auth.uid()
$$;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'estabelecimentos' and policyname = 'estab_acesso') then
    create policy estab_acesso on public.estabelecimentos for all to authenticated
      using (id in (select public.estabs_do_usuario()))
      with check (id in (select public.estabs_do_usuario()));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'usuario_estabelecimento' and policyname = 'ue_self') then
    create policy ue_self on public.usuario_estabelecimento for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where tablename = 'mercadorias' and policyname = 'merc_estab') then
    create policy merc_estab on public.mercadorias for all to authenticated
      using (estabelecimento_id in (select public.estabs_do_usuario()))
      with check (estabelecimento_id in (select public.estabs_do_usuario()));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'mercadoria_preco_hist' and policyname = 'preco_estab') then
    create policy preco_estab on public.mercadoria_preco_hist for all to authenticated
      using (mercadoria_id in (select id from public.mercadorias where estabelecimento_id in (select public.estabs_do_usuario())))
      with check (mercadoria_id in (select id from public.mercadorias where estabelecimento_id in (select public.estabs_do_usuario())));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'receitas' and policyname = 'rec_estab') then
    create policy rec_estab on public.receitas for all to authenticated
      using (estabelecimento_id in (select public.estabs_do_usuario()))
      with check (estabelecimento_id in (select public.estabs_do_usuario()));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'receita_itens' and policyname = 'item_estab') then
    create policy item_estab on public.receita_itens for all to authenticated
      using (receita_id in (select id from public.receitas where estabelecimento_id in (select public.estabs_do_usuario())))
      with check (receita_id in (select id from public.receitas where estabelecimento_id in (select public.estabs_do_usuario())));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'receita_custos_extras' and policyname = 'extra_estab') then
    create policy extra_estab on public.receita_custos_extras for all to authenticated
      using (receita_id in (select id from public.receitas where estabelecimento_id in (select public.estabs_do_usuario())))
      with check (receita_id in (select id from public.receitas where estabelecimento_id in (select public.estabs_do_usuario())));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'porcoes' and policyname = 'porcao_estab') then
    create policy porcao_estab on public.porcoes for all to authenticated
      using (receita_id in (select id from public.receitas where estabelecimento_id in (select public.estabs_do_usuario())))
      with check (receita_id in (select id from public.receitas where estabelecimento_id in (select public.estabs_do_usuario())));
  end if;
end $$;
