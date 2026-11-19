-- =============================================================================
-- Seção 17 · Reorganização do Financeiro de T.I. (aprovada em 19/11/2026)
-- Natureza CAPEX/OPEX, área = departamento, rateio entre áreas, fatura avulsa,
-- recebimentos, fechamento anual do imobilizado e premissas da projeção.
-- Sem DROP de tabela ou coluna. Idempotente.
-- =============================================================================

-- 1) Natureza CAPEX/OPEX (automática no app; manual com motivo) -------------------
alter table public.faturas
  add column if not exists natureza         text check (natureza in ('capex', 'opex')),
  add column if not exists natureza_manual  boolean not null default false,
  add column if not exists natureza_motivo  text,
  add column if not exists departamento_id  text references public.departamentos (id) on delete set null,
  -- Fatura avulsa (sem contrato, licença ou pedido): fornecedor + descrição
  add column if not exists fornecedor_id    text references public.fornecedores (id) on delete restrict,
  add column if not exists descricao        text,
  add column if not exists ativo_id         text references public.ativos (id) on delete set null,
  add column if not exists categoria_despesa text;

alter table public.pedido_itens
  add column if not exists natureza        text check (natureza in ('capex', 'opex')),
  add column if not exists natureza_manual boolean not null default false,
  add column if not exists natureza_motivo text;

alter table public.ativos
  add column if not exists natureza        text check (natureza in ('capex', 'opex')),
  add column if not exists natureza_manual boolean not null default false,
  add column if not exists natureza_motivo text;

-- 2) Área = departamento (o centro_custo em texto fica como legado) ---------------
alter table public.contratos          add column if not exists departamento_id text references public.departamentos (id) on delete set null;
alter table public.licencas_software  add column if not exists departamento_id text references public.departamentos (id) on delete set null;
alter table public.linhas_telefonicas add column if not exists departamento_id text references public.departamentos (id) on delete set null;
alter table public.pedidos_compra     add column if not exists departamento_id text references public.departamentos (id) on delete set null;
alter table public.orcamentos
  add column if not exists departamento_id text references public.departamentos (id) on delete set null,
  add column if not exists natureza        text check (natureza in ('capex', 'opex')),
  add column if not exists origem          text not null default 'manual' check (origem in ('manual', 'copia', 'projecao'));

create index if not exists idx_faturas_departamento   on public.faturas (departamento_id);
create index if not exists idx_faturas_fornecedor     on public.faturas (fornecedor_id);
create index if not exists idx_faturas_ativo          on public.faturas (ativo_id);
create index if not exists idx_contratos_departamento on public.contratos (departamento_id);
create index if not exists idx_licencas_departamento  on public.licencas_software (departamento_id);
create index if not exists idx_linhas_departamento    on public.linhas_telefonicas (departamento_id);
create index if not exists idx_pedidos_departamento   on public.pedidos_compra (departamento_id);
create index if not exists idx_orcamentos_departamento on public.orcamentos (departamento_id);

-- Fatura: no máximo um alvo; sem alvo, exige fornecedor e descrição (avulsa)
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'chk_fatura_alvo'
             and pg_get_constraintdef(oid) not like '%descricao%') then
    alter table public.faturas drop constraint chk_fatura_alvo;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_fatura_alvo') then
    alter table public.faturas add constraint chk_fatura_alvo check (
      num_nonnulls(licenca_id, contrato_id, pedido_id) = 1
      or (num_nonnulls(licenca_id, contrato_id, pedido_id) = 0 and fornecedor_id is not null and nullif(trim(descricao), '') is not null)
    );
  end if;
end $$;

-- 3) Rateio entre áreas (alocação de custo; não é conta a receber) -----------------
create table if not exists public.rateios (
  id              text primary key default gen_random_uuid()::text,
  origem_tipo     text not null check (origem_tipo in ('contrato', 'licenca', 'linha', 'fatura')),
  origem_id       text not null,
  departamento_id text not null references public.departamentos (id) on delete restrict,
  percentual      numeric(5,2) not null check (percentual > 0 and percentual <= 100),
  criado_por      text references public.colaboradores (id) on delete set null,
  criado_em       timestamptz not null default now(),
  unique (origem_tipo, origem_id, departamento_id)
);
create index if not exists idx_rateios_origem on public.rateios (origem_tipo, origem_id);

-- Soma dos percentuais de uma origem nunca passa de 100
create or replace function public.validar_rateio()
returns trigger language plpgsql set search_path = public as $$
declare v_total numeric;
begin
  select coalesce(sum(percentual), 0) into v_total from public.rateios
   where origem_tipo = new.origem_tipo and origem_id = new.origem_id and id <> new.id;
  if v_total + new.percentual > 100 then
    raise exception 'O rateio passa de 100%%: as outras áreas já somam % %%', v_total using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_validar_rateio on public.rateios;
create trigger trg_validar_rateio before insert or update on public.rateios for each row execute function public.validar_rateio();

-- 4) Recebimentos (venda de baixado, ressarcimento, reembolso/crédito, devolução) --
create table if not exists public.recebimentos (
  id              text primary key default gen_random_uuid()::text,
  tipo            text not null check (tipo in ('venda_ativo', 'ressarcimento', 'reembolso_fornecedor', 'devolucao_compra', 'outro')),
  descricao       text not null,
  valor           numeric(12,2) not null check (valor > 0),
  previsto_para   date,
  recebido_em     date,
  valor_recebido  numeric(12,2) check (valor_recebido >= 0),
  status          text not null default 'previsto' check (status in ('previsto', 'recebido', 'cancelado')),
  ativo_id        text references public.ativos (id) on delete set null,
  baixa_id        text references public.ativo_baixas (id) on delete set null,
  colaborador_id  text references public.colaboradores (id) on delete set null,
  fornecedor_id   text references public.fornecedores (id) on delete set null,
  pedido_id       text references public.pedidos_compra (id) on delete set null,
  departamento_id text references public.departamentos (id) on delete set null,
  arquivo_caminho text,
  observacoes     text,
  criado_por      text references public.colaboradores (id) on delete set null,
  criado_em       timestamptz not null default now(),
  constraint chk_recebido check (status <> 'recebido' or recebido_em is not null)
);
create index if not exists idx_recebimentos_ativo       on public.recebimentos (ativo_id);
create index if not exists idx_recebimentos_colaborador on public.recebimentos (colaborador_id);
create index if not exists idx_recebimentos_fornecedor  on public.recebimentos (fornecedor_id);

-- 5) Fechamento anual do imobilizado (foto imutável) ------------------------------
create table if not exists public.imobilizado_fechamentos (
  id             text primary key default gen_random_uuid()::text,
  ano            integer not null check (ano between 2000 and 2100),
  foto           jsonb not null,
  fechado_por    text references public.colaboradores (id) on delete set null,
  fechado_em     timestamptz not null default now(),
  reaberto_por   text references public.colaboradores (id) on delete set null,
  reaberto_em    timestamptz,
  reabertura_motivo text
);
create unique index if not exists uq_imobilizado_ano_vigente on public.imobilizado_fechamentos (ano) where reaberto_em is null;

create or replace function public.fechar_imobilizado(p_ano integer, p_foto jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if public.meu_papel() <> 'ti_admin' then
    raise exception 'Só o administrador fecha o imobilizado' using errcode = '42501';
  end if;
  if exists (select 1 from public.imobilizado_fechamentos where ano = p_ano and reaberto_em is null) then
    raise exception 'O imobilizado de % já está fechado', p_ano using errcode = '23505';
  end if;
  insert into public.imobilizado_fechamentos (ano, foto, fechado_por)
  values (p_ano, p_foto, public.meu_colaborador_id()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.reabrir_imobilizado(p_ano integer, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.meu_papel() <> 'ti_admin' then
    raise exception 'Só o administrador reabre o imobilizado' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Informe o motivo da reabertura' using errcode = '23514';
  end if;
  update public.imobilizado_fechamentos
     set reaberto_em = now(), reaberto_por = public.meu_colaborador_id(), reabertura_motivo = p_motivo
   where ano = p_ano and reaberto_em is null;
  if not found then
    raise exception 'O imobilizado de % não está fechado', p_ano using errcode = 'P0002';
  end if;
end $$;

revoke execute on function public.fechar_imobilizado(integer, jsonb) from public, anon;
revoke execute on function public.reabrir_imobilizado(integer, text) from public, anon;
grant execute on function public.fechar_imobilizado(integer, jsonb) to authenticated;
grant execute on function public.reabrir_imobilizado(integer, text) to authenticated;

-- Decisão 1: Compras paga todas as faturas e vê só o resumo de contratos e licenças
-- (sem cláusulas, anexos, detalhes técnicos nem dados de pagamento)
create or replace function public.contratos_resumo()
returns table (id text, fornecedor_id text, tipo text, valor numeric, periodicidade text, inicio date, fim date, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.meu_papel() not in ('ti_admin', 'ti_suporte', 'compras') then
    raise exception 'Sem acesso' using errcode = '42501';
  end if;
  return query select c.id, c.fornecedor_id, c.tipo::text, c.valor::numeric, c.periodicidade::text, c.inicio::date, c.fim::date, c.status::text from public.contratos c;
end $$;

create or replace function public.licencas_resumo()
returns table (id text, nome text, fornecedor_id text)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.meu_papel() not in ('ti_admin', 'ti_suporte', 'compras') then
    raise exception 'Sem acesso' using errcode = '42501';
  end if;
  return query select l.id, l.nome, l.fornecedor_id from public.licencas_software l;
end $$;

revoke execute on function public.contratos_resumo() from public, anon;
revoke execute on function public.licencas_resumo() from public, anon;
grant execute on function public.contratos_resumo() to authenticated;
grant execute on function public.licencas_resumo() to authenticated;

-- 6) Premissas (limite de capitalização, reajuste, câmbio, reposição, contas) -----
-- Ex.: {"limiteCapitalizacao":1200,"reajustePadraoPct":5,"cambio":{"USD":5.4,"EUR":5.9},
--       "reposicao":{"notebook":6000},"contaContabil":{"software":"3.1.01"}}
alter table public.configuracoes_empresa add column if not exists premissas_financeiras jsonb not null default '{}'::jsonb;

-- 7) RLS -------------------------------------------------------------------------
alter table public.rateios                 enable row level security;
alter table public.recebimentos            enable row level security;
alter table public.imobilizado_fechamentos enable row level security;

do $$
declare
  r record;
  v_ti      constant text := 'public.meu_papel() in (''ti_admin'', ''ti_suporte'')';
  v_ti_comp constant text := 'public.meu_papel() in (''ti_admin'', ''ti_suporte'', ''compras'')';
  v_comp    constant text := 'public.meu_papel() = ''compras''';
begin
  for r in
    select * from (values
      ('rateios',                 'select', 'ler',     v_ti,      null),
      ('rateios',                 'insert', 'inserir', null,      v_ti),
      ('rateios',                 'update', 'alterar', v_ti,      v_ti),
      ('rateios',                 'delete', 'excluir', v_ti,      null),
      ('recebimentos',            'select', 'ler',     v_ti_comp, null),
      ('recebimentos',            'insert', 'inserir', null,      v_ti_comp),
      ('recebimentos',            'update', 'alterar', v_ti_comp, v_ti_comp),
      ('imobilizado_fechamentos', 'select', 'ler',     v_ti,      null),
      -- Decisão 1: Compras lê e paga todas as faturas (não só as de pedido)
      ('faturas',                 'select', 'compras_ler_todas',     v_comp, null),
      ('faturas',                 'update', 'compras_alterar_todas', v_comp, v_comp)
    ) as v(tabela, cmd, nome, usando, checando)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tabela and policyname = r.tabela || '_' || r.nome) then
      execute format('create policy %I on public.%I for %s to authenticated %s %s',
        r.tabela || '_' || r.nome, r.tabela, r.cmd,
        case when r.usando is not null then 'using (' || r.usando || ')' else '' end,
        case when r.checando is not null then 'with check (' || r.checando || ')' else '' end);
    end if;
  end loop;
end $$;
