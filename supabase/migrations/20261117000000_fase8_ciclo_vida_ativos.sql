-- ==============================================================================
-- FASE 8 · CICLO DE VIDA DOS ATIVOS
-- ------------------------------------------------------------------------------
-- Reexecutável e sem DROP (o conector do Supabase recusa DROP).
--
-- 1. fornecedores            cadastro simples (só TI)
-- 2. ativos / licenças       observacoes (ativo) e fornecedor_id (ativo e licença)
-- 3. contratos + itens       o que cada contrato cobre: um ativo OU uma licença por linha
-- 4. faturas                 de licença OU de contrato, por competência (mês)
-- 5. manutencoes             com fornecedor, contrato, custo e status
-- 6. ativo_baixas            baixa patrimonial com motivo, destino e estorno
-- 7. ativo_anexos            NF, orçamento, OS, laudo, foto, evidência (arquivo no Storage)
-- 8. lembretes               + ativo_id e contrato_id
-- 9. triggers                autoria carimbada pelo banco; proteção do ativo baixado;
--                            ativo em manutenção não perde o status ao mudar de mãos
-- 10. RLS e Storage          só TI lê e grava; baixa só ti_admin; pastas ativos/, contratos/, faturas/
-- 11. RPCs                   abrir_manutencao, encerrar_manutencao, baixar_ativo, estornar_baixa
-- ==============================================================================

-- 1. Fornecedores ------------------------------------------------------------------------------
create table if not exists public.fornecedores (
  id          text primary key default gen_random_uuid()::text,
  nome        text not null check (btrim(nome) <> ''),
  cnpj        text,
  contato     text,
  telefone    text,
  email       text,
  site        text,
  observacoes text,
  ativo       boolean not null default true,
  criado_por  text references public.colaboradores (id) on delete set null,
  criado_em   timestamptz not null default now()
);
create unique index if not exists uq_fornecedores_nome on public.fornecedores (lower(btrim(nome)));

-- 2. Ativos e licenças -------------------------------------------------------------------------
alter table public.ativos
  add column if not exists observacoes   text,
  add column if not exists fornecedor_id text references public.fornecedores (id) on delete restrict;
alter table public.licencas_software
  add column if not exists fornecedor_id text references public.fornecedores (id) on delete restrict;
create index if not exists idx_ativos_fornecedor on public.ativos (fornecedor_id);
create index if not exists idx_licencas_fornecedor on public.licencas_software (fornecedor_id);

-- 3. Contratos ---------------------------------------------------------------------------------
create table if not exists public.contratos (
  id              text primary key default gen_random_uuid()::text,
  fornecedor_id   text not null references public.fornecedores (id) on delete restrict,
  tipo            text not null check (tipo in ('suporte', 'garantia_estendida', 'manutencao', 'locacao', 'licenciamento', 'outro')),
  numero          text,
  descricao       text not null check (btrim(descricao) <> ''),
  inicio          date not null,
  fim             date,
  valor           numeric(12,2) not null default 0 check (valor >= 0),
  periodicidade   text not null default 'mensal' check (periodicidade in ('mensal', 'anual', 'unico')),
  sla             text,
  contato_suporte text,
  arquivo_caminho text,
  observacoes     text,
  criado_por      text references public.colaboradores (id) on delete set null,
  criado_em       timestamptz not null default now(),
  constraint chk_contrato_periodo check (fim is null or fim >= inicio)
);
create index if not exists idx_contratos_fornecedor on public.contratos (fornecedor_id);
create index if not exists idx_contratos_fim on public.contratos (fim);

create table if not exists public.contrato_itens (
  id          text primary key default gen_random_uuid()::text,
  contrato_id text not null references public.contratos (id) on delete cascade,
  ativo_id    text references public.ativos (id) on delete restrict,
  licenca_id  text references public.licencas_software (id) on delete restrict,
  constraint chk_contrato_item_alvo check (num_nonnulls(ativo_id, licenca_id) = 1)
);
create unique index if not exists uq_contrato_item_ativo on public.contrato_itens (contrato_id, ativo_id) where ativo_id is not null;
create unique index if not exists uq_contrato_item_licenca on public.contrato_itens (contrato_id, licenca_id) where licenca_id is not null;
create index if not exists idx_contrato_itens_ativo on public.contrato_itens (ativo_id);
create index if not exists idx_contrato_itens_licenca on public.contrato_itens (licenca_id);

-- 4. Faturas -----------------------------------------------------------------------------------
create table if not exists public.faturas (
  id               text primary key default gen_random_uuid()::text,
  licenca_id       text references public.licencas_software (id) on delete restrict,
  contrato_id      text references public.contratos (id) on delete restrict,
  competencia      date not null,
  valor            numeric(12,2) not null check (valor >= 0),
  vencimento       date not null,
  pago_em          date,
  status           text not null default 'a_pagar' check (status in ('a_pagar', 'paga', 'cancelada')),
  numero_documento text,
  arquivo_caminho  text,
  observacoes      text,
  criado_por       text references public.colaboradores (id) on delete set null,
  criado_em        timestamptz not null default now(),
  constraint chk_fatura_alvo check (num_nonnulls(licenca_id, contrato_id) = 1),
  constraint chk_fatura_paga check (status <> 'paga' or pago_em is not null),
  constraint chk_fatura_competencia check (competencia = date_trunc('month', competencia)::date)
);
create unique index if not exists uq_fatura_licenca_comp on public.faturas (licenca_id, competencia)
  where licenca_id is not null and status <> 'cancelada';
create unique index if not exists uq_fatura_contrato_comp on public.faturas (contrato_id, competencia)
  where contrato_id is not null and status <> 'cancelada';
create index if not exists idx_faturas_status_venc on public.faturas (status, vencimento);

-- 5. Manutenções -------------------------------------------------------------------------------
create table if not exists public.manutencoes (
  id               text primary key default gen_random_uuid()::text,
  ativo_id         text not null references public.ativos (id) on delete restrict,
  tipo             text not null check (tipo in ('corretiva', 'preventiva', 'upgrade', 'garantia')),
  descricao        text not null check (btrim(descricao) <> ''),
  numero_os        text,
  fornecedor_id    text references public.fornecedores (id) on delete restrict,
  contrato_id      text references public.contratos (id) on delete restrict,
  chamado_id       text references public.chamados (id) on delete set null,
  aberta_em        date not null default current_date,
  previsao         date,
  concluida_em     date,
  custo            numeric(12,2) not null default 0 check (custo >= 0),
  coberto_garantia boolean not null default false,
  status           text not null default 'em_andamento' check (status in ('em_andamento', 'concluida', 'cancelada')),
  observacoes      text,
  criado_por       text references public.colaboradores (id) on delete set null,
  criado_em        timestamptz not null default now(),
  encerrado_por    text references public.colaboradores (id) on delete set null,
  encerrado_em     timestamptz,
  constraint chk_manutencao_conclusao check (status <> 'concluida' or concluida_em is not null)
);
create unique index if not exists uq_manutencao_aberta on public.manutencoes (ativo_id) where status = 'em_andamento';
create index if not exists idx_manutencoes_ativo on public.manutencoes (ativo_id, aberta_em);
create index if not exists idx_manutencoes_fornecedor on public.manutencoes (fornecedor_id);
create index if not exists idx_manutencoes_contrato on public.manutencoes (contrato_id);
create index if not exists idx_manutencoes_chamado on public.manutencoes (chamado_id);

-- 6. Baixa patrimonial -------------------------------------------------------------------------
create table if not exists public.ativo_baixas (
  id             text primary key default gen_random_uuid()::text,
  ativo_id       text not null references public.ativos (id) on delete restrict,
  data_baixa     date not null default current_date,
  motivo         text not null check (motivo in ('obsoleto', 'defeito', 'perda', 'roubo_furto', 'sinistro', 'devolucao_locadora', 'outro')),
  destino        text not null check (destino in ('doacao', 'venda', 'descarte', 'reciclagem', 'devolucao_locadora', 'nao_se_aplica')),
  destinatario   text,
  valor_venda    numeric(12,2) check (valor_venda >= 0),
  documento      text,
  observacoes    text,
  criado_por     text references public.colaboradores (id) on delete set null,
  criado_em      timestamptz not null default now(),
  estornada_em   timestamptz,
  estornada_por  text references public.colaboradores (id) on delete set null,
  motivo_estorno text,
  constraint chk_baixa_venda check (destino = 'venda' or valor_venda is null)
);
create unique index if not exists uq_baixa_vigente on public.ativo_baixas (ativo_id) where estornada_em is null;
create index if not exists idx_baixas_ativo on public.ativo_baixas (ativo_id);

-- 7. Anexos do ativo ---------------------------------------------------------------------------
create table if not exists public.ativo_anexos (
  id            text primary key default gen_random_uuid()::text,
  ativo_id      text not null references public.ativos (id) on delete restrict,
  manutencao_id text references public.manutencoes (id) on delete restrict,
  baixa_id      text references public.ativo_baixas (id) on delete restrict,
  categoria     text not null check (categoria in ('nota_fiscal', 'orcamento', 'os', 'laudo', 'foto', 'evidencia_baixa', 'outro')),
  nome          text not null,
  caminho       text not null unique,
  tipo          text,
  tamanho       bigint,
  criado_por    text references public.colaboradores (id) on delete set null,
  criado_em     timestamptz not null default now()
);
create index if not exists idx_anexos_ativo on public.ativo_anexos (ativo_id);
create index if not exists idx_anexos_manutencao on public.ativo_anexos (manutencao_id);
create index if not exists idx_anexos_baixa on public.ativo_anexos (baixa_id);

-- 8. Lembretes ligados a ativo ou contrato -----------------------------------------------------
alter table public.lembretes
  add column if not exists ativo_id    text references public.ativos (id) on delete set null,
  add column if not exists contrato_id text references public.contratos (id) on delete set null;
create index if not exists idx_lembretes_ativo on public.lembretes (ativo_id);
create index if not exists idx_lembretes_contrato on public.lembretes (contrato_id);

-- ==============================================================================
-- 9. Triggers
-- ==============================================================================

-- Quem/quando criou é definido pelo banco e não muda depois
create or replace function public.carimbar_criacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(public.meu_colaborador_id(), new.criado_por);
    new.criado_em := now();
  else
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
  end if;
  return new;
end;
$$;
revoke all on function public.carimbar_criacao() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['fornecedores', 'contratos', 'faturas', 'manutencoes', 'ativo_baixas', 'ativo_anexos'] loop
    execute format(
      'create or replace trigger %I before insert or update on public.%I for each row execute function public.carimbar_criacao()',
      'trg_' || t || '_carimbar', t);
  end loop;
end $$;

-- Ativo baixado: só entra e sai desse estado pelas funções de baixa e estorno
create or replace function public.proteger_ativo_baixado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.operacao_baixa', true), '') = 'sim' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status = 'descartado' then
      raise exception 'Cadastre o ativo e use "Dar baixa" para baixá-lo' using errcode = '23514';
    end if;
  elsif old.status = 'descartado' then
    raise exception 'O ativo % está baixado. Para alterá-lo, estorne a baixa', old.tag using errcode = '23514';
  elsif new.status = 'descartado' then
    raise exception 'Use "Dar baixa" para baixar o ativo %', old.tag using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_ativo_baixado() from public, anon, authenticated;

create or replace trigger trg_ativos_proteger_baixa
  before insert or update on public.ativos
  for each row execute function public.proteger_ativo_baixado();

-- Ativo com manutenção em andamento continua "em manutenção" quando muda de mãos (devolução no
-- desligamento das Fases 3/6, transferência de custódia). Só encerrar_manutencao o tira desse
-- estado (flag app.operacao_manutencao). security definer: a devolução pode ser feita por quem
-- não lê manutenções (RLS), e mesmo assim o status precisa ser mantido.
-- Ordem: dispara antes de trg_ativos_proteger_baixa (gatilhos BEFORE seguem a ordem alfabética
-- do nome). Não há conflito: este só troca disponível/em uso por manutenção; aquele só trata o
-- estado "descartado", que nenhum dos dois produz aqui.
create or replace function public.manter_status_manutencao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.operacao_manutencao', true), '') <> 'sim'
     and exists (select 1 from public.manutencoes where ativo_id = old.id and status = 'em_andamento') then
    new.status := 'manutencao';
  end if;
  return new;
end;
$$;
revoke all on function public.manter_status_manutencao() from public, anon, authenticated;

create or replace trigger trg_ativos_manter_manutencao
  before update on public.ativos
  for each row
  when (old.status = 'manutencao' and new.status in ('disponivel', 'em_uso'))
  execute function public.manter_status_manutencao();

-- Registro de baixa não é apagado; só o estorno altera
create or replace function public.proteger_registro_baixa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'O registro de baixa faz parte do histórico e não pode ser apagado' using errcode = '23514';
  end if;
  if coalesce(current_setting('app.operacao_baixa', true), '') <> 'sim' then
    raise exception 'A baixa só pode ser alterada pelo estorno' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_registro_baixa() from public, anon, authenticated;

create or replace trigger trg_baixas_proteger
  before update or delete on public.ativo_baixas
  for each row execute function public.proteger_registro_baixa();

-- ==============================================================================
-- 10. RLS e Storage
-- ==============================================================================
-- tabela          | ler | inserir/alterar | excluir
-- fornecedores    | TI  | TI              | ti_admin
-- contratos       | TI  | TI              | ti_admin
-- contrato_itens  | TI  | TI              | TI
-- faturas         | TI  | TI              | ti_admin
-- manutencoes     | TI  | TI              | ti_admin
-- ativo_baixas    | TI  | ti_admin        | ninguém (trigger)
-- ativo_anexos    | TI  | TI              | TI
do $$
declare
  r record;
  v_ti    constant text := 'public.meu_papel() in (''ti_admin'', ''ti_suporte'')';
  v_admin constant text := 'public.meu_papel() = ''ti_admin''';
begin
  for r in
    select * from (values
      ('fornecedores',   'ti', 'admin'),
      ('contratos',      'ti', 'admin'),
      ('contrato_itens', 'ti', 'ti'),
      ('faturas',        'ti', 'admin'),
      ('manutencoes',    'ti', 'admin'),
      ('ativo_baixas',   'admin', 'admin'),
      ('ativo_anexos',   'ti', 'ti')
    ) as v(tabela, gravar, excluir)
  loop
    execute format('alter table public.%I enable row level security', r.tabela);
    execute format('revoke all on public.%I from anon', r.tabela);
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.tabela);

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tabela and policyname = r.tabela || '_ler') then
      execute format('create policy %I on public.%I for select to authenticated using (%s)', r.tabela || '_ler', r.tabela, v_ti);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tabela and policyname = r.tabela || '_inserir') then
      execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
        r.tabela || '_inserir', r.tabela, case r.gravar when 'ti' then v_ti else v_admin end);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tabela and policyname = r.tabela || '_alterar') then
      execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
        r.tabela || '_alterar', r.tabela,
        case r.gravar when 'ti' then v_ti else v_admin end, case r.gravar when 'ti' then v_ti else v_admin end);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tabela and policyname = r.tabela || '_excluir') then
      execute format('create policy %I on public.%I for delete to authenticated using (%s)',
        r.tabela || '_excluir', r.tabela, case r.excluir when 'ti' then v_ti else v_admin end);
    end if;
  end loop;
end $$;

-- Arquivos: a TI envia para as pastas do patrimônio (leitura e exclusão já são da TI pela Fase 3)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'documentos_enviar_patrimonio') then
    create policy documentos_enviar_patrimonio on storage.objects for insert to authenticated
      with check (
        bucket_id = 'documentos'
        and public.meu_papel() in ('ti_admin', 'ti_suporte')
        and (storage.foldername(name))[1] in ('ativos', 'contratos', 'faturas')
      );
  end if;
end $$;

-- ==============================================================================
-- 11. RPCs (rodam com a permissão de quem chama: a RLS continua valendo)
-- ==============================================================================

-- Envia o ativo para manutenção: grava a manutenção e muda o status, numa transação
create or replace function public.abrir_manutencao(p_ativo text, p_dados jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_ativo public.ativos%rowtype;
  v_id    text;
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Apenas a T.I. registra manutenções' using errcode = '42501';
  end if;
  if coalesce(btrim(p_dados ->> 'descricao'), '') = '' then
    raise exception 'Descreva o problema ou o serviço' using errcode = '23514';
  end if;

  select * into v_ativo from public.ativos where id = p_ativo for update;
  if not found then
    raise exception 'Ativo não encontrado' using errcode = '23514';
  end if;
  if v_ativo.status = 'descartado' then
    raise exception 'O ativo % está baixado', v_ativo.tag using errcode = '23514';
  end if;
  -- Status "manutencao" sem registro (ex.: devolvido com avaria no desligamento) pode ganhar o registro
  if exists (select 1 from public.manutencoes where ativo_id = p_ativo and status = 'em_andamento') then
    raise exception 'O ativo % já está em manutenção', v_ativo.tag using errcode = '23514';
  end if;

  insert into public.manutencoes (ativo_id, tipo, descricao, numero_os, fornecedor_id, contrato_id, chamado_id,
                                  aberta_em, previsao, custo, coberto_garantia, observacoes)
  values (p_ativo,
          coalesce(nullif(p_dados ->> 'tipo', ''), 'corretiva'),
          btrim(p_dados ->> 'descricao'),
          nullif(btrim(coalesce(p_dados ->> 'numero_os', '')), ''),
          nullif(p_dados ->> 'fornecedor_id', ''),
          nullif(p_dados ->> 'contrato_id', ''),
          nullif(p_dados ->> 'chamado_id', ''),
          coalesce(nullif(p_dados ->> 'aberta_em', '')::date, current_date),
          nullif(p_dados ->> 'previsao', '')::date,
          coalesce(nullif(p_dados ->> 'custo', '')::numeric, 0),
          coalesce((p_dados ->> 'coberto_garantia')::boolean, false),
          nullif(btrim(coalesce(p_dados ->> 'observacoes', '')), ''))
  returning id into v_id;

  update public.ativos set status = 'manutencao' where id = p_ativo;
  return v_id;
end;
$$;

-- Conclui ou cancela: o ativo volta para "em uso" (se está com alguém) ou "disponível"
create or replace function public.encerrar_manutencao(p_manutencao text, p_status text, p_dados jsonb default '{}'::jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_m public.manutencoes%rowtype;
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Apenas a T.I. registra manutenções' using errcode = '42501';
  end if;
  if p_status not in ('concluida', 'cancelada') then
    raise exception 'Situação inválida: %', p_status using errcode = '23514';
  end if;

  select * into v_m from public.manutencoes where id = p_manutencao for update;
  if not found then
    raise exception 'Manutenção não encontrada' using errcode = '23514';
  end if;
  if v_m.status <> 'em_andamento' then
    raise exception 'Esta manutenção já foi encerrada' using errcode = '23514';
  end if;

  update public.manutencoes
  set status        = p_status,
      concluida_em  = case when p_status = 'concluida'
                           then coalesce(nullif(p_dados ->> 'concluida_em', '')::date, current_date) end,
      custo         = coalesce(nullif(p_dados ->> 'custo', '')::numeric, custo),
      observacoes   = coalesce(nullif(btrim(coalesce(p_dados ->> 'observacoes', '')), ''), observacoes),
      encerrado_por = public.meu_colaborador_id(),
      encerrado_em  = now()
  where id = p_manutencao;

  -- Única saída de "em manutenção" quando há manutenção aberta (ver manter_status_manutencao)
  perform set_config('app.operacao_manutencao', 'sim', true);
  update public.ativos
  set status = case when custodiante_id is not null then 'em_uso' else 'disponivel' end
  where id = v_m.ativo_id and status = 'manutencao';
  perform set_config('app.operacao_manutencao', '', true);
end;
$$;

-- Baixa patrimonial (só ti_admin). Perda, roubo/furto e sinistro encerram a custódia aberta.
create or replace function public.baixar_ativo(p_ativo text, p_dados jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_ativo   public.ativos%rowtype;
  v_motivo  text := nullif(p_dados ->> 'motivo', '');
  v_destino text := nullif(p_dados ->> 'destino', '');
  v_data    date := coalesce(nullif(p_dados ->> 'data_baixa', '')::date, current_date);
  v_id      text;
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') <> 'ti_admin' then
    raise exception 'Apenas o administrador de T.I. dá baixa em ativos' using errcode = '42501';
  end if;
  if v_motivo is null or v_destino is null then
    raise exception 'Informe o motivo e o destino da baixa' using errcode = '23514';
  end if;

  select * into v_ativo from public.ativos where id = p_ativo for update;
  if not found then
    raise exception 'Ativo não encontrado' using errcode = '23514';
  end if;
  if v_ativo.status = 'descartado' then
    raise exception 'O ativo % já está baixado', v_ativo.tag using errcode = '23514';
  end if;
  if exists (select 1 from public.manutencoes where ativo_id = p_ativo and status = 'em_andamento') then
    raise exception 'Conclua ou cancele a manutenção em andamento do ativo % antes da baixa', v_ativo.tag using errcode = '23514';
  end if;
  if v_ativo.custodiante_id is not null then
    if v_motivo not in ('perda', 'roubo_furto', 'sinistro') then
      raise exception 'O ativo % está com um colaborador. Registre a devolução antes da baixa', v_ativo.tag using errcode = '23514';
    end if;
    update public.historico_custodia
    set data_devolucao = v_data,
        motivo_devolucao = 'Baixa patrimonial: ' || case v_motivo when 'perda' then 'perda'
                                                                  when 'roubo_furto' then 'roubo ou furto'
                                                                  else 'sinistro' end
    where ativo_id = p_ativo and data_devolucao is null;
  end if;

  insert into public.ativo_baixas (ativo_id, data_baixa, motivo, destino, destinatario, valor_venda, documento, observacoes)
  values (p_ativo, v_data, v_motivo, v_destino,
          nullif(btrim(coalesce(p_dados ->> 'destinatario', '')), ''),
          nullif(p_dados ->> 'valor_venda', '')::numeric,
          nullif(btrim(coalesce(p_dados ->> 'documento', '')), ''),
          nullif(btrim(coalesce(p_dados ->> 'observacoes', '')), ''))
  returning id into v_id;

  perform set_config('app.operacao_baixa', 'sim', true);
  update public.ativos
  set status = 'descartado', custodiante_id = null, data_entrega_atual = null
  where id = p_ativo;
  perform set_config('app.operacao_baixa', '', true);
  return v_id;
end;
$$;

-- Estorno de baixa feita por engano (só ti_admin): o ativo volta ao estoque; o registro fica
create or replace function public.estornar_baixa(p_baixa text, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_b public.ativo_baixas%rowtype;
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') <> 'ti_admin' then
    raise exception 'Apenas o administrador de T.I. estorna baixas' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do estorno' using errcode = '23514';
  end if;

  select * into v_b from public.ativo_baixas where id = p_baixa for update;
  if not found then
    raise exception 'Baixa não encontrada' using errcode = '23514';
  end if;
  if v_b.estornada_em is not null then
    raise exception 'Esta baixa já foi estornada' using errcode = '23514';
  end if;

  perform set_config('app.operacao_baixa', 'sim', true);
  update public.ativo_baixas
  set estornada_em = now(), estornada_por = public.meu_colaborador_id(), motivo_estorno = btrim(p_motivo)
  where id = p_baixa;
  update public.ativos set status = 'disponivel' where id = v_b.ativo_id;
  perform set_config('app.operacao_baixa', '', true);
end;
$$;

revoke all on function public.abrir_manutencao(text, jsonb) from public, anon;
revoke all on function public.encerrar_manutencao(text, text, jsonb) from public, anon;
revoke all on function public.baixar_ativo(text, jsonb) from public, anon;
revoke all on function public.estornar_baixa(text, text) from public, anon;
grant execute on function public.abrir_manutencao(text, jsonb) to authenticated;
grant execute on function public.encerrar_manutencao(text, text, jsonb) to authenticated;
grant execute on function public.baixar_ativo(text, jsonb) to authenticated;
grant execute on function public.estornar_baixa(text, text) to authenticated;

-- Contrato + itens cobertos numa transação só (cria ou atualiza; itens que saíram são excluídos).
-- Se um item for inválido, nada é gravado: nem o contrato, nem os outros itens.
create or replace function public.salvar_contrato(p_contrato jsonb, p_itens jsonb default '[]'::jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id    text := nullif(p_contrato ->> 'id', '');
  v_itens jsonb := coalesce(p_itens, '[]'::jsonb);
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Apenas a T.I. cadastra contratos' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'Contrato sem identificador' using errcode = '23514';
  end if;

  insert into public.contratos (id, fornecedor_id, tipo, numero, descricao, inicio, fim, valor, periodicidade,
                                sla, contato_suporte, observacoes)
  values (v_id, p_contrato ->> 'fornecedor_id', p_contrato ->> 'tipo', nullif(p_contrato ->> 'numero', ''),
          p_contrato ->> 'descricao', (p_contrato ->> 'inicio')::date, nullif(p_contrato ->> 'fim', '')::date,
          coalesce(nullif(p_contrato ->> 'valor', '')::numeric, 0),
          coalesce(nullif(p_contrato ->> 'periodicidade', ''), 'mensal'),
          nullif(p_contrato ->> 'sla', ''), nullif(p_contrato ->> 'contato_suporte', ''),
          nullif(p_contrato ->> 'observacoes', ''))
  on conflict (id) do update
  set fornecedor_id = excluded.fornecedor_id, tipo = excluded.tipo, numero = excluded.numero,
      descricao = excluded.descricao, inicio = excluded.inicio, fim = excluded.fim, valor = excluded.valor,
      periodicidade = excluded.periodicidade, sla = excluded.sla, contato_suporte = excluded.contato_suporte,
      observacoes = excluded.observacoes;

  delete from public.contrato_itens ci
  where ci.contrato_id = v_id
    and not exists (select 1 from jsonb_array_elements(v_itens) e
                    where nullif(e ->> 'ativo_id', '') is not distinct from ci.ativo_id
                      and nullif(e ->> 'licenca_id', '') is not distinct from ci.licenca_id);

  insert into public.contrato_itens (contrato_id, ativo_id, licenca_id)
  select v_id, nullif(e ->> 'ativo_id', ''), nullif(e ->> 'licenca_id', '')
  from jsonb_array_elements(v_itens) e
  on conflict do nothing;
end;
$$;

revoke all on function public.salvar_contrato(jsonb, jsonb) from public, anon;
grant execute on function public.salvar_contrato(jsonb, jsonb) to authenticated;