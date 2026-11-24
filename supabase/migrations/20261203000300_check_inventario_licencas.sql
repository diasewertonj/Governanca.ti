-- ==============================================================================
-- Check geral: custódia atômica, licenças, contratos e inventário físico.
--   1. transferir_custodia: fecha a entrada aberta, abre a nova e atualiza o ativo numa transação
--   2. alocar_licenca: recusa colaborador inexistente ou desligado
--   3. renovar_contrato: recusa contrato encerrado e contrato que já foi renovado
--   4. Inventário físico: ativo baixado não entra nem gera "não encontrado";
--      uma conferência aberta por local (e "todos" não convive com outra aberta)
-- Só create or replace: pode rodar de novo sem efeito colateral.
-- ==============================================================================

-- 1. Transferência de custódia (entrega, troca ou devolução ao estoque) ---------------------------
-- SECURITY INVOKER: as políticas de ativos e historico_custodia (só T.I.) continuam valendo.
create or replace function public.transferir_custodia(
  p_ativo      text,
  p_para       text default null,
  p_motivo     text default null,
  p_observacao text default null,
  p_data       date default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_ativo public.ativos%rowtype;
  v_data  date := coalesce(p_data, current_date);
  v_nome  text;
  v_para  text := nullif(btrim(coalesce(p_para, '')), '');
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Apenas a T.I. transfere a custódia de equipamentos' using errcode = '42501';
  end if;

  select * into v_ativo from public.ativos where id = p_ativo for update;
  if not found then
    raise exception 'Ativo não encontrado' using errcode = '23514';
  end if;
  if v_ativo.status = 'descartado' then
    raise exception 'O ativo % está baixado e não pode mudar de custódia', v_ativo.tag using errcode = '23514';
  end if;
  if v_para is not null then
    select nome into v_nome from public.colaboradores where id = v_para and status <> 'desligado';
    if not found then
      raise exception 'Colaborador não encontrado ou desligado' using errcode = '23514';
    end if;
  end if;
  if v_ativo.custodiante_id is not distinct from v_para then
    raise exception 'O ativo % já está nesta custódia', v_ativo.tag using errcode = '23514';
  end if;

  -- Fecha o que estiver aberto
  update public.historico_custodia
     set data_devolucao = v_data,
         motivo_devolucao = coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'Devolução/Transferência para o estoque de TI')
   where ativo_id = p_ativo and data_devolucao is null;

  if v_para is not null then
    insert into public.historico_custodia (id, ativo_id, colaborador_id, colaborador_nome, data_entrega, observacoes)
    values ('cust-' || gen_random_uuid(), p_ativo, v_para, v_nome, v_data,
            case when nullif(btrim(coalesce(p_observacao, '')), '') is not null
                 then 'Entrega pela T.I. — justificativa: ' || btrim(p_observacao)
                 else 'Transferência de custódia realizada pelo setor de TI' end);
  end if;

  -- Com manutenção em andamento o ativo continua "em manutenção" (ver manter_status_manutencao)
  update public.ativos
     set custodiante_id = v_para,
         data_entrega_atual = case when v_para is not null then v_data end,
         status = case when v_para is not null then 'em_uso' else 'disponivel' end
   where id = p_ativo;
end;
$$;
revoke all on function public.transferir_custodia(text, text, text, text, date) from public, anon;
grant execute on function public.transferir_custodia(text, text, text, text, date) to authenticated;

-- 2. Alocar licença: colaborador precisa existir e não estar desligado -----------------------------
create or replace function public.alocar_licenca(p_licenca text, p_colaborador text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_ids jsonb;
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Apenas a T.I. gerencia assentos de licença' using errcode = '42501';
  end if;
  if not exists (select 1 from public.colaboradores where id = p_colaborador and status <> 'desligado') then
    raise exception 'Colaborador não encontrado ou desligado' using errcode = '23514';
  end if;
  update public.licencas_software l
  set colaboradores_ids = coalesce(l.colaboradores_ids, '[]'::jsonb) || to_jsonb(p_colaborador)
  where l.id = p_licenca
    and not coalesce(l.colaboradores_ids, '[]'::jsonb) ? p_colaborador
    and jsonb_array_length(coalesce(l.colaboradores_ids, '[]'::jsonb)) < l.assentos_totais
  returning l.colaboradores_ids into v_ids;

  if v_ids is null then
    if not exists (select 1 from public.licencas_software where id = p_licenca) then
      raise exception 'Licença não encontrada ou sem permissão' using errcode = '42501';
    elsif exists (select 1 from public.licencas_software
                  where id = p_licenca and coalesce(colaboradores_ids, '[]'::jsonb) ? p_colaborador) then
      raise exception 'Colaborador já possui assento nesta licença' using errcode = '23505';
    else
      raise exception 'Não há assentos livres nesta licença' using errcode = '23514';
    end if;
  end if;
  return v_ids;
end;
$$;

-- 3. Renovar contrato: não renova encerrado nem duas vezes o mesmo ----------------------------------
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

-- 4. Inventário físico ---------------------------------------------------------------------------
-- Ativo baixado não entra numa conferência (a baixa pode acontecer com ela aberta,
-- mas incluir à mão um ativo já baixado não faz sentido)
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
  if tg_op = 'INSERT' and exists (select 1 from public.ativos where id = new.ativo_id and status = 'descartado') then
    raise exception 'Este equipamento está baixado e não entra na conferência' using errcode = '23514';
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

-- Uma conferência aberta por local; "todos" (local vazio) não convive com nenhuma outra aberta.
-- Trava por advisory lock (e não por índice único) para não quebrar com dados antigos.
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
  -- Serializa a abertura: duas chamadas simultâneas não passam juntas pela checagem
  perform pg_advisory_xact_lock(hashtext('nexus.abrir_inventario'));
  if v_local = '' and exists (select 1 from public.inventarios_fisicos where status = 'aberto') then
    raise exception 'Há conferência aberta. Feche ou cancele antes de abrir uma de todos os equipamentos' using errcode = '23514';
  end if;
  if exists (select 1 from public.inventarios_fisicos where status = 'aberto' and btrim(local) = '') then
    raise exception 'Há uma conferência de todos os equipamentos aberta. Feche ou cancele antes de abrir outra' using errcode = '23514';
  end if;
  if exists (select 1 from public.inventarios_fisicos where status = 'aberto' and lower(btrim(local)) = lower(v_local)) then
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

-- Fecha: pendentes viram "não encontrado" (menos os de ativos baixados durante a conferência,
-- que ficam como estão e entram no resumo como "baixados"); gera lembretes e, se pedido,
-- atualiza o local dos encontrados em outro lugar (nunca o de um ativo baixado)
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
  update public.inventario_itens i set situacao = 'nao_encontrado', conferido_por = public.meu_colaborador_id(), conferido_em = now()
   where i.inventario_id = p_id and i.situacao = 'pendente'
     and not exists (select 1 from public.ativos a where a.id = i.ativo_id and a.status = 'descartado');

  for v_r in
    select i.situacao, i.local_encontrado, a.id as ativo_id, a.tag, a.nome
      from public.inventario_itens i join public.ativos a on a.id = i.ativo_id
     where i.inventario_id = p_id and i.situacao in ('nao_encontrado', 'outro_local')
       and a.status <> 'descartado'
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
           'encontrados', count(*) filter (where i.situacao = 'encontrado'),
           'nao_encontrados', count(*) filter (where i.situacao = 'nao_encontrado'),
           'outro_local', count(*) filter (where i.situacao = 'outro_local'),
           'via_qr', count(*) filter (where i.via_qr),
           'baixados', count(*) filter (where i.situacao = 'pendente'),
           'locais_atualizados', p_atualizar_locais)
    into v_resumo
    from public.inventario_itens i where i.inventario_id = p_id;

  update public.inventarios_fisicos
     set status = 'fechado', resumo = v_resumo, fechado_por = public.meu_colaborador_id(), fechado_em = now()
   where id = p_id;
  perform set_config('app.operacao_inventario', '', true);
  return v_resumo;
end;
$$;
revoke all on function public.fechar_inventario(text, boolean) from public, anon;
grant execute on function public.fechar_inventario(text, boolean) to authenticated;
