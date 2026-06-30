-- Backend production hardening for Ficha Técnica & CMV.
-- Run after 0001_init.sql. Keeps RLS enabled and adds safe onboarding,
-- integrity constraints, timestamps and polymorphic item validation.

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Domain constraints (idempotent via catalog checks)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'estabelecimentos_segmento_chk') then
    alter table public.estabelecimentos
      add constraint estabelecimentos_segmento_chk
      check (segmento in ('bistro','a_la_carte','bar','pizzaria','cafe','confeitaria','fast_food','japones','outro'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'mercadorias_unidade_chk') then
    alter table public.mercadorias
      add constraint mercadorias_unidade_chk check (unidade in ('g','kg','ml','L','un','cx','pct'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'mercadorias_embalagem_qtd_nonnegative_chk') then
    alter table public.mercadorias
      add constraint mercadorias_embalagem_qtd_nonnegative_chk check (embalagem_qtd >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'mercadorias_embalagem_preco_nonnegative_chk') then
    alter table public.mercadorias
      add constraint mercadorias_embalagem_preco_nonnegative_chk check (embalagem_preco >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'mercadoria_preco_hist_qtd_nonnegative_chk') then
    alter table public.mercadoria_preco_hist
      add constraint mercadoria_preco_hist_qtd_nonnegative_chk check (qtd >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'mercadoria_preco_hist_preco_nonnegative_chk') then
    alter table public.mercadoria_preco_hist
      add constraint mercadoria_preco_hist_preco_nonnegative_chk check (preco >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'receitas_tipo_chk') then
    alter table public.receitas
      add constraint receitas_tipo_chk check (tipo in ('cardapio','producao'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'receitas_rendimento_valor_positive_chk') then
    alter table public.receitas
      add constraint receitas_rendimento_valor_positive_chk check (rendimento_valor > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'receitas_unidade_chk') then
    alter table public.receitas
      add constraint receitas_unidade_chk check (rendimento_unidade in ('g','kg','ml','L','un','cx','pct'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'receitas_valores_nonnegative_chk') then
    alter table public.receitas
      add constraint receitas_valores_nonnegative_chk check (
        rendimento_final_peso >= 0 and tempo_preparo_min >= 0 and
        validade_congelado_dias >= 0 and validade_refrigerado_dias >= 0 and validade_ambiente_dias >= 0 and
        preco_venda >= 0 and cmv_meta >= 0
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'receita_itens_tipo_chk') then
    alter table public.receita_itens
      add constraint receita_itens_tipo_chk check (tipo in ('mercadoria','receita'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'receita_itens_unidade_chk') then
    alter table public.receita_itens
      add constraint receita_itens_unidade_chk check (unidade in ('g','kg','ml','L','un','cx','pct'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'receita_itens_valores_chk') then
    alter table public.receita_itens
      add constraint receita_itens_valores_chk check (ordem >= 0 and qtd_liquida >= 0 and perc_aproveitamento > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'custos_extras_valor_nonnegative_chk') then
    alter table public.receita_custos_extras
      add constraint custos_extras_valor_nonnegative_chk check (valor >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'porcoes_unidade_chk') then
    alter table public.porcoes
      add constraint porcoes_unidade_chk check (unidade in ('g','kg','ml','L','un','cx','pct'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'porcoes_quantidade_positive_chk') then
    alter table public.porcoes
      add constraint porcoes_quantidade_positive_chk check (quantidade_que_faz > 0);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Updated-at automation
-- -----------------------------------------------------------------------------
create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists receitas_set_atualizado_em on public.receitas;
create trigger receitas_set_atualizado_em
before update on public.receitas
for each row execute function public.set_atualizado_em();

-- -----------------------------------------------------------------------------
-- Safe first establishment creation under RLS.
-- Direct INSERT into estabelecimentos remains protected by RLS; the frontend uses
-- this RPC so an authenticated user can create an establishment and immediately
-- receive membership in a single backend transaction.
-- -----------------------------------------------------------------------------
create or replace function public.criar_estabelecimento_com_usuario(
  p_nome text,
  p_segmento text default 'outro'
)
returns public.estabelecimentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_est public.estabelecimentos;
begin
  if v_user is null then
    raise exception 'Usuário autenticado é obrigatório.' using errcode = '28000';
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Nome do estabelecimento é obrigatório.' using errcode = '23514';
  end if;

  insert into public.estabelecimentos (nome, segmento)
  values (trim(p_nome), coalesce(nullif(p_segmento, ''), 'outro'))
  returning * into v_est;

  insert into public.usuario_estabelecimento (user_id, estabelecimento_id, papel)
  values (v_user, v_est.id, 'gestor');

  return v_est;
end;
$$;

revoke all on function public.criar_estabelecimento_com_usuario(text, text) from public;
grant execute on function public.criar_estabelecimento_com_usuario(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Polymorphic receita_itens integrity: the referenced mercadoria/subficha must
-- belong to the same estabelecimento as the owning receita. Self-reference is
-- rejected at DB level; deeper cycles remain protected in calc.ts.
-- -----------------------------------------------------------------------------
create or replace function public.validar_receita_item_ref()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_est uuid;
  v_ref_est uuid;
begin
  select estabelecimento_id into v_est from public.receitas where id = new.receita_id;
  if v_est is null then
    raise exception 'Receita do item não encontrada.' using errcode = '23503';
  end if;

  if new.tipo = 'mercadoria' then
    select estabelecimento_id into v_ref_est from public.mercadorias where id = new.ref_id;
  elsif new.tipo = 'receita' then
    if new.ref_id = new.receita_id then
      raise exception 'Uma ficha não pode referenciar ela mesma como subficha.' using errcode = '23514';
    end if;
    select estabelecimento_id into v_ref_est from public.receitas where id = new.ref_id;
  else
    raise exception 'Tipo de item inválido: %', new.tipo using errcode = '23514';
  end if;

  if v_ref_est is null then
    raise exception 'Referência do item não encontrada.' using errcode = '23503';
  end if;

  if v_ref_est <> v_est then
    raise exception 'Item referencia dados de outro estabelecimento.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists receita_itens_validar_ref on public.receita_itens;
create trigger receita_itens_validar_ref
before insert or update on public.receita_itens
for each row execute function public.validar_receita_item_ref();

-- Helpful ordering indexes for snapshots and editor screens.
create index if not exists receita_itens_receita_ordem_idx on public.receita_itens(receita_id, ordem);
create index if not exists preco_hist_merc_data_idx on public.mercadoria_preco_hist(mercadoria_id, data desc);
