-- ==============================================================================
-- LOTE 1 · ESTABILIZAÇÃO (críticos) + LICENÇAS E FORNECEDORES
-- ------------------------------------------------------------------------------
-- Reexecutável e sem DROP: só colunas novas, tabela nova, índices, gatilhos e
-- funções (create or replace).
--
-- 1. Processos (admissão/desligamento) só encerram pelas funções; não reabrem
-- 2. cancelar_chamado: processo só pela T.I., com motivo e sem passo que mexeu no inventário
-- 3. Um desligamento aberto por pessoa (índice único parcial)
-- 4. limpar_base: limpeza completa numa transação, só ti_admin
-- 5. 1ª resposta ignora a mensagem do próprio solicitante
-- 6. Colaborador: reativar desligado só ti_admin; e-mail de quem tem login não muda
-- 7. Admissão só se liga a pessoa ativa
-- 8. Termo: cancelar/substituir com motivo; termo cancelado não muda mais
-- 9. Licença ativa/inativa (motivo; reativar só ti_admin); assentos >= em uso
-- 10. Histórico de assentos (licenca_atribuicoes), alimentado por gatilho
-- 11. Fatura própria recusada para licença coberta por contrato de licenciamento vigente
-- ==============================================================================

-- 1. Processos ----------------------------------------------------------------------
-- As funções que podem encerrar processo marcam a transação com app.via_funcao = '1'.
create or replace function public.proteger_processo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Processo não vira outro tipo (escaparia destas regras e do índice de desligamento)
  if old.tipo in ('onboarding', 'offboarding') and new.tipo is distinct from old.tipo and auth.uid() is not null then
    raise exception 'O tipo de uma admissão ou de um desligamento não pode ser alterado.' using errcode = 'check_violation';
  end if;
  if old.tipo in ('onboarding', 'offboarding')
     and auth.uid() is not null
     and new.status is distinct from old.status
     and coalesce(current_setting('app.via_funcao', true), '') <> '1' then
    if old.status in ('resolvido', 'cancelado') then
      raise exception 'Processo encerrado não pode ser reaberto.' using errcode = 'check_violation';
    end if;
    if new.status in ('resolvido', 'cancelado') then
      raise exception 'Admissão e desligamento só se encerram por "Concluir" (checklist) ou "Cancelar" com motivo.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- 7. Admissão só se liga a uma pessoa ativa
  if new.tipo = 'onboarding'
     and new.colaborador_id is not null
     and new.colaborador_id is distinct from old.colaborador_id
     and not exists (select 1 from public.colaboradores c where c.id = new.colaborador_id and c.status = 'ativo') then
    raise exception 'A admissão só pode ser ligada a uma pessoa ativa.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_processo() from public, anon, authenticated;

create or replace trigger trg_proteger_processo
  before update on public.chamados
  for each row execute function public.proteger_processo();

-- concluir_processo (Fase 6) com a marca da função e recusa de processo cancelado
create or replace function public.concluir_processo(p_chamado text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_chamado    public.chamados%rowtype;
  v_pendentes  int;
  v_termo_pend int;
  v_restante   text;
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Apenas a T.I. conclui o processo' using errcode = '42501';
  end if;

  select * into v_chamado from public.chamados where id = p_chamado for update;
  if not found then
    raise exception 'Chamado não encontrado ou sem permissão' using errcode = '42501';
  end if;
  if v_chamado.tipo not in ('onboarding', 'offboarding') then
    raise exception 'O chamado não é de admissão nem de desligamento' using errcode = '23514';
  end if;
  if v_chamado.status = 'resolvido' then
    raise exception 'Este processo já foi concluído' using errcode = '23514';
  end if;
  if v_chamado.status = 'cancelado' then
    raise exception 'Este processo foi cancelado' using errcode = '23514';
  end if;
  if not exists (select 1 from public.processo_itens where chamado_id = p_chamado) then
    raise exception 'Monte o checklist antes de concluir' using errcode = '23514';
  end if;

  select count(*) filter (where status = 'pendente' and tipo <> 'termo'),
         count(*) filter (where status = 'pendente' and tipo = 'termo')
  into v_pendentes, v_termo_pend
  from public.processo_itens where chamado_id = p_chamado;

  if v_pendentes > 0 then
    raise exception 'Ainda há % passo(s) pendente(s). Conclua ou marque como "não se aplica" com o motivo.', v_pendentes
      using errcode = '23514';
  end if;

  if v_chamado.tipo = 'offboarding' then
    if v_chamado.colaborador_id is null then
      raise exception 'O chamado não identifica o colaborador' using errcode = '23514';
    end if;
    if auth.uid() is not null
       and exists (select 1 from public.colaboradores where id = v_chamado.colaborador_id and role <> 'colaborador')
       and public.meu_papel() <> 'ti_admin' then
      raise exception 'Apenas ti_admin desliga perfis de gestão (TI/RH)' using errcode = '42501';
    end if;
    select string_agg(x, '; ') into v_restante from (
      select count(*) || ' equipamento(s) sob custódia' as x from public.ativos
       where custodiante_id = v_chamado.colaborador_id having count(*) > 0
      union all
      select count(*) || ' licença(s) alocada(s)' from public.licencas_software
       where colaboradores_ids ? v_chamado.colaborador_id having count(*) > 0
      union all
      select count(*) || ' conta(s)/grupo(s)/acessório(s) ainda ativos' from public.colaborador_recursos
       where colaborador_id = v_chamado.colaborador_id and status = 'ativo' having count(*) > 0
    ) r;
    if v_restante is not null then
      raise exception 'Ainda vinculado ao colaborador: %. Inclua esses itens no checklist.', v_restante
        using errcode = '23514';
    end if;
    update public.colaboradores set status = 'desligado' where id = v_chamado.colaborador_id;
  end if;

  if v_termo_pend > 0 and not exists (
    select 1 from public.lembretes where chamado_id = p_chamado and status = 'aberto' and titulo like 'Coletar assinatura do termo%'
  ) then
    insert into public.lembretes (titulo, descricao, vence_em, chamado_id, colaborador_id)
    values ('Coletar assinatura do termo — ' || v_chamado.codigo,
            'Processo concluído com o termo ainda sem assinatura. Anexe o documento assinado ou registre a dispensa.',
            current_date + 7, p_chamado, v_chamado.colaborador_id);
  end if;

  perform set_config('app.via_funcao', '1', true);
  update public.chamados set status = 'resolvido' where id = p_chamado;
  perform set_config('app.via_funcao', '', true);

  return jsonb_build_object('chamado', v_chamado.codigo, 'termoPendente', v_termo_pend > 0);
end;
$$;

-- concluir_offboarding (Fase 3, desligamento sem checklist) com a marca da função
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

-- 2. Cancelar -----------------------------------------------------------------------
-- Admissão/desligamento: só a T.I., com a descrição do motivo. Se algum passo já
-- mudou o inventário ou o acesso (cadastro, conta, equipamento, licença, login...),
-- a T.I. precisa declarar que vai reverter (p_ciente) e o banco cria um lembrete
-- com a lista do que reverter. Sem a ciência, recusa e lista os passos.
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
                    'encerrar_recurso', 'devolver_equipamento', 'liberar_licenca');
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

-- Suporte: a T.I. cancela qualquer um em aberto; quem abriu cancela o próprio
-- enquanto ninguém começou a atender. Processo vai para cancelar_processo (sem ciência).
create or replace function public.cancelar_chamado(p_chamado text, p_motivo text, p_detalhe text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ti     boolean := coalesce(public.meu_papel(), '') in ('ti_admin', 'ti_suporte');
  v_eu     text := public.meu_colaborador_id();
  v_c      public.chamados%rowtype;
begin
  if v_eu is null then
    raise exception 'Sessão sem colaborador.' using errcode = 'insufficient_privilege';
  end if;
  if p_motivo = 'outro' and coalesce(btrim(p_detalhe), '') = '' then
    raise exception 'Motivo "outro": descreva o motivo do cancelamento.' using errcode = 'check_violation';
  end if;

  select * into v_c from public.chamados where id = p_chamado for update;
  if not found
     or v_c.status in ('resolvido', 'cancelado')
     or not (v_ti or (v_c.solicitante_id = v_eu and v_c.status = 'aberto' and v_c.tipo = 'suporte')) then
    raise exception 'Não é possível cancelar este chamado.' using errcode = 'insufficient_privilege';
  end if;

  if v_c.tipo in ('onboarding', 'offboarding') then
    perform public.cancelar_processo(p_chamado, p_motivo, p_detalhe, false);
    return;
  end if;

  perform set_config('app.via_funcao', '1', true);
  update public.chamados
     set status = 'cancelado',
         cancelamento_motivo = p_motivo,
         cancelamento_detalhe = nullif(btrim(coalesce(p_detalhe, '')), ''),
         cancelado_por = v_eu
   where id = p_chamado;
  perform set_config('app.via_funcao', '', true);
end;
$$;

revoke all on function public.cancelar_chamado(text, text, text) from public, anon;
grant execute on function public.cancelar_chamado(text, text, text) to authenticated;

-- 3. Um desligamento aberto por pessoa ----------------------------------------------
-- Se já houver duplicados, para com uma mensagem clara (nada desta migration é gravado)
do $$
declare
  v_dup text;
begin
  select string_agg(pessoa || ' (' || n || ')', ', ') into v_dup from (
    select coalesce(colaborador_id, offboarding ->> 'colaboradorId') as pessoa, count(*) as n
      from public.chamados
     where tipo = 'offboarding' and status not in ('resolvido', 'cancelado')
     group by 1 having count(*) > 1
  ) d;
  if v_dup is not null then
    raise exception 'Há desligamentos abertos em duplicidade para: %. Cancele os repetidos antes de aplicar.', v_dup;
  end if;
end $$;

create unique index if not exists uq_desligamento_aberto
  on public.chamados ((coalesce(colaborador_id, offboarding ->> 'colaboradorId')))
  where tipo = 'offboarding' and status not in ('resolvido', 'cancelado');

-- 4. Limpar base (modo de implantação) ---------------------------------------------
-- Tudo numa transação: ou apaga tudo, ou nada. Mantém configurações, setores,
-- catálogo, quem executa e o e-mail informado.
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

  delete from public.ativo_anexos where true;
  delete from public.manutencoes where true;
  delete from public.faturas where true;
  delete from public.contrato_itens where true;
  delete from public.lembretes where true;
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

  -- Quem fica não pode apontar para um gestor que sai
  update public.colaboradores set gestor_id = null
   where gestor_id is not null
     and (id = v_eu or lower(email) = lower(coalesce(p_manter_email, '')));
  delete from public.colaboradores
   where id is distinct from v_eu
     and lower(email) is distinct from lower(coalesce(p_manter_email, ''));
end;
$$;

-- 5. 1ª resposta: a mensagem de quem abriu não conta --------------------------------
create or replace function public.carimbar_resposta_mensagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.eh_nota_interna and new.autor_papel in ('ti_admin', 'ti_suporte') then
    update public.chamados
       set primeira_resposta_em = now()
     where id = new.chamado_id
       and primeira_resposta_em is null
       and solicitante_id is distinct from new.autor_id;
  end if;
  return new;
end;
$$;

-- 6. Colaborador: reativação e e-mail de quem tem login -----------------------------
-- (nome "trg_guard_colaborador_status": roda depois de trg_guard_colaborador_role
--  e antes de trg_vincular_colaborador_auth)
create or replace function public.guard_colaborador_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := auth.jwt();
begin
  if v_claims is null or coalesce(v_claims ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if old.status = 'desligado' and new.status is distinct from 'desligado'
     and coalesce(public.meu_papel(), '') <> 'ti_admin' then
    raise exception 'Só o administrador da T.I. reativa uma pessoa desligada.' using errcode = '42501';
  end if;
  -- Trocar o e-mail sem trocar o login derruba o acesso: fica bloqueado até existir
  -- a troca de login. Desvincular o login (anonimização) continua possível.
  if old.auth_user_id is not null and new.auth_user_id is not null
     and lower(new.email) is distinct from lower(old.email) then
    raise exception 'Esta pessoa já tem login: o e-mail não pode ser trocado aqui.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_colaborador_status() from public, anon, authenticated;

create or replace trigger trg_guard_colaborador_status
  before update on public.colaboradores
  for each row execute function public.guard_colaborador_status();

-- 8. Termo: cancelar / substituir ----------------------------------------------------
alter table public.termos_responsabilidade
  add column if not exists cancelado_em        timestamptz,
  add column if not exists cancelado_por       text references public.colaboradores (id) on delete set null,
  add column if not exists cancelamento_motivo text,
  add column if not exists substituido_por     text references public.termos_responsabilidade (id) on delete set null;

create or replace function public.proteger_termo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  -- (cancelado_por/substituido_por indo para null é a chave estrangeira "on delete set null": permitido)
  if ((new.cancelado_em, new.cancelamento_motivo) is distinct from (old.cancelado_em, old.cancelamento_motivo)
      or (new.cancelado_por is not null and new.cancelado_por is distinct from old.cancelado_por)
      or (new.substituido_por is not null and new.substituido_por is distinct from old.substituido_por))
     and coalesce(current_setting('app.via_funcao', true), '') <> '1' then
    raise exception 'Use "Cancelar/substituir termo".' using errcode = 'check_violation';
  end if;
  if old.cancelado_em is not null
     and (new.status_assinatura, new.forma_assinatura, new.aceite_colaborador_em, new.aceite_ti_em,
          new.itens, new.arquivo_url, new.ativo_ids, new.data_assinatura)
         is distinct from
         (old.status_assinatura, old.forma_assinatura, old.aceite_colaborador_em, old.aceite_ti_em,
          old.itens, old.arquivo_url, old.ativo_ids, old.data_assinatura) then
    raise exception 'Este termo foi cancelado e não pode mais ser alterado nem assinado.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_termo() from public, anon, authenticated;

create or replace trigger trg_proteger_termo
  before update on public.termos_responsabilidade
  for each row execute function public.proteger_termo();

create or replace function public.cancelar_termo(p_termo text, p_motivo text, p_substituto text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_t public.termos_responsabilidade%rowtype;
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Apenas a T.I. cancela ou substitui termos' using errcode = '42501';
  end if;
  if length(coalesce(btrim(p_motivo), '')) < 5 then
    raise exception 'Explique o motivo do cancelamento.' using errcode = '23514';
  end if;
  select * into v_t from public.termos_responsabilidade where id = p_termo for update;
  if not found then
    raise exception 'Termo não encontrado ou sem permissão' using errcode = '42501';
  end if;
  if v_t.cancelado_em is not null then
    raise exception 'Este termo já foi cancelado' using errcode = '23514';
  end if;
  if p_substituto is not null and (
       p_substituto = p_termo
       or not exists (select 1 from public.termos_responsabilidade s
                       where s.id = p_substituto and s.colaborador_id = v_t.colaborador_id and s.cancelado_em is null)) then
    raise exception 'O termo substituto precisa ser da mesma pessoa e estar válido.' using errcode = '23514';
  end if;

  perform set_config('app.via_funcao', '1', true);
  update public.termos_responsabilidade
     set cancelado_em = now(),
         cancelado_por = public.meu_colaborador_id(),
         cancelamento_motivo = btrim(p_motivo),
         substituido_por = p_substituto
   where id = p_termo;
  perform set_config('app.via_funcao', '', true);
end;
$$;

revoke all on function public.cancelar_termo(text, text, text) from public, anon;
grant execute on function public.cancelar_termo(text, text, text) to authenticated;

-- 9. Licença ativa/inativa --------------------------------------------------------------
alter table public.licencas_software
  add column if not exists status            text not null default 'ativa',
  add column if not exists inativada_em      timestamptz,
  add column if not exists inativada_por     text references public.colaboradores (id) on delete set null,
  add column if not exists inativacao_motivo text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_licenca_status') then
    alter table public.licencas_software
      add constraint chk_licenca_status check (status in ('ativa', 'inativa'));
  end if;
end $$;

create or replace function public.proteger_licenca()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_em_uso int := jsonb_array_length(coalesce(new.colaboradores_ids, '[]'::jsonb));
begin
  if tg_op = 'INSERT' then
    if new.status <> 'ativa' then
      raise exception 'Licença nova começa ativa.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.assentos_totais is distinct from old.assentos_totais and new.assentos_totais < v_em_uso then
    raise exception 'Assentos totais (%) não podem ser menos que os % em uso.', new.assentos_totais, v_em_uso
      using errcode = 'check_violation';
  end if;

  if old.status = 'ativa' and new.status = 'inativa' then
    if length(coalesce(btrim(new.inativacao_motivo), '')) < 5 then
      raise exception 'Informe o motivo da inativação.' using errcode = 'check_violation';
    end if;
    if v_em_uso > 0 then
      raise exception 'Libere os % assento(s) em uso antes de inativar a licença.', v_em_uso using errcode = 'check_violation';
    end if;
    new.inativada_em := now();
    new.inativada_por := public.meu_colaborador_id();
  elsif old.status = 'inativa' and new.status = 'ativa' then
    if auth.uid() is not null and coalesce(public.meu_papel(), '') <> 'ti_admin' then
      raise exception 'Só o administrador da T.I. reativa uma licença.' using errcode = '42501';
    end if;
    -- A próxima inativação pede um motivo novo
    new.inativacao_motivo := null;
    new.inativada_em := null;
    new.inativada_por := null;
  end if;

  if new.status = 'inativa'
     and not (coalesce(new.colaboradores_ids, '[]'::jsonb) <@ coalesce(old.colaboradores_ids, '[]'::jsonb)) then
    raise exception 'Licença inativa não recebe assentos.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_licenca() from public, anon, authenticated;

create or replace trigger trg_proteger_licenca
  before insert or update on public.licencas_software
  for each row execute function public.proteger_licenca();

-- 10. Histórico de assentos ---------------------------------------------------------------
create table if not exists public.licenca_atribuicoes (
  id             text primary key default gen_random_uuid()::text,
  -- Trilha de auditoria: não some com exclusões (licença com histórico se inativa, não se exclui)
  licenca_id     text not null references public.licencas_software (id) on delete restrict,
  colaborador_id text not null references public.colaboradores (id) on delete restrict,
  inicio         timestamptz default now(), -- null = já tinha o assento antes deste histórico
  fim            timestamptz,
  atribuido_por  text references public.colaboradores (id) on delete set null,
  removido_por   text references public.colaboradores (id) on delete set null
);
create unique index if not exists uq_licenca_atribuicao_aberta
  on public.licenca_atribuicoes (licenca_id, colaborador_id) where fim is null;
create index if not exists idx_licenca_atribuicoes_colab on public.licenca_atribuicoes (colaborador_id);

alter table public.licenca_atribuicoes enable row level security;
revoke all on public.licenca_atribuicoes from anon;
grant select on public.licenca_atribuicoes to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'licenca_atribuicoes'
                 and policyname = 'licenca_atribuicao_ler') then
    create policy licenca_atribuicao_ler on public.licenca_atribuicoes for select to authenticated
      using (public.meu_papel() in ('ti_admin', 'ti_suporte') or colaborador_id = public.meu_colaborador_id());
  end if;
end $$;

create or replace function public.registrar_atribuicao_licenca()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eu  text := public.meu_colaborador_id();
  v_old jsonb := case when tg_op = 'UPDATE' then coalesce(old.colaboradores_ids, '[]'::jsonb) else '[]'::jsonb end;
  v_new jsonb := coalesce(new.colaboradores_ids, '[]'::jsonb);
begin
  insert into public.licenca_atribuicoes (licenca_id, colaborador_id, atribuido_por)
  select new.id, c.id, v_eu
    from jsonb_array_elements_text(v_new) x(id)
    join public.colaboradores c on c.id = x.id
   where not (v_old ? x.id)
  on conflict (licenca_id, colaborador_id) where fim is null do nothing;

  update public.licenca_atribuicoes
     set fim = now(), removido_por = v_eu
   where licenca_id = new.id and fim is null and not (v_new ? colaborador_id);
  return null;
end;
$$;

revoke all on function public.registrar_atribuicao_licenca() from public, anon, authenticated;

create or replace trigger trg_registrar_atribuicao_licenca
  after insert or update of colaboradores_ids on public.licencas_software
  for each row execute function public.registrar_atribuicao_licenca();

-- Carga inicial: quem já ocupa assento hoje (início desconhecido)
insert into public.licenca_atribuicoes (licenca_id, colaborador_id, inicio)
select l.id, c.id, null
  from public.licencas_software l
  cross join lateral jsonb_array_elements_text(coalesce(l.colaboradores_ids, '[]'::jsonb)) x(id)
  join public.colaboradores c on c.id = x.id
on conflict (licenca_id, colaborador_id) where fim is null do nothing;

-- 11. Fatura de licença x contrato de licenciamento ---------------------------------------
create or replace function public.validar_fatura_licenca()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_contrato text;
begin
  if new.licenca_id is not null and new.status <> 'cancelada'
     and (tg_op = 'INSERT'
          or new.licenca_id is distinct from old.licenca_id
          or new.competencia is distinct from old.competencia
          or old.status = 'cancelada') then
    select coalesce(nullif(btrim(c.numero), ''), c.descricao) into v_contrato
      from public.contrato_itens ci
      join public.contratos c on c.id = ci.contrato_id
     where ci.licenca_id = new.licenca_id
       and c.tipo = 'licenciamento'
       and c.inicio <= (new.competencia + interval '1 month' - interval '1 day')::date
       and (c.fim is null or c.fim >= new.competencia)
     limit 1;
    if v_contrato is not null then
      raise exception 'Esta licença é paga pelo contrato %: lance a fatura no contrato.', v_contrato
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validar_fatura_licenca() from public, anon, authenticated;

create or replace trigger trg_validar_fatura_licenca
  before insert or update on public.faturas
  for each row execute function public.validar_fatura_licenca();

revoke all on function public.limpar_base(text, text) from public, anon;
grant execute on function public.limpar_base(text, text) to authenticated;
