-- Seção 26 · Faturas geradas automaticamente (sem DROP de tabela ou coluna).
-- O sistema cria a fatura de cada mês de contratos vigentes, licenças com cobrança própria e
-- linhas sem contrato, 30 dias antes do vencimento; o financeiro só registra o pagamento.
-- Lançamento manual continua: "fatura do mês" (quando ainda não há) ou "adicional" (com motivo).
-- Sem retroativo: começa na competência atual. Moeda estrangeira: em reais pelo câmbio das premissas.

-- 1. Campos ------------------------------------------------------------------------------------
alter table public.faturas add column if not exists origem_geracao text not null default 'manual';
alter table public.faturas add column if not exists motivo_adicional text;
alter table public.faturas add column if not exists linha_id text references public.linhas_telefonicas (id) on delete restrict;
create index if not exists idx_faturas_linha on public.faturas (linha_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_fatura_origem_geracao') then
    alter table public.faturas add constraint chk_fatura_origem_geracao check (
      origem_geracao in ('automatica', 'manual', 'adicional')
      and (origem_geracao <> 'adicional' or nullif(btrim(motivo_adicional), '') is not null));
  end if;
end $$;

alter table public.contratos          add column if not exists dia_vencimento integer not null default 10;
alter table public.licencas_software  add column if not exists dia_vencimento integer not null default 10;
alter table public.linhas_telefonicas add column if not exists dia_vencimento integer not null default 10;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_contrato_dia_vencimento') then
    alter table public.contratos add constraint chk_contrato_dia_vencimento check (dia_vencimento between 1 and 31);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_licenca_dia_vencimento') then
    alter table public.licencas_software add constraint chk_licenca_dia_vencimento check (dia_vencimento between 1 and 31);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_linha_dia_vencimento') then
    alter table public.linhas_telefonicas add constraint chk_linha_dia_vencimento check (dia_vencimento between 1 and 31);
  end if;
end $$;

-- 2. De quem é a fatura: agora também a linha (troca da regra, sem apagar dados) ----------------
alter table public.faturas drop constraint if exists chk_fatura_alvo;
alter table public.faturas add constraint chk_fatura_alvo check (
  num_nonnulls(licenca_id, contrato_id, pedido_id, linha_id) = 1
  or (num_nonnulls(licenca_id, contrato_id, pedido_id, linha_id) = 0
      and fornecedor_id is not null and nullif(btrim(descricao), '') is not null));

-- 3. Uma fatura "do mês" por origem e competência; adicionais ficam de fora da regra -------------
drop index if exists public.uq_fatura_licenca_comp;
drop index if exists public.uq_fatura_contrato_comp;
create unique index if not exists uq_fatura_licenca_mes on public.faturas (licenca_id, competencia)
  where licenca_id is not null and status <> 'cancelada' and origem_geracao <> 'adicional';
create unique index if not exists uq_fatura_contrato_mes on public.faturas (contrato_id, competencia)
  where contrato_id is not null and status <> 'cancelada' and origem_geracao <> 'adicional';
create unique index if not exists uq_fatura_linha_mes on public.faturas (linha_id, competencia)
  where linha_id is not null and status <> 'cancelada' and origem_geracao <> 'adicional';

-- 4. Vencimento: o dia escolhido dentro do mês (dia 31 em fevereiro vira o último dia) -----------
create or replace function public.dia_no_mes(p_comp date, p_dia integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select (date_trunc('month', p_comp)::date
          + (least(greatest(coalesce(p_dia, 10), 1),
                   extract(day from (date_trunc('month', p_comp) + interval '1 month - 1 day'))::integer) - 1))::date;
$$;

-- 5. A rotina ------------------------------------------------------------------------------------
create or replace function public.gerar_faturas_previstas(p_hoje date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje   date := coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date);
  v_limite date;
  v_ini    date;
  v_cambio jsonb;
  v_n      integer := 0;
  r        record;
  k        integer;
  v_comp   date;
  v_venc   date;
  v_valor  numeric;
begin
  -- Agendador (sem login), T.I. ou Compras. Os demais perfis (o app chama ao entrar) não geram nada.
  if auth.uid() is not null and coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte', 'compras') then
    return 0;
  end if;
  v_limite := v_hoje + 30;
  v_ini := date_trunc('month', v_hoje)::date;   -- sem retroativo
  select e.premissas_financeiras -> 'cambio' into v_cambio from public.configuracoes_empresa e limit 1;

  -- 5a. Contratos ativos (mensal, anual no mês do aniversário, único uma vez no mês do início)
  for r in
    select c.* from public.contratos c
     where c.status = 'ativo' and coalesce(c.valor, 0) > 0
  loop
    for k in 0..12 loop
      v_comp := (v_ini + make_interval(months => k))::date;
      exit when public.dia_no_mes(v_comp, r.dia_vencimento) > v_limite;
      continue when v_comp < date_trunc('month', r.inicio)::date;
      continue when r.fim is not null and v_comp > r.fim;
      continue when r.periodicidade = 'anual' and extract(month from v_comp) <> extract(month from r.inicio);
      continue when r.periodicidade = 'unico' and v_comp <> date_trunc('month', r.inicio)::date;
      -- já existe a fatura do mês (manual ou automática) ou uma automática foi cancelada de propósito
      continue when exists (select 1 from public.faturas f where f.contrato_id = r.id and f.competencia = v_comp
                              and ((f.status <> 'cancelada' and f.origem_geracao <> 'adicional') or f.origem_geracao = 'automatica'));
      continue when r.periodicidade = 'unico' and exists (select 1 from public.faturas f where f.contrato_id = r.id and f.status <> 'cancelada');
      v_valor := case when coalesce(r.moeda, 'BRL') <> 'BRL' and r.valor_moeda is not null and (v_cambio ->> r.moeda) is not null
                      then round(r.valor_moeda * (v_cambio ->> r.moeda)::numeric, 2) else r.valor end;
      v_venc := greatest(public.dia_no_mes(v_comp, r.dia_vencimento), v_hoje);
      begin
        insert into public.faturas (contrato_id, competencia, valor, vencimento, status, origem_geracao, moeda, valor_moeda, forma_pagamento)
        values (r.id, v_comp, v_valor, v_venc, 'a_pagar', 'automatica', coalesce(r.moeda, 'BRL'),
                case when coalesce(r.moeda, 'BRL') <> 'BRL' then r.valor_moeda end, r.forma_pagamento);
        v_n := v_n + 1;
      exception when unique_violation or check_violation then null;
      end;
    end loop;
  end loop;

  -- 5b. Licenças com cobrança própria (mensal; anual no mês da renovação). Pagas por contrato ficam com o contrato.
  for r in
    select l.* from public.licencas_software l
     where coalesce(l.status, 'ativa') <> 'inativa'
       and coalesce(l.forma_cobranca, 'propria') = 'propria'
       and coalesce(l.valor_mensal, 0) > 0
  loop
    continue when coalesce(r.tipo_cobranca, 'mensal') = 'anual' and r.data_renovacao is null;
    for k in 0..12 loop
      v_comp := (v_ini + make_interval(months => k))::date;
      exit when public.dia_no_mes(v_comp, r.dia_vencimento) > v_limite;
      continue when coalesce(r.tipo_cobranca, 'mensal') = 'anual' and extract(month from v_comp) <> extract(month from r.data_renovacao);
      continue when exists (select 1 from public.faturas f where f.licenca_id = r.id and f.competencia = v_comp
                              and ((f.status <> 'cancelada' and f.origem_geracao <> 'adicional') or f.origem_geracao = 'automatica'));
      v_valor := case when coalesce(r.moeda, 'BRL') <> 'BRL' and r.valor_moeda is not null and (v_cambio ->> r.moeda) is not null
                      then round(r.valor_moeda * (v_cambio ->> r.moeda)::numeric, 2) else r.valor_mensal end;
      v_venc := greatest(public.dia_no_mes(v_comp, r.dia_vencimento), v_hoje);
      begin
        insert into public.faturas (licenca_id, competencia, valor, vencimento, status, origem_geracao, moeda, valor_moeda, forma_pagamento)
        values (r.id, v_comp, v_valor, v_venc, 'a_pagar', 'automatica', coalesce(r.moeda, 'BRL'),
                case when coalesce(r.moeda, 'BRL') <> 'BRL' then r.valor_moeda end, r.forma_pagamento);
        v_n := v_n + 1;
      exception when unique_violation or check_violation then null;   -- ex.: licença coberta por contrato de licenciamento
      end;
    end loop;
  end loop;

  -- 5c. Linhas ativas sem contrato, com valor mensal
  for r in
    select li.* from public.linhas_telefonicas li
     where li.status = 'ativa' and li.contrato_id is null and coalesce(li.valor_mensal, 0) > 0
  loop
    for k in 0..12 loop
      v_comp := (v_ini + make_interval(months => k))::date;
      exit when public.dia_no_mes(v_comp, r.dia_vencimento) > v_limite;
      continue when exists (select 1 from public.faturas f where f.linha_id = r.id and f.competencia = v_comp
                              and ((f.status <> 'cancelada' and f.origem_geracao <> 'adicional') or f.origem_geracao = 'automatica'));
      begin
        insert into public.faturas (linha_id, competencia, valor, vencimento, status, origem_geracao, categoria_despesa, departamento_id)
        values (r.id, v_comp, r.valor_mensal, greatest(public.dia_no_mes(v_comp, r.dia_vencimento), v_hoje), 'a_pagar', 'automatica',
                'telefonia', r.departamento_id);
        v_n := v_n + 1;
      exception when unique_violation or check_violation then null;
      end;
    end loop;
  end loop;

  return v_n;
end;
$$;
revoke all on function public.gerar_faturas_previstas(date) from public, anon;
grant execute on function public.gerar_faturas_previstas(date) to authenticated;

-- 6. Encerrou/desativou: faturas automáticas futuras e não pagas são canceladas (fica no histórico)
create or replace function public.cancelar_faturas_automaticas_futuras()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_corte date;
  v_motivo text;
begin
  if tg_table_name = 'contratos' then
    if new.status = 'encerrado' and old.status is distinct from 'encerrado' then
      v_corte := coalesce(new.encerrado_em, (now() at time zone 'America/Sao_Paulo')::date);
    elsif new.fim is not null and new.fim is distinct from old.fim then
      v_corte := new.fim;
    else
      return new;
    end if;
    v_motivo := 'Cancelada automaticamente: contrato encerrado';
    update public.faturas set status = 'cancelada',
           observacoes = concat_ws(' · ', nullif(observacoes, ''), v_motivo)
     where contrato_id = new.id and origem_geracao = 'automatica' and status = 'a_pagar'
       and competencia > date_trunc('month', v_corte)::date;
  elsif tg_table_name = 'licencas_software' then
    if not (new.status = 'inativa' and old.status is distinct from 'inativa')
       and not (coalesce(new.forma_cobranca, 'propria') <> 'propria' and coalesce(old.forma_cobranca, 'propria') = 'propria') then
      return new;
    end if;
    update public.faturas set status = 'cancelada',
           observacoes = concat_ws(' · ', nullif(observacoes, ''), 'Cancelada automaticamente: software desativado ou passou a outra cobrança')
     where licenca_id = new.id and origem_geracao = 'automatica' and status = 'a_pagar'
       and competencia > date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  else
    if not (new.status <> 'ativa' and old.status = 'ativa') and not (new.contrato_id is not null and old.contrato_id is null) then
      return new;
    end if;
    update public.faturas set status = 'cancelada',
           observacoes = concat_ws(' · ', nullif(observacoes, ''), 'Cancelada automaticamente: linha cancelada, suspensa ou passou a contrato')
     where linha_id = new.id and origem_geracao = 'automatica' and status = 'a_pagar'
       and competencia > date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  end if;
  return new;
end;
$$;
revoke all on function public.cancelar_faturas_automaticas_futuras() from public, anon, authenticated;

create or replace trigger trg_contrato_cancela_faturas_auto after update on public.contratos
  for each row execute function public.cancelar_faturas_automaticas_futuras();
create or replace trigger trg_licenca_cancela_faturas_auto after update on public.licencas_software
  for each row execute function public.cancelar_faturas_automaticas_futuras();
create or replace trigger trg_linha_cancela_faturas_auto after update on public.linhas_telefonicas
  for each row execute function public.cancelar_faturas_automaticas_futuras();

-- 7. salvar_contrato passa a gravar o dia de vencimento (mesma função, com o campo novo) ----------
create or replace function public.salvar_contrato(p_contrato jsonb, p_itens jsonb default '[]'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    text := nullif(p_contrato ->> 'id', '');
  v_itens jsonb := coalesce(p_itens, '[]'::jsonb);
  v_papel text := public.meu_papel();
begin
  if auth.uid() is not null and coalesce(v_papel, '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Apenas a T.I. cadastra contratos' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'Contrato sem identificador' using errcode = '23514';
  end if;

  insert into public.contratos (id, fornecedor_id, tipo, numero, descricao, inicio, fim, valor, periodicidade,
                                sla, contato_suporte, observacoes, detalhes, unidade_id, moeda, valor_moeda,
                                forma_pagamento, cartao_final, pagamento_titular, renovacao_automatica,
                                aviso_cancelamento_dias, reajuste_indice, reajuste_mes, multa_cancelamento,
                                responsavel_id, centro_custo, categoria_despesa, dia_vencimento)
  values (v_id, p_contrato ->> 'fornecedor_id', p_contrato ->> 'tipo', nullif(p_contrato ->> 'numero', ''),
          p_contrato ->> 'descricao', (p_contrato ->> 'inicio')::date, nullif(p_contrato ->> 'fim', '')::date,
          coalesce(nullif(p_contrato ->> 'valor', '')::numeric, 0),
          coalesce(nullif(p_contrato ->> 'periodicidade', ''), 'mensal'),
          nullif(p_contrato ->> 'sla', ''), nullif(p_contrato ->> 'contato_suporte', ''),
          nullif(p_contrato ->> 'observacoes', ''),
          coalesce(p_contrato -> 'detalhes', '{}'::jsonb), nullif(p_contrato ->> 'unidade_id', ''),
          coalesce(nullif(p_contrato ->> 'moeda', ''), 'BRL'), nullif(p_contrato ->> 'valor_moeda', '')::numeric,
          case when v_papel = 'ti_suporte' then null else nullif(p_contrato ->> 'forma_pagamento', '') end,
          case when v_papel = 'ti_suporte' then null else nullif(p_contrato ->> 'cartao_final', '') end,
          case when v_papel = 'ti_suporte' then null else nullif(p_contrato ->> 'pagamento_titular', '') end,
          coalesce(nullif(p_contrato ->> 'renovacao_automatica', '')::boolean, false),
          nullif(p_contrato ->> 'aviso_cancelamento_dias', '')::integer, nullif(p_contrato ->> 'reajuste_indice', ''),
          nullif(p_contrato ->> 'reajuste_mes', '')::integer, nullif(p_contrato ->> 'multa_cancelamento', ''),
          nullif(p_contrato ->> 'responsavel_id', ''), nullif(p_contrato ->> 'centro_custo', ''),
          nullif(p_contrato ->> 'categoria_despesa', ''),
          coalesce(nullif(p_contrato ->> 'dia_vencimento', '')::integer, 10))
  on conflict (id) do update
  set fornecedor_id = excluded.fornecedor_id, tipo = excluded.tipo, numero = excluded.numero,
      descricao = excluded.descricao, inicio = excluded.inicio, fim = excluded.fim, valor = excluded.valor,
      periodicidade = excluded.periodicidade, sla = excluded.sla, contato_suporte = excluded.contato_suporte,
      observacoes = excluded.observacoes, detalhes = excluded.detalhes, unidade_id = excluded.unidade_id,
      moeda = excluded.moeda, valor_moeda = excluded.valor_moeda,
      forma_pagamento = case when v_papel = 'ti_suporte' then public.contratos.forma_pagamento else excluded.forma_pagamento end,
      cartao_final = case when v_papel = 'ti_suporte' then public.contratos.cartao_final else excluded.cartao_final end,
      pagamento_titular = case when v_papel = 'ti_suporte' then public.contratos.pagamento_titular else excluded.pagamento_titular end,
      renovacao_automatica = excluded.renovacao_automatica, aviso_cancelamento_dias = excluded.aviso_cancelamento_dias,
      reajuste_indice = excluded.reajuste_indice, reajuste_mes = excluded.reajuste_mes,
      multa_cancelamento = excluded.multa_cancelamento, responsavel_id = excluded.responsavel_id,
      centro_custo = excluded.centro_custo, categoria_despesa = excluded.categoria_despesa,
      dia_vencimento = case when p_contrato ? 'dia_vencimento' then excluded.dia_vencimento else public.contratos.dia_vencimento end;

  delete from public.contrato_itens ci
  where ci.contrato_id = v_id
    and not exists (select 1 from jsonb_array_elements(v_itens) e
                    where nullif(e ->> 'ativo_id', '') is not distinct from ci.ativo_id
                      and nullif(e ->> 'licenca_id', '') is not distinct from ci.licenca_id);

  insert into public.contrato_itens (contrato_id, ativo_id, licenca_id)
  select v_id, nullif(e ->> 'ativo_id', ''), nullif(e ->> 'licenca_id', '')
  from jsonb_array_elements(v_itens) e
  on conflict do nothing;

  -- Quantidade contratada: só o administrador altera; item sem a chave mantém o valor atual
  if auth.uid() is null or v_papel = 'ti_admin' then
    update public.contrato_itens ci
       set quantidade_contratada = nullif(e ->> 'quantidade_contratada', '')::integer
      from jsonb_array_elements(v_itens) e
     where ci.contrato_id = v_id
       and nullif(e ->> 'licenca_id', '') is not null
       and ci.licenca_id = e ->> 'licenca_id'
       and e ? 'quantidade_contratada';
  end if;
end;
$$;

-- 8. Agendador diário (6h de Brasília). Sem pg_cron disponível, a rotina roda pelo app ----------
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron indisponível (%): a geração roda quando a T.I. ou Compras entram no sistema', sqlerrm;
    return;
  end;
  if exists (select 1 from cron.job where jobname = 'gerar-faturas-previstas') then
    perform cron.unschedule('gerar-faturas-previstas');
  end if;
  perform cron.schedule('gerar-faturas-previstas', '0 9 * * *', 'select public.gerar_faturas_previstas()');
end $$;
