-- ==============================================================================
-- INVENTÁRIO, CONTRATOS E FINANCEIRO (NEXUS-DOCUMENTACAO.md, seção 6)
-- ------------------------------------------------------------------------------
-- Reexecutável. Nenhuma tabela ou coluna é apagada. Os únicos "drop" são de REGRAS
-- (check e not null) que são trocadas por regras mais amplas — nenhum dado é perdido.
--
-- 1. licencas_software   forma de cobrança, fabricante, pagamento, moeda, renovação automática,
--                        aviso de cancelamento, área/categoria, responsável; renovação opcional
-- 2. contratos           tipos novos (internet, móvel, fixa, nuvem, domínio), detalhes por tipo,
--                        encerrar/reabrir, renovado_de, reajuste, multa, pagamento, moeda, área
-- 3. unidades            endereços/unidades da empresa (internet, telefonia fixa)
-- 4. contrato_anexos     vários arquivos por contrato (proposta, contrato, aditivo, nota)
-- 5. linhas_telefonicas  linhas de celular/fixo + histórico de quem usou (linha_atribuicoes)
-- 6. faturas             moeda estrangeira; editar só "a pagar"; desfazer pagamento só admin
-- 7. lembretes           + licenca_id e linha_id
-- 8. estoque             acessórios por quantidade + movimentos (entrada, saída, ajuste)
-- 9. processo_itens      + linha_id e tipos entregar_linha / liberar_linha
-- 10. cadastro_eventos   histórico de alterações (quem, quando, antes/depois) por gatilho
-- 11. RPCs               renovar_contrato, encerrar_contrato, reabrir_contrato, desfazer_pagamento
-- 12. RLS                só TI lê e grava; excluir só ti_admin
-- 13. Migração de dados  forma de cobrança derivada; fornecedor texto ligado quando o nome bate
-- ==============================================================================

-- Listas usadas em várias tabelas
-- categoria_despesa: software, ia, telefonia, internet, hardware, nuvem, servicos, outros
-- forma_pagamento:   boleto, cartao, debito, pix, transferencia, outro

-- 1. Licenças ----------------------------------------------------------------------------------
alter table public.licencas_software
  add column if not exists forma_cobranca          text not null default 'propria',
  add column if not exists fabricante              text,
  add column if not exists comprado_direto         boolean not null default false,
  add column if not exists moeda                   text not null default 'BRL',
  add column if not exists valor_moeda             numeric(12,2),
  add column if not exists forma_pagamento         text,
  add column if not exists cartao_final            text,
  add column if not exists pagamento_titular       text,
  add column if not exists renovacao_automatica    boolean not null default true,
  add column if not exists aviso_cancelamento_dias integer,
  add column if not exists centro_custo            text,
  add column if not exists categoria_despesa       text not null default 'software',
  add column if not exists responsavel_id          text references public.colaboradores (id) on delete set null;

alter table public.licencas_software alter column data_renovacao drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_licenca_forma_cobranca') then
    alter table public.licencas_software add constraint chk_licenca_forma_cobranca
      check (forma_cobranca in ('sem_custo', 'propria', 'contrato'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_licenca_moeda') then
    alter table public.licencas_software add constraint chk_licenca_moeda check (moeda in ('BRL', 'USD', 'EUR'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_licenca_pagamento') then
    alter table public.licencas_software add constraint chk_licenca_pagamento
      check (forma_pagamento is null or forma_pagamento in ('boleto', 'cartao', 'debito', 'pix', 'transferencia', 'outro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_licenca_cartao') then
    alter table public.licencas_software add constraint chk_licenca_cartao
      check (cartao_final is null or cartao_final ~ '^[0-9]{4}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_licenca_categoria') then
    alter table public.licencas_software add constraint chk_licenca_categoria
      check (categoria_despesa in ('software', 'ia', 'telefonia', 'internet', 'hardware', 'nuvem', 'servicos', 'outros'));
  end if;
  -- Cobrança própria precisa de renovação; sem custo e pelo contrato não
  if not exists (select 1 from pg_constraint where conname = 'chk_licenca_renovacao') then
    alter table public.licencas_software add constraint chk_licenca_renovacao
      check (forma_cobranca <> 'propria' or data_renovacao is not null) not valid;
  end if;
end $$;

-- 3. Unidades (antes dos contratos, que apontam para ela) ----------------------------------
create table if not exists public.unidades (
  id          text primary key default gen_random_uuid()::text,
  nome        text not null check (btrim(nome) <> ''),
  endereco    text,
  cidade      text,
  uf          text,
  cep         text,
  observacoes text,
  ativo       boolean not null default true,
  criado_por  text references public.colaboradores (id) on delete set null,
  criado_em   timestamptz not null default now()
);
create unique index if not exists uq_unidades_nome on public.unidades (lower(btrim(nome)));

-- 2. Contratos ---------------------------------------------------------------------------------
alter table public.contratos drop constraint if exists contratos_tipo_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_contrato_tipo') then
    alter table public.contratos add constraint chk_contrato_tipo check (tipo in (
      'suporte', 'garantia_estendida', 'manutencao', 'locacao', 'licenciamento',
      'internet', 'telefonia_movel', 'telefonia_fixa', 'nuvem', 'dominio', 'outro'));
  end if;
end $$;

alter table public.contratos
  add column if not exists status                  text not null default 'ativo',
  add column if not exists encerrado_em            date,
  add column if not exists encerrado_por           text references public.colaboradores (id) on delete set null,
  add column if not exists encerramento_motivo     text,
  add column if not exists renovado_de             text references public.contratos (id) on delete set null,
  add column if not exists detalhes                jsonb not null default '{}'::jsonb,
  add column if not exists unidade_id              text references public.unidades (id) on delete set null,
  add column if not exists moeda                   text not null default 'BRL',
  add column if not exists valor_moeda             numeric(12,2),
  add column if not exists forma_pagamento         text,
  add column if not exists cartao_final            text,
  add column if not exists pagamento_titular       text,
  add column if not exists renovacao_automatica    boolean not null default false,
  add column if not exists aviso_cancelamento_dias integer,
  add column if not exists reajuste_indice         text,
  add column if not exists reajuste_mes            integer,
  add column if not exists multa_cancelamento      text,
  add column if not exists responsavel_id          text references public.colaboradores (id) on delete set null,
  add column if not exists centro_custo            text,
  add column if not exists categoria_despesa       text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_contrato_status') then
    alter table public.contratos add constraint chk_contrato_status check (status in ('ativo', 'encerrado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_contrato_moeda') then
    alter table public.contratos add constraint chk_contrato_moeda check (moeda in ('BRL', 'USD', 'EUR'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_contrato_pagamento') then
    alter table public.contratos add constraint chk_contrato_pagamento
      check (forma_pagamento is null or forma_pagamento in ('boleto', 'cartao', 'debito', 'pix', 'transferencia', 'outro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_contrato_cartao') then
    alter table public.contratos add constraint chk_contrato_cartao check (cartao_final is null or cartao_final ~ '^[0-9]{4}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_contrato_reajuste_mes') then
    alter table public.contratos add constraint chk_contrato_reajuste_mes check (reajuste_mes is null or reajuste_mes between 1 and 12);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_contrato_categoria') then
    alter table public.contratos add constraint chk_contrato_categoria check (categoria_despesa is null or categoria_despesa in
      ('software', 'ia', 'telefonia', 'internet', 'hardware', 'nuvem', 'servicos', 'outros'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_contrato_encerrado') then
    alter table public.contratos add constraint chk_contrato_encerrado
      check (status <> 'encerrado' or (encerrado_em is not null and length(btrim(coalesce(encerramento_motivo, ''))) >= 5));
  end if;
end $$;
create index if not exists idx_contratos_renovado_de on public.contratos (renovado_de);

-- Encerrar exige motivo (check acima); reabrir só ti_admin
create or replace function public.proteger_contrato()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'encerrado' and new.status = 'ativo' then
    if auth.uid() is not null and coalesce(public.meu_papel(), '') <> 'ti_admin' then
      raise exception 'Só o administrador reabre um contrato encerrado' using errcode = '42501';
    end if;
    new.encerrado_em := null;
    new.encerrado_por := null;
    new.encerramento_motivo := null;
  elsif old.status = 'ativo' and new.status = 'encerrado' then
    new.encerrado_por := coalesce(public.meu_colaborador_id(), new.encerrado_por);
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_contrato() from public, anon, authenticated;
create or replace trigger trg_proteger_contrato
  before update on public.contratos
  for each row execute function public.proteger_contrato();

-- 4. Anexos do contrato ------------------------------------------------------------------------
create table if not exists public.contrato_anexos (
  id              text primary key default gen_random_uuid()::text,
  contrato_id     text not null references public.contratos (id) on delete cascade,
  tipo            text not null default 'contrato' check (tipo in ('proposta', 'contrato', 'aditivo', 'nota', 'outro')),
  descricao       text,
  arquivo_caminho text not null,
  criado_por      text references public.colaboradores (id) on delete set null,
  criado_em       timestamptz not null default now()
);
create index if not exists idx_contrato_anexos on public.contrato_anexos (contrato_id);

-- Arquivo único antigo vira o primeiro anexo
insert into public.contrato_anexos (contrato_id, tipo, arquivo_caminho)
select c.id, 'contrato', c.arquivo_caminho from public.contratos c
 where c.arquivo_caminho is not null
   and not exists (select 1 from public.contrato_anexos a where a.contrato_id = c.id and a.arquivo_caminho = c.arquivo_caminho);

-- 5. Linhas telefônicas ------------------------------------------------------------------------
create table if not exists public.linhas_telefonicas (
  id                text primary key default gen_random_uuid()::text,
  numero            text not null check (btrim(numero) <> ''),
  tipo              text not null default 'movel' check (tipo in ('movel', 'fixa')),
  contrato_id       text references public.contratos (id) on delete set null,
  plano             text,
  franquia          text,
  chip              text,
  ativo_id          text references public.ativos (id) on delete set null,
  colaborador_id    text references public.colaboradores (id) on delete set null,
  status            text not null default 'ativa' check (status in ('ativa', 'suspensa', 'cancelada')),
  valor_mensal      numeric(12,2),
  centro_custo      text,
  observacoes       text,
  criado_por        text references public.colaboradores (id) on delete set null,
  criado_em         timestamptz not null default now()
);
create unique index if not exists uq_linhas_numero on public.linhas_telefonicas (regexp_replace(numero, '\D', '', 'g'))
  where status <> 'cancelada';
create index if not exists idx_linhas_contrato on public.linhas_telefonicas (contrato_id);
create index if not exists idx_linhas_colab on public.linhas_telefonicas (colaborador_id);

create table if not exists public.linha_atribuicoes (
  id             text primary key default gen_random_uuid()::text,
  linha_id       text not null references public.linhas_telefonicas (id) on delete cascade,
  colaborador_id text not null references public.colaboradores (id) on delete cascade,
  inicio         timestamptz default now(),
  fim            timestamptz,
  atribuido_por  text references public.colaboradores (id) on delete set null,
  removido_por   text references public.colaboradores (id) on delete set null
);
create unique index if not exists uq_linha_atribuicao_aberta on public.linha_atribuicoes (linha_id) where fim is null;
create index if not exists idx_linha_atribuicoes_colab on public.linha_atribuicoes (colaborador_id);

create or replace function public.registrar_atribuicao_linha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eu text := public.meu_colaborador_id();
begin
  if tg_op = 'UPDATE' and new.colaborador_id is not distinct from old.colaborador_id then
    return null;
  end if;
  update public.linha_atribuicoes set fim = now(), removido_por = v_eu
   where linha_id = new.id and fim is null;
  if new.colaborador_id is not null then
    insert into public.linha_atribuicoes (linha_id, colaborador_id, atribuido_por)
    values (new.id, new.colaborador_id, v_eu);
  end if;
  return null;
end;
$$;
revoke all on function public.registrar_atribuicao_linha() from public, anon, authenticated;
create or replace trigger trg_registrar_atribuicao_linha
  after insert or update of colaborador_id on public.linhas_telefonicas
  for each row execute function public.registrar_atribuicao_linha();

-- 6. Faturas -----------------------------------------------------------------------------------
alter table public.faturas
  add column if not exists moeda            text not null default 'BRL',
  add column if not exists valor_moeda      numeric(12,2),
  add column if not exists forma_pagamento  text,
  add column if not exists estorno_motivo   text;

-- Valores da fatura só mudam enquanto "a pagar"; voltar de "paga" só pelo admin (desfazer_pagamento)
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
       or new.contrato_id is distinct from old.contrato_id) then
    raise exception 'Só é possível editar valores de uma fatura "a pagar"' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_fatura() from public, anon, authenticated;
create or replace trigger trg_proteger_fatura
  before update on public.faturas
  for each row execute function public.proteger_fatura();

-- 7. Lembretes ---------------------------------------------------------------------------------
alter table public.lembretes
  add column if not exists licenca_id text references public.licencas_software (id) on delete set null,
  add column if not exists linha_id   text references public.linhas_telefonicas (id) on delete set null;

-- 8. Estoque de acessórios ---------------------------------------------------------------------
create table if not exists public.estoque_itens (
  id             text primary key default gen_random_uuid()::text,
  nome           text not null check (btrim(nome) <> ''),
  tipo           text not null default 'outro' check (tipo in ('monitor', 'mouse', 'teclado', 'cabo', 'headset', 'adaptador', 'carregador', 'webcam', 'outro')),
  marca          text,
  modelo         text,
  quantidade     integer not null default 0 check (quantidade >= 0),
  minimo         integer not null default 0 check (minimo >= 0),
  localizacao    text,
  fornecedor_id  text references public.fornecedores (id) on delete set null,
  valor_unitario numeric(12,2),
  observacoes    text,
  ativo          boolean not null default true,
  criado_por     text references public.colaboradores (id) on delete set null,
  criado_em      timestamptz not null default now()
);
create unique index if not exists uq_estoque_nome on public.estoque_itens (lower(btrim(nome)));

create table if not exists public.estoque_movimentos (
  id             text primary key default gen_random_uuid()::text,
  item_id        text not null references public.estoque_itens (id) on delete cascade,
  tipo           text not null check (tipo in ('entrada', 'saida', 'devolucao', 'ajuste')),
  quantidade     integer not null check (quantidade <> 0),
  colaborador_id text references public.colaboradores (id) on delete set null,
  chamado_id     text references public.chamados (id) on delete set null,
  motivo         text,
  criado_por     text references public.colaboradores (id) on delete set null,
  criado_em      timestamptz not null default now(),
  constraint chk_movimento_sinal check (tipo = 'ajuste' or quantidade > 0),
  constraint chk_movimento_ajuste check (tipo <> 'ajuste' or length(btrim(coalesce(motivo, ''))) >= 5)
);
create index if not exists idx_estoque_mov_item on public.estoque_movimentos (item_id, criado_em);
create index if not exists idx_estoque_mov_colab on public.estoque_movimentos (colaborador_id);

-- O saldo só muda pelos movimentos (saída maior que o saldo é recusada pelo check quantidade >= 0)
create or replace function public.aplicar_movimento_estoque()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.estoque_itens
     set quantidade = quantidade + case new.tipo when 'saida' then -new.quantidade else new.quantidade end
   where id = new.item_id;
  return new;
exception when check_violation then
  raise exception 'Estoque insuficiente para essa saída' using errcode = '23514';
end;
$$;
revoke all on function public.aplicar_movimento_estoque() from public, anon, authenticated;
create or replace trigger trg_aplicar_movimento_estoque
  after insert on public.estoque_movimentos
  for each row execute function public.aplicar_movimento_estoque();
-- Quantidade, tipo e item não mudam depois de lançados (a exclusão de pessoas só limpa referências)
create or replace function public.proteger_movimento_estoque()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.item_id is distinct from old.item_id or new.tipo is distinct from old.tipo
     or new.quantidade is distinct from old.quantidade then
    raise exception 'Movimento de estoque não se altera: lance um ajuste' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_movimento_estoque() from public, anon, authenticated;
create or replace trigger trg_estoque_movimento_imutavel
  before update on public.estoque_movimentos
  for each row execute function public.proteger_movimento_estoque();

-- 9. Checklist: linhas -------------------------------------------------------------------------
alter table public.processo_itens
  add column if not exists linha_id         text references public.linhas_telefonicas (id) on delete set null,
  add column if not exists estoque_item_id  text references public.estoque_itens (id) on delete set null;
alter table public.processo_itens drop constraint if exists processo_itens_tipo_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_processo_item_tipo') then
    alter table public.processo_itens add constraint chk_processo_item_tipo check (tipo in (
      'cadastro', 'conta', 'grupo_email', 'equipamento', 'acessorio', 'licenca', 'termo', 'acesso_nexus',
      'encerrar_recurso', 'devolver_equipamento', 'liberar_licenca', 'dados_drive', 'email', 'tarefa',
      'entregar_linha', 'liberar_linha'));
  end if;
end $$;

-- 10. Histórico de alterações ------------------------------------------------------------------
create table if not exists public.cadastro_eventos (
  id        bigint generated always as identity primary key,
  entidade  text not null,
  registro  text not null,
  acao      text not null check (acao in ('criado', 'alterado', 'excluido')),
  antes     jsonb,
  depois    jsonb,
  por       text,
  em        timestamptz not null default now()
);
create index if not exists idx_cadastro_eventos on public.cadastro_eventos (entidade, registro, em);

create or replace function public.registrar_cadastro_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes  jsonb;
  v_depois jsonb;
  v_chave  text;
begin
  if tg_op = 'INSERT' then
    insert into public.cadastro_eventos (entidade, registro, acao, depois, por)
    values (tg_table_name, new.id, 'criado', to_jsonb(new), public.meu_colaborador_id());
    return null;
  elsif tg_op = 'DELETE' then
    insert into public.cadastro_eventos (entidade, registro, acao, antes, por)
    values (tg_table_name, old.id, 'excluido', to_jsonb(old), public.meu_colaborador_id());
    return null;
  end if;
  -- Só os campos que mudaram
  v_antes := '{}'::jsonb;
  v_depois := '{}'::jsonb;
  for v_chave in select jsonb_object_keys(to_jsonb(new)) loop
    if to_jsonb(new) -> v_chave is distinct from to_jsonb(old) -> v_chave then
      v_antes := v_antes || jsonb_build_object(v_chave, to_jsonb(old) -> v_chave);
      v_depois := v_depois || jsonb_build_object(v_chave, to_jsonb(new) -> v_chave);
    end if;
  end loop;
  if v_depois <> '{}'::jsonb then
    insert into public.cadastro_eventos (entidade, registro, acao, antes, depois, por)
    values (tg_table_name, new.id, 'alterado', v_antes, v_depois, public.meu_colaborador_id());
  end if;
  return null;
end;
$$;
revoke all on function public.registrar_cadastro_evento() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['licencas_software', 'fornecedores', 'contratos', 'contrato_itens', 'faturas',
                           'linhas_telefonicas', 'estoque_itens', 'unidades'] loop
    execute format(
      'create or replace trigger %I after insert or update or delete on public.%I for each row execute function public.registrar_cadastro_evento()',
      'trg_' || t || '_historico', t);
  end loop;
  foreach t in array array['unidades', 'contrato_anexos', 'linhas_telefonicas', 'estoque_itens', 'estoque_movimentos'] loop
    execute format(
      'create or replace trigger %I before insert or update on public.%I for each row execute function public.carimbar_criacao()',
      'trg_' || t || '_carimbar', t);
  end loop;
end $$;
-- estoque_movimentos é imutável: o carimbo só roda no insert (o update já é recusado)

-- 11. RPCs -------------------------------------------------------------------------------------
create or replace function public.renovar_contrato(p_contrato text, p_inicio date, p_fim date, p_valor numeric, p_numero text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_novo text;
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_fim is not null and p_fim < p_inicio then
    raise exception 'O fim precisa ser depois do início' using errcode = '23514';
  end if;
  insert into public.contratos (fornecedor_id, tipo, numero, descricao, inicio, fim, valor, periodicidade, sla,
         contato_suporte, observacoes, renovado_de, detalhes, unidade_id, moeda, valor_moeda, forma_pagamento,
         cartao_final, pagamento_titular, renovacao_automatica, aviso_cancelamento_dias, reajuste_indice,
         reajuste_mes, multa_cancelamento, responsavel_id, centro_custo, categoria_despesa)
  select fornecedor_id, tipo, coalesce(nullif(btrim(p_numero), ''), numero), descricao, p_inicio, p_fim,
         coalesce(p_valor, valor), periodicidade, sla, contato_suporte, observacoes, id, detalhes, unidade_id, moeda,
         valor_moeda, forma_pagamento, cartao_final, pagamento_titular, renovacao_automatica, aviso_cancelamento_dias,
         reajuste_indice, reajuste_mes, multa_cancelamento, responsavel_id, centro_custo, categoria_despesa
    from public.contratos where id = p_contrato
  returning id into v_novo;
  if v_novo is null then
    raise exception 'Contrato não encontrado' using errcode = 'P0002';
  end if;
  insert into public.contrato_itens (contrato_id, ativo_id, licenca_id)
  select v_novo, ativo_id, licenca_id from public.contrato_itens where contrato_id = p_contrato;
  update public.linhas_telefonicas set contrato_id = v_novo where contrato_id = p_contrato and status <> 'cancelada';
  -- O anterior termina na véspera do novo (se ainda não terminou)
  update public.contratos set fim = least(coalesce(fim, p_inicio - 1), p_inicio - 1)
   where id = p_contrato and (fim is null or fim >= p_inicio) and inicio <= p_inicio - 1;
  return v_novo;
end;
$$;
revoke all on function public.renovar_contrato(text, date, date, numeric, text) from public, anon;
grant execute on function public.renovar_contrato(text, date, date, numeric, text) to authenticated;

create or replace function public.desfazer_pagamento(p_fatura text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') <> 'ti_admin' then
    raise exception 'Só o administrador desfaz um pagamento' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo (mínimo 5 caracteres)' using errcode = '23514';
  end if;
  perform set_config('app.desfazer_pagamento', 'sim', true);
  update public.faturas set status = 'a_pagar', pago_em = null, estorno_motivo = btrim(p_motivo)
   where id = p_fatura and status = 'paga';
  if not found then
    raise exception 'Fatura não está paga' using errcode = 'P0002';
  end if;
  perform set_config('app.desfazer_pagamento', '', true);
end;
$$;
revoke all on function public.desfazer_pagamento(text, text) from public, anon;
grant execute on function public.desfazer_pagamento(text, text) to authenticated;

-- salvar_contrato passa a gravar os campos novos (mesma assinatura; reexecutável)
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
                                sla, contato_suporte, observacoes, detalhes, unidade_id, moeda, valor_moeda,
                                forma_pagamento, cartao_final, pagamento_titular, renovacao_automatica,
                                aviso_cancelamento_dias, reajuste_indice, reajuste_mes, multa_cancelamento,
                                responsavel_id, centro_custo, categoria_despesa)
  values (v_id, p_contrato ->> 'fornecedor_id', p_contrato ->> 'tipo', nullif(p_contrato ->> 'numero', ''),
          p_contrato ->> 'descricao', (p_contrato ->> 'inicio')::date, nullif(p_contrato ->> 'fim', '')::date,
          coalesce(nullif(p_contrato ->> 'valor', '')::numeric, 0),
          coalesce(nullif(p_contrato ->> 'periodicidade', ''), 'mensal'),
          nullif(p_contrato ->> 'sla', ''), nullif(p_contrato ->> 'contato_suporte', ''),
          nullif(p_contrato ->> 'observacoes', ''),
          coalesce(p_contrato -> 'detalhes', '{}'::jsonb), nullif(p_contrato ->> 'unidade_id', ''),
          coalesce(nullif(p_contrato ->> 'moeda', ''), 'BRL'), nullif(p_contrato ->> 'valor_moeda', '')::numeric,
          nullif(p_contrato ->> 'forma_pagamento', ''), nullif(p_contrato ->> 'cartao_final', ''),
          nullif(p_contrato ->> 'pagamento_titular', ''),
          coalesce(nullif(p_contrato ->> 'renovacao_automatica', '')::boolean, false),
          nullif(p_contrato ->> 'aviso_cancelamento_dias', '')::integer, nullif(p_contrato ->> 'reajuste_indice', ''),
          nullif(p_contrato ->> 'reajuste_mes', '')::integer, nullif(p_contrato ->> 'multa_cancelamento', ''),
          nullif(p_contrato ->> 'responsavel_id', ''), nullif(p_contrato ->> 'centro_custo', ''),
          nullif(p_contrato ->> 'categoria_despesa', ''))
  on conflict (id) do update
  set fornecedor_id = excluded.fornecedor_id, tipo = excluded.tipo, numero = excluded.numero,
      descricao = excluded.descricao, inicio = excluded.inicio, fim = excluded.fim, valor = excluded.valor,
      periodicidade = excluded.periodicidade, sla = excluded.sla, contato_suporte = excluded.contato_suporte,
      observacoes = excluded.observacoes, detalhes = excluded.detalhes, unidade_id = excluded.unidade_id,
      moeda = excluded.moeda, valor_moeda = excluded.valor_moeda, forma_pagamento = excluded.forma_pagamento,
      cartao_final = excluded.cartao_final, pagamento_titular = excluded.pagamento_titular,
      renovacao_automatica = excluded.renovacao_automatica, aviso_cancelamento_dias = excluded.aviso_cancelamento_dias,
      reajuste_indice = excluded.reajuste_indice, reajuste_mes = excluded.reajuste_mes,
      multa_cancelamento = excluded.multa_cancelamento, responsavel_id = excluded.responsavel_id,
      centro_custo = excluded.centro_custo, categoria_despesa = excluded.categoria_despesa;

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

-- 12. RLS --------------------------------------------------------------------------------------
-- tabela             | ler | gravar | excluir
-- unidades           | TI  | TI     | ti_admin
-- contrato_anexos    | TI  | TI     | TI
-- linhas_telefonicas | TI  | TI     | ti_admin
-- estoque_itens      | TI  | TI     | ti_admin
-- estoque_movimentos | TI  | TI     | ninguém (gatilho)
do $$
declare
  r record;
  v_ti    constant text := 'public.meu_papel() in (''ti_admin'', ''ti_suporte'')';
  v_admin constant text := 'public.meu_papel() = ''ti_admin''';
begin
  for r in
    select * from (values
      ('unidades',           'admin'),
      ('contrato_anexos',    'ti'),
      ('linhas_telefonicas', 'admin'),
      ('estoque_itens',      'admin'),
      ('estoque_movimentos', 'admin')
    ) as v(tabela, excluir)
  loop
    execute format('alter table public.%I enable row level security', r.tabela);
    execute format('revoke all on public.%I from anon', r.tabela);
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.tabela);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tabela and policyname = r.tabela || '_ler') then
      execute format('create policy %I on public.%I for select to authenticated using (%s)', r.tabela || '_ler', r.tabela, v_ti);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tabela and policyname = r.tabela || '_inserir') then
      execute format('create policy %I on public.%I for insert to authenticated with check (%s)', r.tabela || '_inserir', r.tabela, v_ti);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tabela and policyname = r.tabela || '_alterar') then
      execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', r.tabela || '_alterar', r.tabela, v_ti, v_ti);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tabela and policyname = r.tabela || '_excluir') then
      execute format('create policy %I on public.%I for delete to authenticated using (%s)', r.tabela || '_excluir', r.tabela,
        case r.excluir when 'ti' then v_ti else v_admin end);
    end if;
  end loop;
end $$;

-- Históricos: TI lê; a pessoa lê o próprio histórico de linhas
alter table public.linha_atribuicoes enable row level security;
revoke all on public.linha_atribuicoes from anon;
grant select on public.linha_atribuicoes to authenticated;
alter table public.cadastro_eventos enable row level security;
revoke all on public.cadastro_eventos from anon;
grant select on public.cadastro_eventos to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'linha_atribuicoes' and policyname = 'linha_atribuicao_ler') then
    create policy linha_atribuicao_ler on public.linha_atribuicoes for select to authenticated
      using (public.meu_papel() in ('ti_admin', 'ti_suporte') or colaborador_id = public.meu_colaborador_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cadastro_eventos' and policyname = 'cadastro_eventos_ler') then
    create policy cadastro_eventos_ler on public.cadastro_eventos for select to authenticated
      using (public.meu_papel() in ('ti_admin', 'ti_suporte'));
  end if;
end $$;

-- Arquivos dos anexos ficam na pasta contratos/ (já liberada para a TI na Fase 8)

-- 13. Migração de dados ------------------------------------------------------------------------
-- Forma de cobrança: contrato de licenciamento vigente → contrato; valor zero → sem custo; senão própria
update public.licencas_software l
   set forma_cobranca = 'contrato'
 where forma_cobranca = 'propria'
   and exists (select 1 from public.contrato_itens ci join public.contratos c on c.id = ci.contrato_id
                where ci.licenca_id = l.id and c.tipo = 'licenciamento'
                  and c.inicio <= current_date and (c.fim is null or c.fim >= current_date));
update public.licencas_software
   set forma_cobranca = 'sem_custo'
 where forma_cobranca = 'propria' and coalesce(valor_mensal, 0) = 0;

-- Fornecedor em texto: liga só quando o nome bate exatamente; o resto fica para "Conciliar fornecedores"
update public.licencas_software l
   set fornecedor_id = f.id
  from public.fornecedores f
 where l.fornecedor_id is null and l.fornecedor is not null
   and lower(btrim(l.fornecedor)) = lower(btrim(f.nome));
update public.ativos a
   set fornecedor_id = f.id
  from public.fornecedores f
 where a.fornecedor_id is null and coalesce(a.fiscal ->> 'fornecedor', '') <> ''
   and lower(btrim(a.fiscal ->> 'fornecedor')) = lower(btrim(f.nome));

-- Categoria da despesa dos contratos existentes
update public.contratos set categoria_despesa = case tipo
    when 'licenciamento' then 'software'
    when 'internet' then 'internet'
    when 'telefonia_movel' then 'telefonia'
    when 'telefonia_fixa' then 'telefonia'
    when 'nuvem' then 'nuvem'
    when 'dominio' then 'servicos'
    when 'outro' then 'outros'
    else 'hardware' end
 where categoria_despesa is null;
