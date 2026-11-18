-- Processos e chamados (seção 10.4 da documentação). Sem DROP.
-- 1. cancelar_processo: linhas entregues/devolvidas também entram no lembrete do que reverter
--    (a tela já avisava; o banco não criava o lembrete).
-- 2. concluir_offboarding (caminho antigo, sem checklist): recusado quando o processo tem checklist.
-- 3. reabrir_processo: o administrador reabre uma admissão/desligamento concluído por engano,
--    com motivo (fica no histórico e na conversa). No desligamento, a pessoa volta a "ativo".

-- 1 ------------------------------------------------------------------------------------------
create or replace function public.cancelar_processo(
  p_chamado text,
  p_motivo text,
  p_detalhe text,
  p_ciente boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eu     text := public.meu_colaborador_id();
  v_c      public.chamados%rowtype;
  v_feitos text;
begin
  if v_eu is null or coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Apenas a T.I. cancela uma admissão ou um desligamento.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_c from public.chamados where id = p_chamado for update;
  if not found or v_c.tipo not in ('onboarding', 'offboarding') or v_c.status in ('resolvido', 'cancelado') then
    raise exception 'Não é possível cancelar este processo.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_detalhe), '') = '' then
    raise exception 'Para cancelar uma admissão ou um desligamento, descreva o motivo.' using errcode = 'check_violation';
  end if;

  select string_agg(i.titulo, '; ' order by i.ordem) into v_feitos
    from public.processo_itens i
   where i.chamado_id = p_chamado and i.status = 'feito'
     and i.tipo in ('cadastro', 'conta', 'grupo_email', 'equipamento', 'acessorio', 'licenca', 'acesso_nexus',
                    'encerrar_recurso', 'devolver_equipamento', 'liberar_licenca', 'entregar_linha', 'liberar_linha');
  if v_feitos is not null and not coalesce(p_ciente, false) then
    raise exception 'Estes passos já foram feitos e precisam ser revertidos: %. Confirme que vai revertê-los para cancelar.', v_feitos
      using errcode = 'check_violation';
  end if;

  perform set_config('app.via_funcao', '1', true);
  update public.chamados
     set status = 'cancelado',
         cancelamento_motivo = p_motivo,
         cancelamento_detalhe = btrim(p_detalhe),
         cancelado_por = v_eu
   where id = p_chamado;
  perform set_config('app.via_funcao', '', true);

  if v_feitos is not null then
    insert into public.lembretes (titulo, descricao, vence_em, chamado_id, colaborador_id, criado_por)
    values ('Reverter passos do processo cancelado — ' || v_c.codigo,
            'Processo cancelado com passos já feitos. Reverter: ' || v_feitos || '. Motivo: ' || btrim(p_detalhe),
            current_date + 2, p_chamado, v_c.colaborador_id, v_eu);
  end if;
end;
$$;
revoke all on function public.cancelar_processo(text, text, text, boolean) from public, anon;
grant execute on function public.cancelar_processo(text, text, text, boolean) to authenticated;

-- 2 ------------------------------------------------------------------------------------------
create or replace function public.concluir_offboarding(p_chamado text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_chamado public.chamados%rowtype;
  v_colab   text;
  v_ativos  int := 0;
  v_lics    int := 0;
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Apenas a T.I. conclui desligamentos' using errcode = '42501';
  end if;

  select * into v_chamado from public.chamados where id = p_chamado for update;
  if not found then
    raise exception 'Chamado não encontrado ou sem permissão' using errcode = '42501';
  end if;
  if v_chamado.tipo <> 'offboarding' then
    raise exception 'O chamado não é de desligamento' using errcode = '23514';
  end if;
  if exists (select 1 from public.processo_itens where chamado_id = p_chamado) then
    raise exception 'Este desligamento tem checklist: conclua pelo checklist.' using errcode = '23514';
  end if;
  if v_chamado.status = 'resolvido' then
    raise exception 'Este desligamento já foi concluído' using errcode = '23514';
  end if;
  if v_chamado.status = 'cancelado' then
    raise exception 'Este desligamento foi cancelado' using errcode = '23514';
  end if;

  v_colab := v_chamado.offboarding ->> 'colaboradorId';
  if v_colab is null or not exists (select 1 from public.colaboradores where id = v_colab) then
    raise exception 'O chamado não identifica o colaborador a desligar' using errcode = '23514';
  end if;
  if auth.uid() is not null
     and exists (select 1 from public.colaboradores where id = v_colab and role <> 'colaborador')
     and public.meu_papel() <> 'ti_admin' then
    raise exception 'Apenas ti_admin desliga perfis de gestão (TI/RH)' using errcode = '42501';
  end if;

  update public.historico_custodia h
  set data_devolucao = current_date,
      motivo_devolucao = coalesce(h.motivo_devolucao, 'Devolução por desligamento (' || v_chamado.codigo || ')')
  where h.colaborador_id = v_colab and h.data_devolucao is null;

  update public.ativos
  set custodiante_id = null, status = 'disponivel', data_entrega_atual = null
  where custodiante_id = v_colab;
  get diagnostics v_ativos = row_count;

  update public.licencas_software
  set colaboradores_ids = colaboradores_ids - v_colab
  where colaboradores_ids ? v_colab;
  get diagnostics v_lics = row_count;

  update public.colaboradores set status = 'desligado' where id = v_colab;

  perform set_config('app.via_funcao', '1', true);
  update public.chamados
  set status = 'resolvido',
      offboarding = jsonb_set(
        v_chamado.offboarding,
        '{checklist}',
        coalesce((select jsonb_agg(item || '{"concluido": true}'::jsonb)
                  from jsonb_array_elements(v_chamado.offboarding -> 'checklist') item), '[]'::jsonb)
      )
  where id = p_chamado;
  perform set_config('app.via_funcao', '', true);

  return jsonb_build_object('colaboradorId', v_colab, 'ativosDevolvidos', v_ativos, 'licencasLiberadas', v_lics);
end;
$$;

-- 3 ------------------------------------------------------------------------------------------
create or replace function public.reabrir_processo(p_chamado text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eu text := public.meu_colaborador_id();
  v_c  public.chamados%rowtype;
begin
  if v_eu is null or coalesce(public.meu_papel(), '') <> 'ti_admin' then
    raise exception 'Só o administrador reabre um processo concluído.' using errcode = 'insufficient_privilege';
  end if;
  if length(coalesce(btrim(p_motivo), '')) < 5 then
    raise exception 'Explique por que o processo precisa ser reaberto.' using errcode = 'check_violation';
  end if;
  select * into v_c from public.chamados where id = p_chamado for update;
  if not found or v_c.tipo not in ('onboarding', 'offboarding') or v_c.status <> 'resolvido' then
    raise exception 'Só uma admissão ou um desligamento concluído pode ser reaberto.' using errcode = 'check_violation';
  end if;

  perform set_config('app.via_funcao', '1', true);
  perform set_config('app.motivo_evento', btrim(p_motivo), true);
  update public.chamados set status = 'em_andamento' where id = p_chamado;
  perform set_config('app.motivo_evento', '', true);
  perform set_config('app.via_funcao', '', true);

  -- Desligamento desfeito: a pessoa volta a ativa (equipamentos e licenças não voltam sozinhos)
  if v_c.tipo = 'offboarding' and v_c.colaborador_id is not null then
    update public.colaboradores set status = 'ativo' where id = v_c.colaborador_id and status = 'desligado';
  end if;

  insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_papel, texto, eh_nota_interna)
  select gen_random_uuid()::text, p_chamado, c.id, c.nome, c.role, 'Processo reaberto: ' || btrim(p_motivo), true
    from public.colaboradores c where c.id = v_eu;
end;
$$;
revoke all on function public.reabrir_processo(text, text) from public, anon;
grant execute on function public.reabrir_processo(text, text) to authenticated;
