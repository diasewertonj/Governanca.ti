-- ==============================================================================
-- Total de assentos da licença: quem muda, com que motivo, e o histórico.
--
-- 1. licenca_eventos            histórico de capacidade e valor (só gatilho/funções gravam)
-- 2. contrato_itens.quantidade_contratada  teto de assentos que o contrato cobre (nulo = não informado)
-- 3. ajustar_assentos_licenca   único caminho da tela: só ti_admin e compras, com motivo
-- 4. gatilhos em licencas_software: o usuário não muda o total direto; todo ajuste vira evento
-- 5. salvar_contrato / renovar_contrato levam a quantidade contratada
--
-- Funções do sistema (receber_pedido, que roda como dono) continuam somando assentos;
-- o gatilho as reconhece por current_user (usuário comum roda como authenticated).
-- Reexecutável: create or replace / if not exists.
-- ==============================================================================

-- 1) Histórico --------------------------------------------------------------------------
create table if not exists public.licenca_eventos (
  id           uuid primary key default gen_random_uuid(),
  licenca_id   text not null references public.licencas_software (id) on delete cascade,
  tipo         text not null check (tipo in ('cadastro', 'capacidade', 'valor', 'capacidade_valor', 'recebimento')),
  total_antes  integer,
  total_depois integer,
  valor_antes  numeric(12,2),
  valor_depois numeric(12,2),
  motivo       text not null,
  por          text references public.colaboradores (id) on delete set null,
  em           timestamptz not null default now()
);
create index if not exists idx_licenca_eventos_licenca on public.licenca_eventos (licenca_id, em desc);

alter table public.licenca_eventos enable row level security;
drop policy if exists licenca_eventos_ler on public.licenca_eventos;
create policy licenca_eventos_ler on public.licenca_eventos for select to authenticated
  using (public.meu_papel() in ('ti_admin', 'ti_suporte', 'compras'));
revoke all on public.licenca_eventos from anon, authenticated;
grant select on public.licenca_eventos to authenticated;

-- 2) Quantidade contratada ---------------------------------------------------------------
alter table public.contrato_itens add column if not exists quantidade_contratada integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_contrato_item_quantidade') then
    alter table public.contrato_itens
      add constraint chk_contrato_item_quantidade check (quantidade_contratada is null or quantidade_contratada > 0);
  end if;
end $$;

-- 3) Gatilho antes: o usuário não muda o total direto; marca a origem para o histórico ----
create or replace function public.licenca_capacidade_guarda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assentos_totais is not distinct from old.assentos_totais
     and new.valor_mensal is not distinct from old.valor_mensal then
    return new;
  end if;
  if new.assentos_totais is distinct from old.assentos_totais and current_user in ('authenticated', 'anon') then
    raise exception 'O total de assentos só muda por "Ajustar total de assentos" (administrador da T.I. ou Compras).'
      using errcode = '42501';
  end if;
  perform set_config('app.licenca_origem',
                     case when current_user in ('authenticated', 'anon') then 'tela' else 'sistema' end, true);
  return new;
end;
$$;
revoke all on function public.licenca_capacidade_guarda() from public, anon, authenticated;

create or replace trigger trg_licenca_capacidade_guarda
  before update on public.licencas_software
  for each row execute function public.licenca_capacidade_guarda();

-- 3b) Gatilho depois: grava o evento ------------------------------------------------------
create or replace function public.licenca_registrar_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text;
  v_tipo   text;
begin
  if tg_op = 'INSERT' then
    insert into public.licenca_eventos (licenca_id, tipo, total_depois, valor_depois, motivo, por)
    values (new.id, 'cadastro', new.assentos_totais, new.valor_mensal, 'Cadastro', public.meu_colaborador_id());
    return new;
  end if;

  if new.assentos_totais is not distinct from old.assentos_totais
     and new.valor_mensal is not distinct from old.valor_mensal then
    return new;
  end if;

  v_motivo := nullif(btrim(coalesce(current_setting('app.motivo_licenca', true), '')), '');
  if new.assentos_totais is distinct from old.assentos_totais then
    v_tipo := case when new.valor_mensal is distinct from old.valor_mensal then 'capacidade_valor' else 'capacidade' end;
  else
    v_tipo := 'valor';
  end if;
  if v_motivo is null then
    if coalesce(current_setting('app.licenca_origem', true), '') = 'sistema' then
      v_motivo := 'Recebimento de pedido';
      v_tipo := 'recebimento';
    else
      v_motivo := 'Edição do cadastro';
    end if;
  end if;

  insert into public.licenca_eventos (licenca_id, tipo, total_antes, total_depois, valor_antes, valor_depois, motivo, por)
  values (new.id, v_tipo, old.assentos_totais, new.assentos_totais, old.valor_mensal, new.valor_mensal,
          v_motivo, public.meu_colaborador_id());
  return new;
end;
$$;
revoke all on function public.licenca_registrar_evento() from public, anon, authenticated;

create or replace trigger trg_licenca_registrar_evento
  after insert or update on public.licencas_software
  for each row execute function public.licenca_registrar_evento();

-- 4) RPC: ajustar total (e valor) --------------------------------------------------------
create or replace function public.ajustar_assentos_licenca(
  p_licenca text, p_total integer, p_valor_mensal numeric default null, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l         public.licencas_software%rowtype;
  v_em_uso    integer;
  v_motivo    text := btrim(coalesce(p_motivo, ''));
  v_contratado integer;
  v_valor     numeric(12,2);
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') not in ('ti_admin', 'compras') then
    raise exception 'Só o administrador da T.I. ou Compras ajustam o total de assentos' using errcode = '42501';
  end if;
  if length(v_motivo) < 5 then
    raise exception 'Informe o motivo do ajuste (mínimo 5 caracteres)' using errcode = '23514';
  end if;
  if p_total is null or p_total < 0 then
    raise exception 'Total de assentos inválido' using errcode = '23514';
  end if;

  select * into v_l from public.licencas_software where id = p_licenca for update;
  if not found then
    raise exception 'Licença não encontrada' using errcode = 'P0002';
  end if;
  if v_l.status = 'inativa' then
    raise exception 'Licença inativa não muda de total. Reative-a antes' using errcode = '23514';
  end if;

  v_em_uso := jsonb_array_length(coalesce(v_l.colaboradores_ids, '[]'::jsonb));
  if p_total < v_em_uso then
    raise exception 'Assentos totais (%) não podem ser menos que os % em uso.', p_total, v_em_uso
      using errcode = '23514';
  end if;

  v_valor := v_l.valor_mensal;
  if v_l.forma_cobranca = 'contrato' and p_total is distinct from v_l.assentos_totais then
    select ci.quantidade_contratada into v_contratado
      from public.contrato_itens ci
      join public.contratos c on c.id = ci.contrato_id
     where ci.licenca_id = p_licenca and c.status = 'ativo' and ci.quantidade_contratada is not null
     order by c.inicio desc
     limit 1;
    if v_contratado is not null and p_total > v_contratado then
      raise exception 'Acima do contratado (%). Faça um aditivo/renovação do contrato com a nova quantidade ou um pedido de compra.', v_contratado
        using errcode = '23514';
    end if;
  elsif v_l.forma_cobranca = 'propria' and p_total is distinct from v_l.assentos_totais then
    if p_valor_mensal is null or p_valor_mensal < 0 then
      raise exception 'Informe o novo valor mensal da licença' using errcode = '23514';
    end if;
    v_valor := round(p_valor_mensal, 2);
  end if;

  perform set_config('app.motivo_licenca', v_motivo, true);
  update public.licencas_software set assentos_totais = p_total, valor_mensal = v_valor where id = p_licenca;
  perform set_config('app.motivo_licenca', '', true);
end;
$$;
revoke all on function public.ajustar_assentos_licenca(text, integer, numeric, text) from public, anon;
grant execute on function public.ajustar_assentos_licenca(text, integer, numeric, text) to authenticated;

-- 5) salvar_contrato: leva a quantidade contratada (só o administrador altera) --------------
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
                                responsavel_id, centro_custo, categoria_despesa)
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
          nullif(p_contrato ->> 'categoria_despesa', ''))
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
revoke all on function public.salvar_contrato(jsonb, jsonb) from public, anon;
grant execute on function public.salvar_contrato(jsonb, jsonb) to authenticated;

-- 6) renovar_contrato: copia a quantidade contratada -------------------------------------
create or replace function public.renovar_contrato(p_contrato text, p_inicio date, p_fim date, p_valor numeric, p_numero text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_novo   text;
  v_status text;
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_fim is not null and p_fim < p_inicio then
    raise exception 'O fim precisa ser depois do início' using errcode = '23514';
  end if;

  select status into v_status from public.contratos where id = p_contrato for update;
  if not found then
    raise exception 'Contrato não encontrado' using errcode = 'P0002';
  end if;
  if v_status = 'encerrado' then
    raise exception 'Contrato encerrado não pode ser renovado. Cadastre um novo contrato' using errcode = '23514';
  end if;
  if exists (select 1 from public.contratos where renovado_de = p_contrato) then
    raise exception 'Este contrato já foi renovado. Renove a versão mais recente' using errcode = '23514';
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
  insert into public.contrato_itens (contrato_id, ativo_id, licenca_id, quantidade_contratada)
  select v_novo, ativo_id, licenca_id, quantidade_contratada from public.contrato_itens where contrato_id = p_contrato;
  update public.linhas_telefonicas set contrato_id = v_novo where contrato_id = p_contrato and status <> 'cancelada';
  -- O anterior termina na véspera do novo (se ainda não terminou)
  update public.contratos set fim = least(coalesce(fim, p_inicio - 1), p_inicio - 1)
   where id = p_contrato and (fim is null or fim >= p_inicio) and inicio <= p_inicio - 1;
  return v_novo;
end;
$$;
revoke all on function public.renovar_contrato(text, date, date, numeric, text) from public, anon;
grant execute on function public.renovar_contrato(text, date, date, numeric, text) to authenticated;
