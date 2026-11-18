-- ==============================================================================
-- FASE 11 · PATRIMÔNIO, ORÇAMENTO E COMPRAS (seção 12 da documentação)
-- ------------------------------------------------------------------------------
-- Reexecutável e sem DROP de tabela ou coluna. Só troca a regra (check) do alvo da
-- fatura, que passa a aceitar o pedido de compra (mesmo padrão da Entrega A).
--
-- 1. configuracoes_empresa.vida_util   vida útil por grupo (anos) e valor residual (%)
-- 2. orcamentos                         previsto anual por categoria × área, 12 meses
-- 3. pedidos_compra / pedido_itens / pedido_cotacoes / pedido_eventos
--    fluxo rascunho → aguardando → aprovado/recusado → comprado → recebido (ou cancelado)
-- 4. faturas.pedido_id                  "Comprado" gera a fatura do pedido em Contas a pagar
-- 5. ativos.grupo_depreciacao, ativos.pedido_id
-- 6. inventarios_fisicos / inventario_itens   conferência por local, com QR
-- 7. Regras (gatilhos) e RLS no padrão meu_papel()
--    orcamentos: T.I. lê, só ti_admin grava
--    pedidos: T.I. lê e opera; só ti_admin aprova/recusa (função)
--    RH e gestor pedem compra pela função solicitar_compra e veem os pedidos sem
--    valores pela função pedidos_solicitados()
-- 8. Funções: pode_pedir_compra, solicitar_compra, pedidos_solicitados, mudar_status_pedido,
--    registrar_compra_pedido, receber_pedido, abrir_inventario, fechar_inventario
-- 9. limpar_base inclui as tabelas novas
-- ==============================================================================

-- 1. Vida útil ---------------------------------------------------------------------------------
alter table public.configuracoes_empresa add column if not exists vida_util jsonb;

-- 2. Orçamento ---------------------------------------------------------------------------------
create table if not exists public.orcamentos (
  id           text primary key default gen_random_uuid()::text,
  ano          integer not null check (ano between 2000 and 2100),
  categoria    text not null check (categoria in ('software', 'ia', 'telefonia', 'internet', 'hardware', 'nuvem', 'servicos', 'outros')),
  area         text not null default '',
  valor_anual  numeric(14,2) not null default 0 check (valor_anual >= 0),
  meses        jsonb not null default '[]'::jsonb,
  observacoes  text,
  criado_por   text references public.colaboradores (id) on delete set null,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint chk_orcamento_meses check (jsonb_typeof(meses) = 'array' and jsonb_array_length(meses) in (0, 12))
);
create unique index if not exists uq_orcamento on public.orcamentos (ano, categoria, lower(btrim(area)));

-- O anual é sempre a soma dos 12 meses (quando informados); nenhum mês negativo
create or replace function public.ajustar_orcamento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_total numeric := 0;
  v_m     jsonb;
begin
  new.area := btrim(coalesce(new.area, ''));
  if jsonb_array_length(new.meses) = 12 then
    for v_m in select value from jsonb_array_elements(new.meses) loop
      if jsonb_typeof(v_m) <> 'number' or (v_m #>> '{}')::numeric < 0 then
        raise exception 'Valor mensal inválido no orçamento' using errcode = '23514';
      end if;
      v_total := v_total + (v_m #>> '{}')::numeric;
    end loop;
    new.valor_anual := round(v_total, 2);
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
revoke all on function public.ajustar_orcamento() from public, anon, authenticated;
create or replace trigger trg_orcamentos_ajustar
  before insert or update on public.orcamentos
  for each row execute function public.ajustar_orcamento();

-- 3. Pedidos de compra -------------------------------------------------------------------------
create sequence if not exists public.pedidos_compra_seq;

create table if not exists public.pedidos_compra (
  id                     text primary key default gen_random_uuid()::text,
  codigo                 text unique,
  titulo                 text not null check (btrim(titulo) <> ''),
  justificativa          text,
  categoria              text not null default 'hardware'
                           check (categoria in ('software', 'ia', 'telefonia', 'internet', 'hardware', 'nuvem', 'servicos', 'outros')),
  area                   text not null default '',
  status                 text not null default 'rascunho'
                           check (status in ('rascunho', 'aguardando', 'aprovado', 'recusado', 'comprado', 'recebido', 'cancelado')),
  solicitante_id         text references public.colaboradores (id) on delete set null,
  colaborador_destino_id text references public.colaboradores (id) on delete set null,
  chamado_id             text references public.chamados (id) on delete set null,
  processo_item_id       text references public.processo_itens (id) on delete set null,
  necessario_em          date,
  fornecedor_id          text references public.fornecedores (id) on delete set null,
  numero_nf              text,
  data_compra            date,
  vencimento             date,
  forma_pagamento        text check (forma_pagamento is null or forma_pagamento in ('boleto', 'cartao', 'debito', 'pix', 'transferencia', 'outro')),
  valor_final            numeric(14,2) check (valor_final is null or valor_final >= 0),
  fatura_id              text references public.faturas (id) on delete set null,
  motivo                 text,
  aprovado_por           text references public.colaboradores (id) on delete set null,
  aprovado_em            timestamptz,
  recebido_por           text references public.colaboradores (id) on delete set null,
  recebido_em            timestamptz,
  criado_por             text references public.colaboradores (id) on delete set null,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);
create index if not exists idx_pedidos_status on public.pedidos_compra (status);
create index if not exists idx_pedidos_chamado on public.pedidos_compra (chamado_id);
create index if not exists idx_pedidos_item on public.pedidos_compra (processo_item_id);
create index if not exists idx_pedidos_solicitante on public.pedidos_compra (solicitante_id);

create table if not exists public.pedido_itens (
  id              text primary key default gen_random_uuid()::text,
  pedido_id       text not null references public.pedidos_compra (id) on delete cascade,
  tipo            text not null check (tipo in ('equipamento', 'acessorio', 'licenca', 'servico')),
  descricao       text not null check (btrim(descricao) <> ''),
  categoria_ativo text check (categoria_ativo is null or categoria_ativo in ('hardware', 'periferico', 'telefonia')),
  marca           text,
  modelo          text,
  especificacao   text,
  estoque_item_id text references public.estoque_itens (id) on delete set null,
  licenca_id      text references public.licencas_software (id) on delete set null,
  quantidade      integer not null default 1 check (quantidade > 0),
  valor_unitario  numeric(14,2) check (valor_unitario is null or valor_unitario >= 0),
  ordem           integer not null default 0
);
create index if not exists idx_pedido_itens_pedido on public.pedido_itens (pedido_id);

create table if not exists public.pedido_cotacoes (
  id              text primary key default gen_random_uuid()::text,
  pedido_id       text not null references public.pedidos_compra (id) on delete cascade,
  fornecedor_id   text not null references public.fornecedores (id) on delete restrict,
  valor           numeric(14,2) not null check (valor >= 0),
  prazo_dias      integer check (prazo_dias is null or prazo_dias >= 0),
  validade        date,
  observacoes     text,
  arquivo_caminho text,
  vencedora       boolean not null default false,
  criado_por      text references public.colaboradores (id) on delete set null,
  criado_em       timestamptz not null default now()
);
create index if not exists idx_pedido_cotacoes_pedido on public.pedido_cotacoes (pedido_id);
create unique index if not exists uq_pedido_cotacao_vencedora on public.pedido_cotacoes (pedido_id) where vencedora;

create table if not exists public.pedido_eventos (
  id        text primary key default gen_random_uuid()::text,
  pedido_id text not null references public.pedidos_compra (id) on delete cascade,
  de        text,
  para      text not null,
  motivo    text,
  por       text references public.colaboradores (id) on delete set null,
  em        timestamptz not null default now()
);
create index if not exists idx_pedido_eventos_pedido on public.pedido_eventos (pedido_id, em);

-- 4. Fatura do pedido --------------------------------------------------------------------------
alter table public.faturas
  add column if not exists pedido_id text references public.pedidos_compra (id) on delete restrict;
create unique index if not exists uq_fatura_pedido on public.faturas (pedido_id)
  where pedido_id is not null and status <> 'cancelada';
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'chk_fatura_alvo'
             and pg_get_constraintdef(oid) not like '%pedido_id%') then
    alter table public.faturas drop constraint chk_fatura_alvo;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_fatura_alvo') then
    alter table public.faturas add constraint chk_fatura_alvo check (num_nonnulls(licenca_id, contrato_id, pedido_id) = 1);
  end if;
end $$;

-- Valores da fatura só mudam enquanto "a pagar" (agora inclui o pedido)
create or replace function public.proteger_fatura()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'paga' and new.status <> 'paga'
     and coalesce(current_setting('app.desfazer_pagamento', true), '') <> 'sim' then
    raise exception 'Use "Desfazer pagamento" (administrador) para reabrir uma fatura paga' using errcode = '42501';
  end if;
  if old.status <> 'a_pagar' and (
       new.valor is distinct from old.valor or new.competencia is distinct from old.competencia
       or new.vencimento is distinct from old.vencimento or new.licenca_id is distinct from old.licenca_id
       or new.contrato_id is distinct from old.contrato_id or new.pedido_id is distinct from old.pedido_id) then
    raise exception 'Só é possível editar valores de uma fatura "a pagar"' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_fatura() from public, anon, authenticated;

-- 5. Ativos ------------------------------------------------------------------------------------
alter table public.ativos
  add column if not exists grupo_depreciacao text,
  add column if not exists pedido_id         text references public.pedidos_compra (id) on delete set null;
create index if not exists idx_ativos_pedido on public.ativos (pedido_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_ativo_grupo_depreciacao') then
    alter table public.ativos add constraint chk_ativo_grupo_depreciacao check (grupo_depreciacao is null
      or grupo_depreciacao in ('computadores', 'celulares', 'servidores', 'perifericos', 'moveis', 'nao_deprecia'));
  end if;
end $$;

-- 6. Inventário físico -------------------------------------------------------------------------
create table if not exists public.inventarios_fisicos (
  id          text primary key default gen_random_uuid()::text,
  titulo      text not null check (btrim(titulo) <> ''),
  local       text not null default '',
  unidade_id  text references public.unidades (id) on delete set null,
  status      text not null default 'aberto' check (status in ('aberto', 'fechado', 'cancelado')),
  observacoes text,
  resumo      jsonb,
  criado_por  text references public.colaboradores (id) on delete set null,
  criado_em   timestamptz not null default now(),
  fechado_por text references public.colaboradores (id) on delete set null,
  fechado_em  timestamptz
);

create table if not exists public.inventario_itens (
  id               text primary key default gen_random_uuid()::text,
  inventario_id    text not null references public.inventarios_fisicos (id) on delete cascade,
  ativo_id         text not null references public.ativos (id) on delete restrict,
  local_esperado   text,
  situacao         text not null default 'pendente' check (situacao in ('pendente', 'encontrado', 'nao_encontrado', 'outro_local')),
  local_encontrado text,
  via_qr           boolean not null default false,
  observacao       text,
  conferido_por    text references public.colaboradores (id) on delete set null,
  conferido_em     timestamptz,
  constraint chk_inventario_outro_local check (situacao <> 'outro_local' or length(btrim(coalesce(local_encontrado, ''))) > 0)
);
create unique index if not exists uq_inventario_item on public.inventario_itens (inventario_id, ativo_id);
create index if not exists idx_inventario_itens_ativo on public.inventario_itens (ativo_id);

-- ==============================================================================
-- 7. Regras
-- ==============================================================================

-- Autoria carimbada pelo banco (mesma função da Fase 8)
do $$
declare t text;
begin
  foreach t in array array['orcamentos', 'pedidos_compra', 'pedido_cotacoes', 'inventarios_fisicos'] loop
    execute format(
      'create or replace trigger %I before insert or update on public.%I for each row execute function public.carimbar_criacao()',
      'trg_' || t || '_carimbar', t);
  end loop;
end $$;

-- Código do pedido (PC-2026-0001) e situação só pelas funções
create or replace function public.proteger_pedido()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_op boolean := coalesce(current_setting('app.operacao_pedido', true), '') = 'sim';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'rascunho' and not v_op then
      raise exception 'Pedido novo começa como rascunho' using errcode = '23514';
    end if;
    new.codigo := 'PC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.pedidos_compra_seq')::text, 4, '0');
    new.area := btrim(coalesce(new.area, ''));
    if new.solicitante_id is null then
      new.solicitante_id := public.meu_colaborador_id();
    end if;
    return new;
  end if;

  new.codigo := old.codigo;
  new.atualizado_em := now();
  if not v_op then
    if new.status is distinct from old.status then
      raise exception 'Use as ações do pedido para mudar a situação' using errcode = '23514';
    end if;
    if new.aprovado_por is distinct from old.aprovado_por or new.aprovado_em is distinct from old.aprovado_em
       or new.fatura_id is distinct from old.fatura_id or new.valor_final is distinct from old.valor_final
       or new.recebido_em is distinct from old.recebido_em or new.solicitante_id is distinct from old.solicitante_id then
      raise exception 'Esses dados do pedido são gravados pelas ações (aprovar, comprar, receber)' using errcode = '23514';
    end if;
    if old.status not in ('rascunho', 'aguardando', 'recusado') then
      raise exception 'O pedido % não pode mais ser editado (situação: %)', old.codigo, old.status using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_pedido() from public, anon, authenticated;
create or replace trigger trg_pedidos_proteger
  before insert or update on public.pedidos_compra
  for each row execute function public.proteger_pedido();

-- Histórico de cada mudança de situação
create or replace function public.registrar_evento_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pedido_eventos (pedido_id, para, motivo, por)
    values (new.id, new.status, null, coalesce(public.meu_colaborador_id(), new.solicitante_id));
  elsif new.status is distinct from old.status then
    insert into public.pedido_eventos (pedido_id, de, para, motivo, por)
    values (new.id, old.status, new.status, nullif(current_setting('app.motivo_pedido', true), ''), public.meu_colaborador_id());
  end if;
  return new;
end;
$$;
revoke all on function public.registrar_evento_pedido() from public, anon, authenticated;
create or replace trigger trg_pedidos_evento
  after insert or update of status on public.pedidos_compra
  for each row execute function public.registrar_evento_pedido();

-- Itens e cotações só mudam enquanto o pedido está em aberto; no máximo 3 cotações
create or replace function public.proteger_detalhe_pedido()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pedido text := case when tg_op = 'DELETE' then old.pedido_id else new.pedido_id end;
  v_status text;
begin
  if coalesce(current_setting('app.operacao_pedido', true), '') = 'sim' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select status into v_status from public.pedidos_compra where id = v_pedido;
  if v_status is not null and v_status not in ('rascunho', 'aguardando', 'recusado') then
    raise exception 'O pedido não pode mais ser alterado (situação: %)', v_status using errcode = '23514';
  end if;
  if tg_table_name = 'pedido_cotacoes' and tg_op = 'INSERT'
     and (select count(*) from public.pedido_cotacoes where pedido_id = new.pedido_id) >= 3 then
    raise exception 'Cada pedido tem no máximo 3 cotações' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.proteger_detalhe_pedido() from public, anon, authenticated;
create or replace trigger trg_pedido_itens_proteger
  before insert or update or delete on public.pedido_itens
  for each row execute function public.proteger_detalhe_pedido();
create or replace trigger trg_pedido_cotacoes_proteger
  before insert or update or delete on public.pedido_cotacoes
  for each row execute function public.proteger_detalhe_pedido();

-- Conferência: item só muda com o inventário aberto; quem/quando conferiu é do banco
create or replace function public.proteger_item_inventario()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if coalesce(current_setting('app.operacao_inventario', true), '') = 'sim' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select status into v_status from public.inventarios_fisicos
   where id = case when tg_op = 'DELETE' then old.inventario_id else new.inventario_id end;
  if v_status is distinct from 'aberto' then
    raise exception 'Esta conferência já foi encerrada' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'INSERT' or new.situacao is distinct from old.situacao or new.local_encontrado is distinct from old.local_encontrado then
    if new.situacao = 'pendente' then
      new.conferido_por := null;
      new.conferido_em := null;
    else
      new.conferido_por := public.meu_colaborador_id();
      new.conferido_em := now();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_item_inventario() from public, anon, authenticated;
create or replace trigger trg_inventario_itens_proteger
  before insert or update or delete on public.inventario_itens
  for each row execute function public.proteger_item_inventario();

-- Inventário fechado não reabre; cancelar só um aberto
create or replace function public.proteger_inventario()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.operacao_inventario', true), '') = 'sim' then
    return new;
  end if;
  if old.status <> 'aberto' then
    raise exception 'Esta conferência já foi encerrada' using errcode = '23514';
  end if;
  if new.status = 'fechado' then
    raise exception 'Use "Fechar conferência" para encerrar' using errcode = '23514';
  end if;
  if new.status = 'cancelado' then
    new.fechado_por := public.meu_colaborador_id();
    new.fechado_em := now();
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_inventario() from public, anon, authenticated;
create or replace trigger trg_inventarios_proteger
  before update on public.inventarios_fisicos
  for each row execute function public.proteger_inventario();

-- ==============================================================================
-- RLS
-- tabela               | ler | inserir/alterar | excluir
-- orcamentos           | TI  | ti_admin        | ti_admin
-- pedidos_compra       | TI  | TI              | ti_admin (só rascunho/cancelado: gatilho de fatura impede o resto)
-- pedido_itens         | TI  | TI              | TI
-- pedido_cotacoes      | TI  | TI              | TI
-- pedido_eventos       | TI  | ninguém (gatilho)| ninguém
-- inventarios_fisicos  | TI  | TI              | ti_admin
-- inventario_itens     | TI  | TI              | TI
-- RH e gestor: só pelas funções solicitar_compra e pedidos_solicitados (sem valores)
-- ==============================================================================
do $$
declare
  r record;
  v_ti    constant text := 'public.meu_papel() in (''ti_admin'', ''ti_suporte'')';
  v_admin constant text := 'public.meu_papel() = ''ti_admin''';
  v_nada  constant text := 'false';
begin
  for r in
    select * from (values
      ('orcamentos',          'admin', 'admin'),
      ('pedidos_compra',      'ti',    'admin'),
      ('pedido_itens',        'ti',    'ti'),
      ('pedido_cotacoes',     'ti',    'ti'),
      ('pedido_eventos',      'nada',  'nada'),
      ('inventarios_fisicos', 'ti',    'admin'),
      ('inventario_itens',    'ti',    'ti')
    ) as v(tabela, gravar, excluir)
  loop
    execute format('alter table public.%I enable row level security', r.tabela);
    execute format('revoke all on public.%I from anon', r.tabela);
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.tabela);

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tabela and policyname = r.tabela || '_ler') then
      execute format('create policy %I on public.%I for select to authenticated using (%s)', r.tabela || '_ler', r.tabela, v_ti);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tabela and policyname = r.tabela || '_inserir') then
      execute format('create policy %I on public.%I for insert to authenticated with check (%s)', r.tabela || '_inserir', r.tabela,
        case r.gravar when 'ti' then v_ti when 'admin' then v_admin else v_nada end);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tabela and policyname = r.tabela || '_alterar') then
      execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', r.tabela || '_alterar', r.tabela,
        case r.gravar when 'ti' then v_ti when 'admin' then v_admin else v_nada end,
        case r.gravar when 'ti' then v_ti when 'admin' then v_admin else v_nada end);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tabela and policyname = r.tabela || '_excluir') then
      execute format('create policy %I on public.%I for delete to authenticated using (%s)', r.tabela || '_excluir', r.tabela,
        case r.excluir when 'ti' then v_ti when 'admin' then v_admin else v_nada end);
    end if;
  end loop;
end $$;
grant usage on sequence public.pedidos_compra_seq to authenticated;

-- Anexo da cotação: pasta pedidos/ do bucket de documentos (só a T.I. envia)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'documentos_enviar_pedidos') then
    create policy documentos_enviar_pedidos on storage.objects for insert to authenticated
      with check (
        bucket_id = 'documentos'
        and public.meu_papel() in ('ti_admin', 'ti_suporte')
        and (storage.foldername(name))[1] = 'pedidos'
      );
  end if;
end $$;

-- ==============================================================================
-- 8. Funções
-- ==============================================================================

-- Quem pode pedir compra: T.I., RH e quem é gestor de alguém ativo
create or replace function public.pode_pedir_compra()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.meu_papel(), '') in ('ti_admin', 'ti_suporte', 'rh')
      or exists (select 1 from public.colaboradores c
                  where c.gestor_id = public.meu_colaborador_id() and c.status <> 'desligado');
$$;
revoke all on function public.pode_pedir_compra() from public, anon;
grant execute on function public.pode_pedir_compra() to authenticated;

-- RH e gestor pedem compra (sem valores): o pedido já vai para aprovação
create or replace function public.solicitar_compra(p_pedido jsonb, p_itens jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   text := gen_random_uuid()::text;
  v_item jsonb;
  v_n    integer := 0;
begin
  if not public.pode_pedir_compra() then
    raise exception 'Você não pode pedir compras. Fale com o RH ou com a T.I.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_pedido ->> 'titulo', ''))) < 3 then
    raise exception 'Diga o que precisa ser comprado' using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_pedido ->> 'justificativa', ''))) < 5 then
    raise exception 'Explique para que é a compra' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_itens, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Inclua pelo menos um item' using errcode = '23514';
  end if;

  perform set_config('app.operacao_pedido', 'sim', true);
  insert into public.pedidos_compra (id, titulo, justificativa, categoria, area, status, solicitante_id,
                                     colaborador_destino_id, chamado_id, processo_item_id, necessario_em)
  values (v_id, btrim(p_pedido ->> 'titulo'), btrim(p_pedido ->> 'justificativa'),
          coalesce(nullif(p_pedido ->> 'categoria', ''), 'hardware'),
          btrim(coalesce(p_pedido ->> 'area', '')), 'aguardando', public.meu_colaborador_id(),
          nullif(p_pedido ->> 'colaborador_destino_id', ''), nullif(p_pedido ->> 'chamado_id', ''),
          nullif(p_pedido ->> 'processo_item_id', ''), nullif(p_pedido ->> 'necessario_em', '')::date);
  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_n := v_n + 1;
    insert into public.pedido_itens (pedido_id, tipo, descricao, categoria_ativo, especificacao, quantidade, ordem)
    values (v_id, coalesce(nullif(v_item ->> 'tipo', ''), 'equipamento'), btrim(coalesce(v_item ->> 'descricao', '')),
            nullif(v_item ->> 'categoria_ativo', ''), nullif(btrim(coalesce(v_item ->> 'especificacao', '')), ''),
            coalesce(nullif(v_item ->> 'quantidade', '')::integer, 1), v_n);
  end loop;
  perform set_config('app.operacao_pedido', '', true);
  return v_id;
end;
$$;
revoke all on function public.solicitar_compra(jsonb, jsonb) from public, anon;
grant execute on function public.solicitar_compra(jsonb, jsonb) to authenticated;

-- O que RH e gestor veem dos pedidos: situação e itens, sem valores nem fornecedor.
-- RH vê todos; gestor (colaborador) só os que pediu; T.I. lê a tabela.
create or replace function public.pedidos_solicitados()
returns table (
  id text, codigo text, titulo text, justificativa text, categoria text, area text, status text,
  solicitante_id text, colaborador_destino_id text, chamado_id text, processo_item_id text,
  necessario_em date, motivo text, criado_em timestamptz, atualizado_em timestamptz, itens jsonb, eventos jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.codigo, p.titulo, p.justificativa, p.categoria, p.area, p.status,
         p.solicitante_id, p.colaborador_destino_id, p.chamado_id, p.processo_item_id,
         p.necessario_em, p.motivo, p.criado_em, p.atualizado_em,
         coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'tipo', i.tipo, 'descricao', i.descricao,
                                                       'categoria_ativo', i.categoria_ativo, 'especificacao', i.especificacao,
                                                       'quantidade', i.quantidade) order by i.ordem)
                     from public.pedido_itens i where i.pedido_id = p.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('de', e.de, 'para', e.para, 'motivo', e.motivo, 'por', e.por, 'em', e.em) order by e.em)
                     from public.pedido_eventos e where e.pedido_id = p.id), '[]'::jsonb)
    from public.pedidos_compra p
   where public.pode_pedir_compra()
     and (coalesce(public.meu_papel(), '') in ('ti_admin', 'ti_suporte', 'rh')
          or p.solicitante_id = public.meu_colaborador_id())
   order by p.criado_em desc;
$$;
revoke all on function public.pedidos_solicitados() from public, anon;
grant execute on function public.pedidos_solicitados() to authenticated;

-- Enviar, aprovar, recusar, cancelar. Só o administrador aprova ou recusa.
create or replace function public.mudar_status_pedido(p_pedido text, p_acao text, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p     public.pedidos_compra%rowtype;
  v_papel text := coalesce(public.meu_papel(), '');
  v_eu    text := public.meu_colaborador_id();
  v_ti    boolean := v_papel in ('ti_admin', 'ti_suporte');
  v_para  text;
  v_venc  public.pedido_cotacoes%rowtype;
begin
  select * into v_p from public.pedidos_compra where id = p_pedido for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = '23514';
  end if;
  if not v_ti and not (public.pode_pedir_compra() and v_p.solicitante_id = v_eu) then
    raise exception 'Você não pode mexer neste pedido' using errcode = '42501';
  end if;

  if p_acao = 'enviar' then
    if v_p.status not in ('rascunho', 'recusado') then
      raise exception 'Só um rascunho ou um pedido recusado vai para aprovação' using errcode = '23514';
    end if;
    if not exists (select 1 from public.pedido_itens where pedido_id = p_pedido) then
      raise exception 'Inclua pelo menos um item antes de enviar' using errcode = '23514';
    end if;
    v_para := 'aguardando';
  elsif p_acao in ('aprovar', 'recusar') then
    if v_papel <> 'ti_admin' then
      raise exception 'Só o administrador aprova ou recusa pedidos de compra' using errcode = '42501';
    end if;
    if v_p.status <> 'aguardando' then
      raise exception 'O pedido % não está aguardando aprovação', v_p.codigo using errcode = '23514';
    end if;
    if p_acao = 'recusar' then
      if length(btrim(coalesce(p_motivo, ''))) < 5 then
        raise exception 'Explique por que o pedido foi recusado' using errcode = '23514';
      end if;
      v_para := 'recusado';
    else
      if exists (select 1 from public.pedido_cotacoes where pedido_id = p_pedido) then
        select * into v_venc from public.pedido_cotacoes where pedido_id = p_pedido and vencedora;
        if not found then
          raise exception 'Escolha a cotação vencedora antes de aprovar' using errcode = '23514';
        end if;
      end if;
      v_para := 'aprovado';
    end if;
  elsif p_acao = 'cancelar' then
    if v_p.status not in ('rascunho', 'aguardando', 'aprovado', 'recusado') then
      raise exception 'O pedido % não pode mais ser cancelado (situação: %)', v_p.codigo, v_p.status using errcode = '23514';
    end if;
    if not v_ti and v_p.status not in ('rascunho', 'aguardando') then
      raise exception 'Depois de aprovado, só a T.I. cancela o pedido' using errcode = '42501';
    end if;
    if length(btrim(coalesce(p_motivo, ''))) < 5 then
      raise exception 'Explique por que o pedido foi cancelado' using errcode = '23514';
    end if;
    v_para := 'cancelado';
  else
    raise exception 'Ação inválida: %', p_acao using errcode = '23514';
  end if;

  perform set_config('app.operacao_pedido', 'sim', true);
  perform set_config('app.motivo_pedido', coalesce(btrim(p_motivo), ''), true);
  update public.pedidos_compra
     set status = v_para,
         motivo = case when v_para in ('recusado', 'cancelado') then btrim(p_motivo)
                       when v_para = 'aguardando' then null else motivo end,
         aprovado_por = case when v_para = 'aprovado' then v_eu when v_para = 'aguardando' then null else aprovado_por end,
         aprovado_em = case when v_para = 'aprovado' then now() when v_para = 'aguardando' then null else aprovado_em end,
         fornecedor_id = case when v_para = 'aprovado' and v_venc.id is not null then v_venc.fornecedor_id else fornecedor_id end
   where id = p_pedido;
  perform set_config('app.operacao_pedido', '', true);
  perform set_config('app.motivo_pedido', '', true);
end;
$$;
revoke all on function public.mudar_status_pedido(text, text, text) from public, anon;
grant execute on function public.mudar_status_pedido(text, text, text) to authenticated;

-- Comprado: NF, data, valores finais por item → fatura em Contas a pagar (numa transação)
create or replace function public.registrar_compra_pedido(p_pedido text, p_dados jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_p          public.pedidos_compra%rowtype;
  v_item       jsonb;
  v_total      numeric;
  v_data       date := nullif(p_dados ->> 'data_compra', '')::date;
  v_venc       date := nullif(p_dados ->> 'vencimento', '')::date;
  v_fornecedor text;
  v_fatura     text := gen_random_uuid()::text;
begin
  if coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Só a T.I. registra a compra' using errcode = '42501';
  end if;
  select * into v_p from public.pedidos_compra where id = p_pedido for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = '23514';
  end if;
  if v_p.status <> 'aprovado' then
    raise exception 'Só um pedido aprovado pode ser registrado como comprado' using errcode = '23514';
  end if;
  if v_data is null or v_venc is null then
    raise exception 'Informe a data da compra e o vencimento' using errcode = '23514';
  end if;
  v_fornecedor := coalesce(nullif(p_dados ->> 'fornecedor_id', ''), v_p.fornecedor_id);
  if v_fornecedor is null then
    raise exception 'Informe o fornecedor da compra' using errcode = '23514';
  end if;

  perform set_config('app.operacao_pedido', 'sim', true);
  for v_item in select value from jsonb_array_elements(coalesce(p_dados -> 'itens', '[]'::jsonb)) loop
    update public.pedido_itens
       set valor_unitario = nullif(v_item ->> 'valor_unitario', '')::numeric
     where id = v_item ->> 'id' and pedido_id = p_pedido;
  end loop;
  select coalesce(sum(quantidade * coalesce(valor_unitario, 0)), 0) into v_total from public.pedido_itens where pedido_id = p_pedido;
  if v_total <= 0 then
    raise exception 'Informe o valor pago de cada item' using errcode = '23514';
  end if;

  insert into public.faturas (id, pedido_id, competencia, valor, vencimento, status, numero_documento, forma_pagamento, observacoes)
  values (v_fatura, p_pedido, date_trunc('month', v_data)::date, v_total, v_venc, 'a_pagar',
          nullif(btrim(coalesce(p_dados ->> 'numero_nf', '')), ''), nullif(p_dados ->> 'forma_pagamento', ''),
          'Pedido de compra ' || v_p.codigo);

  update public.pedidos_compra
     set status = 'comprado', fornecedor_id = v_fornecedor, data_compra = v_data, vencimento = v_venc,
         numero_nf = nullif(btrim(coalesce(p_dados ->> 'numero_nf', '')), ''),
         forma_pagamento = nullif(p_dados ->> 'forma_pagamento', ''), valor_final = v_total, fatura_id = v_fatura
   where id = p_pedido;
  perform set_config('app.operacao_pedido', '', true);
  return v_fatura;
end;
$$;
revoke all on function public.registrar_compra_pedido(text, jsonb) from public, anon;
grant execute on function public.registrar_compra_pedido(text, jsonb) to authenticated;

-- Recebido: cria os equipamentos (patrimônio sugerido; série a preencher), dá entrada no
-- estoque e aumenta os assentos da licença — tudo ou nada
create or replace function public.receber_pedido(p_pedido text, p_dados jsonb default '{}'::jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_p      public.pedidos_compra%rowtype;
  v_i      public.pedido_itens%rowtype;
  v_ativos jsonb := coalesce(p_dados -> 'ativos', '[]'::jsonb);
  v_a      jsonb;
  v_n      integer;
  v_criados integer := 0;
  v_local  text := coalesce(nullif(btrim(coalesce(p_dados ->> 'localizacao', '')), ''), 'Almoxarifado T.I.');
  v_forn   text;
begin
  if coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Só a T.I. registra o recebimento' using errcode = '42501';
  end if;
  select * into v_p from public.pedidos_compra where id = p_pedido for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = '23514';
  end if;
  if v_p.status <> 'comprado' then
    raise exception 'Só um pedido comprado pode ser recebido' using errcode = '23514';
  end if;
  select nome into v_forn from public.fornecedores where id = v_p.fornecedor_id;

  for v_i in select * from public.pedido_itens where pedido_id = p_pedido order by ordem loop
    if v_i.tipo = 'equipamento' then
      if (select count(*) from jsonb_array_elements(v_ativos) e where e ->> 'item_id' = v_i.id) <> v_i.quantidade then
        raise exception 'Informe o patrimônio de cada unidade de "%" (% unidade(s))', v_i.descricao, v_i.quantidade using errcode = '23514';
      end if;
      v_n := 0;
      for v_a in select value from jsonb_array_elements(v_ativos) where value ->> 'item_id' = v_i.id loop
        v_n := v_n + 1;
        if length(btrim(coalesce(v_a ->> 'tag', ''))) = 0 then
          raise exception 'Informe o patrimônio de "%"', v_i.descricao using errcode = '23514';
        end if;
        insert into public.ativos (id, tag, nome, categoria, marca, modelo, serial_number, status, localizacao_fisica,
                                   fiscal, fornecedor_id, pedido_id, observacoes)
        values ('ast-' || gen_random_uuid()::text, btrim(v_a ->> 'tag'), v_i.descricao,
                coalesce(v_i.categoria_ativo, 'hardware'),
                coalesce(nullif(btrim(coalesce(v_i.marca, '')), ''), 'A definir'),
                coalesce(nullif(btrim(coalesce(v_i.modelo, '')), ''), 'A definir'),
                coalesce(nullif(btrim(coalesce(v_a ->> 'serial_number', '')), ''), 'A-PREENCHER-' || v_p.codigo || '-' || v_i.ordem || '-' || v_n),
                'disponivel', v_local,
                jsonb_build_object('numeroNF', coalesce(v_p.numero_nf, ''), 'chaveAcesso44', '',
                                   'valorCompra', coalesce(v_i.valor_unitario, 0), 'fornecedor', coalesce(v_forn, ''),
                                   'dataAquisicao', coalesce(v_p.data_compra::text, ''), 'dataGarantia', ''),
                v_p.fornecedor_id, p_pedido,
                case when v_i.especificacao is not null then 'Especificação do pedido: ' || v_i.especificacao end);
        v_criados := v_criados + 1;
      end loop;
    elsif v_i.tipo = 'acessorio' and v_i.estoque_item_id is not null then
      insert into public.estoque_movimentos (item_id, tipo, quantidade, motivo, criado_por)
      values (v_i.estoque_item_id, 'entrada', v_i.quantidade, 'Recebido do pedido ' || v_p.codigo, public.meu_colaborador_id());
      if v_i.valor_unitario is not null then
        update public.estoque_itens set valor_unitario = v_i.valor_unitario where id = v_i.estoque_item_id;
      end if;
    elsif v_i.tipo = 'licenca' and v_i.licenca_id is not null then
      update public.licencas_software set assentos_totais = assentos_totais + v_i.quantidade where id = v_i.licenca_id;
    end if;
  end loop;

  perform set_config('app.operacao_pedido', 'sim', true);
  update public.pedidos_compra
     set status = 'recebido', recebido_por = public.meu_colaborador_id(), recebido_em = now()
   where id = p_pedido;
  perform set_config('app.operacao_pedido', '', true);
  return v_criados;
end;
$$;
revoke all on function public.receber_pedido(text, jsonb) from public, anon;
grant execute on function public.receber_pedido(text, jsonb) to authenticated;

-- Abre a conferência de um local (vazio = todos os equipamentos sem baixa)
create or replace function public.abrir_inventario(p_titulo text, p_local text default '', p_unidade text default null)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_id    text := gen_random_uuid()::text;
  v_local text := btrim(coalesce(p_local, ''));
begin
  if coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Só a T.I. abre uma conferência de inventário' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_titulo, ''))) < 3 then
    raise exception 'Dê um nome à conferência' using errcode = '23514';
  end if;
  if exists (select 1 from public.inventarios_fisicos where status = 'aberto' and lower(local) = lower(v_local)) then
    raise exception 'Já existe uma conferência aberta para este local' using errcode = '23514';
  end if;
  insert into public.inventarios_fisicos (id, titulo, local, unidade_id) values (v_id, btrim(p_titulo), v_local, nullif(p_unidade, ''));
  insert into public.inventario_itens (inventario_id, ativo_id, local_esperado)
  select v_id, a.id, a.localizacao_fisica
    from public.ativos a
   where a.status <> 'descartado'
     and (v_local = '' or lower(btrim(a.localizacao_fisica)) = lower(v_local));
  return v_id;
end;
$$;
revoke all on function public.abrir_inventario(text, text, text) from public, anon;
grant execute on function public.abrir_inventario(text, text, text) to authenticated;

-- Fecha: pendentes viram "não encontrado"; gera lembretes (investigar/baixa e atualizar local)
-- e, se pedido, já atualiza o local dos encontrados em outro lugar
create or replace function public.fechar_inventario(p_id text, p_atualizar_locais boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_inv    public.inventarios_fisicos%rowtype;
  v_r      record;
  v_resumo jsonb;
begin
  if coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Só a T.I. fecha uma conferência de inventário' using errcode = '42501';
  end if;
  select * into v_inv from public.inventarios_fisicos where id = p_id for update;
  if not found then
    raise exception 'Conferência não encontrada' using errcode = '23514';
  end if;
  if v_inv.status <> 'aberto' then
    raise exception 'Esta conferência já foi encerrada' using errcode = '23514';
  end if;

  perform set_config('app.operacao_inventario', 'sim', true);
  update public.inventario_itens set situacao = 'nao_encontrado', conferido_por = public.meu_colaborador_id(), conferido_em = now()
   where inventario_id = p_id and situacao = 'pendente';

  for v_r in
    select i.situacao, i.local_encontrado, a.id as ativo_id, a.tag, a.nome
      from public.inventario_itens i join public.ativos a on a.id = i.ativo_id
     where i.inventario_id = p_id and i.situacao in ('nao_encontrado', 'outro_local')
  loop
    if v_r.situacao = 'nao_encontrado' then
      insert into public.lembretes (titulo, descricao, vence_em, ativo_id)
      values ('Inventário: ' || v_r.tag || ' não encontrado',
              'Não encontrado na conferência "' || v_inv.titulo || '". Investigar e, se for o caso, registrar a baixa (perda/roubo).',
              current_date + 7, v_r.ativo_id);
    elsif p_atualizar_locais then
      update public.ativos set localizacao_fisica = btrim(v_r.local_encontrado) where id = v_r.ativo_id;
    else
      insert into public.lembretes (titulo, descricao, vence_em, ativo_id)
      values ('Inventário: atualizar o local de ' || v_r.tag,
              'Encontrado em "' || btrim(v_r.local_encontrado) || '" na conferência "' || v_inv.titulo || '".',
              current_date + 7, v_r.ativo_id);
    end if;
  end loop;

  select jsonb_build_object(
           'total', count(*),
           'encontrados', count(*) filter (where situacao = 'encontrado'),
           'nao_encontrados', count(*) filter (where situacao = 'nao_encontrado'),
           'outro_local', count(*) filter (where situacao = 'outro_local'),
           'via_qr', count(*) filter (where via_qr),
           'locais_atualizados', p_atualizar_locais)
    into v_resumo
    from public.inventario_itens where inventario_id = p_id;

  update public.inventarios_fisicos
     set status = 'fechado', resumo = v_resumo, fechado_por = public.meu_colaborador_id(), fechado_em = now()
   where id = p_id;
  perform set_config('app.operacao_inventario', '', true);
  return v_resumo;
end;
$$;
revoke all on function public.fechar_inventario(text, boolean) from public, anon;
grant execute on function public.fechar_inventario(text, boolean) to authenticated;

-- 9. limpar_base: tabelas novas antes das antigas -----------------------------------------------
create or replace function public.limpar_base(p_confirmacao text, p_manter_email text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eu text := public.meu_colaborador_id();
  v_n  int;
begin
  if coalesce(public.meu_papel(), '') <> 'ti_admin' then
    raise exception 'Apenas o administrador da T.I. limpa a base.' using errcode = '42501';
  end if;
  if p_confirmacao is distinct from 'APAGAR TUDO' then
    raise exception 'Confirmação inválida.' using errcode = '23514';
  end if;
  select count(*) into v_n from public.ativo_baixas;
  if v_n > 0 then
    raise exception 'A base tem % baixa(s) patrimonial(is) registrada(s). Elas fazem parte do histórico e não podem ser apagadas; nada foi apagado', v_n
      using errcode = '23514';
  end if;

  -- Fase 11: conferências, pedidos (a fatura do pedido sai antes) e orçamento
  perform set_config('app.operacao_inventario', 'sim', true);
  perform set_config('app.operacao_pedido', 'sim', true);
  delete from public.inventario_itens where true;
  delete from public.inventarios_fisicos where true;
  delete from public.faturas where pedido_id is not null;
  update public.ativos set pedido_id = null where pedido_id is not null;
  delete from public.pedido_cotacoes where true;
  delete from public.pedido_itens where true;
  delete from public.pedido_eventos where true;
  delete from public.pedidos_compra where true;
  delete from public.orcamentos where true;
  perform set_config('app.operacao_inventario', '', true);
  perform set_config('app.operacao_pedido', '', true);

  -- Seção 6/9: estoque, linhas e anexos de contrato (histórico antes do cadastro)
  delete from public.estoque_movimentos where true;
  delete from public.estoque_itens where true;
  delete from public.linha_atribuicoes where true;
  update public.chamados set linha_id = null where linha_id is not null;
  delete from public.lembretes where true;
  delete from public.linhas_telefonicas where true;
  delete from public.contrato_anexos where true;

  delete from public.ativo_anexos where true;
  delete from public.manutencoes where true;
  delete from public.faturas where true;
  delete from public.contrato_itens where true;
  delete from public.contratos where true;
  delete from public.processo_itens where true;    -- a auditoria grava eventos ao excluir
  delete from public.processo_eventos where true;
  delete from public.colaborador_recursos where true;
  delete from public.chamado_eventos where true;
  delete from public.chamado_mensagens where true;
  delete from public.termos_responsabilidade where true;
  delete from public.chamados where true;
  delete from public.historico_custodia where true;
  delete from public.licenca_atribuicoes where true;
  delete from public.ativos where true;
  delete from public.licencas_software where true;
  delete from public.fornecedores where true;

  update public.colaboradores set gestor_id = null
   where gestor_id is not null
     and (id = v_eu or lower(email) = lower(coalesce(p_manter_email, '')));
  delete from public.colaboradores
   where id is distinct from v_eu
     and lower(email) is distinct from lower(coalesce(p_manter_email, ''));
end;
$$;
