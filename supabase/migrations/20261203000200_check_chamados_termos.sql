-- Correções da revisão geral (chamados, termos e checklist). Sem DROP de tabela ou coluna;
-- só funções (create or replace) e gatilhos novos. Reexecutável.
--
-- 1. Chamado encerrado aceita o desvínculo por exclusão (ativo/software/linha indo para null),
--    para que limpar_base e o "on delete set null" funcionem; o resto continua barrado.
-- 10. Chamado de suporte encerrado só volta a ficar aberto por reabrir_chamado (não por UPDATE direto).
-- 2/3. aceitar_termo: contestação aberta bloqueia as duas assinaturas; só aceita termo "pendente".
-- 4. contestar/responder: lembrete para a T.I.; responder recusa termo cancelado.
-- 6/7. processo_itens: não duplica passo (nem com duas abas); não inclui nem apaga passo de
--      processo encerrado, nem apaga passo já feito (acesso direto à tabela; as funções do
--      sistema, que rodam como dono, seguem livres).
-- 8. concluir_processo: admissão só conclui com o colaborador cadastrado.
-- 9. 1ª resposta: quem abriu o chamado não conta como "T.I. respondeu".

-- 1 e 10 ------------------------------------------------------------------------------------
create or replace function public.chamado_encerrado_somente_leitura()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and old.tipo = 'suporte'
     and old.status in ('resolvido', 'cancelado') then
    if new.status is distinct from old.status then
      -- Voltar para aberto/em atendimento/aguardando só pela função de reabrir
      if new.status not in ('resolvido', 'cancelado')
         and coalesce(current_setting('app.via_funcao', true), '') <> '1' then
        raise exception 'Chamado encerrado só volta a ficar aberto pelo botão "Reabrir".'
          using errcode = 'check_violation';
      end if;
    elsif (new.tecnico_responsavel_id is distinct from old.tecnico_responsavel_id
           -- vínculo indo para null = o item ligado foi excluído (on delete set null): permitido
           or (new.ativo_id is distinct from old.ativo_id and new.ativo_id is not null)
           or (new.software_id is distinct from old.software_id and new.software_id is not null)
           or (new.linha_id is distinct from old.linha_id and new.linha_id is not null)
           or new.colaborador_id is distinct from old.colaborador_id
           or new.titulo is distinct from old.titulo
           or new.categoria is distinct from old.categoria
           or new.prioridade is distinct from old.prioridade) then
      raise exception 'Chamado encerrado não pode ser alterado. Reabra o chamado para mudar algo.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.chamado_encerrado_somente_leitura() from public, anon, authenticated;

-- reabrir_chamado (Fase 10) agora marca a transação como "via função"
create or replace function public.reabrir_chamado(p_chamado text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ti boolean := coalesce(public.meu_papel(), '') in ('ti_admin', 'ti_suporte');
  v_eu text := public.meu_colaborador_id();
begin
  if v_eu is null then
    raise exception 'Sessão sem colaborador.' using errcode = 'insufficient_privilege';
  end if;
  if length(coalesce(btrim(p_motivo), '')) < 5 then
    raise exception 'Explique por que o problema continua.' using errcode = 'check_violation';
  end if;

  perform set_config('app.motivo_evento', btrim(p_motivo), true);
  perform set_config('app.via_funcao', '1', true);
  update public.chamados
     set status = case when tecnico_responsavel_id is null then 'aberto' else 'em_andamento' end,
         reaberturas = reaberturas + 1,
         resolucao_causa = null,
         resolucao_solucao = null,
         resolucao_tipo = null,
         resolucao_proximo_passo = null,
         resolucao_tempo_min = null,
         resolvido_por = null,
         resolvido_em = null,
         avaliacao = null,
         avaliacao_comentario = null
   where id = p_chamado
     and status = 'resolvido'
     and tipo = 'suporte'
     and (v_ti or solicitante_id = v_eu);
  if not found then
    perform set_config('app.motivo_evento', '', true);
    perform set_config('app.via_funcao', '', true);
    raise exception 'Não é possível reabrir este chamado.' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('app.motivo_evento', '', true);
  perform set_config('app.via_funcao', '', true);

  -- O motivo também entra na conversa, para a T.I. ver no atendimento
  insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_papel, texto, eh_nota_interna)
  select gen_random_uuid()::text, p_chamado, c.id, c.nome, c.role, 'Reaberto: ' || btrim(p_motivo), false
    from public.colaboradores c where c.id = v_eu;
end;
$$;
revoke all on function public.reabrir_chamado(text, text) from public, anon;
grant execute on function public.reabrir_chamado(text, text) to authenticated;

-- 9 -----------------------------------------------------------------------------------------
create or replace function public.carimbar_primeira_resposta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.primeira_resposta_em is null
     and coalesce(public.meu_papel(), '') in ('ti_admin', 'ti_suporte')
     -- quem abriu o chamado não responde a si mesmo (mesma regra das mensagens)
     and new.solicitante_id is distinct from public.meu_colaborador_id()
     and (new.status is distinct from old.status
          or new.tecnico_responsavel_id is distinct from old.tecnico_responsavel_id) then
    new.primeira_resposta_em := now();
  end if;
  return new;
end;
$$;
revoke all on function public.carimbar_primeira_resposta() from public, anon, authenticated;

-- 2 e 3 -------------------------------------------------------------------------------------
create or replace function public.aceitar_termo(p_termo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t     public.termos_responsabilidade%rowtype;
  v_eu    text := public.meu_colaborador_id();
  v_papel text := public.meu_papel();
  v_hash  text;
begin
  select * into v_t from public.termos_responsabilidade where id = p_termo for update;
  if not found or v_eu is null then
    raise exception 'Termo não encontrado ou sem permissão' using errcode = '42501';
  end if;
  -- (termo cancelado: o gatilho proteger_termo recusa a gravação com a mensagem própria)
  if v_t.forma_assinatura in ('documento', 'dispensada') or v_t.status_assinatura = 'assinado' then
    raise exception 'Este termo já foi encerrado (%).', v_t.forma_assinatura using errcode = '23514';
  end if;
  -- O aceite eletrônico só vale para termo em aberto (forma "pendente"); sem forma definida, recusa
  if v_t.forma_assinatura is distinct from 'pendente' then
    raise exception 'Este termo não está aberto para assinatura eletrônica.' using errcode = '23514';
  end if;
  -- Colaborador contestou e a T.I. ainda não respondeu: ninguém assina antes
  if v_t.contestacao_em is not null and v_t.contestacao_respondida_em is null then
    raise exception 'Aguardando resposta da T.I. à contestação: o termo não pode ser assinado agora.'
      using errcode = '23514';
  end if;

  -- "Impressão digital" do conteúdo aceito: prova que o termo não mudou depois
  v_hash := coalesce(v_t.hash_conteudo, encode(sha256(convert_to(jsonb_build_object(
    'codigo', v_t.codigo, 'tipo', v_t.tipo, 'colaborador', v_t.colaborador_id, 'nome', v_t.colaborador_nome,
    'ativos', v_t.ativo_ids, 'itens', v_t.itens, 'clausula', v_t.texto_clausula, 'documento', v_t.doc_codigo,
    'versao', v_t.doc_versao)::text, 'UTF8')), 'hex'));

  if v_eu = v_t.colaborador_id then
    if v_t.aceite_colaborador_em is not null then
      raise exception 'Você já aceitou este termo' using errcode = '23514';
    end if;
    update public.termos_responsabilidade
    set aceite_colaborador_em = now(), aceite_colaborador_uid = auth.uid(), hash_conteudo = v_hash
    where id = p_termo;
  elsif v_papel in ('ti_admin', 'ti_suporte') then
    if v_t.aceite_ti_em is not null then
      raise exception 'A T.I. já assinou este termo' using errcode = '23514';
    end if;
    update public.termos_responsabilidade
    set aceite_ti_em = now(), aceite_ti_por = v_eu, hash_conteudo = v_hash
    where id = p_termo;
  else
    raise exception 'Só o colaborador do termo ou a T.I. podem assinar' using errcode = '42501';
  end if;

  update public.termos_responsabilidade
  set status_assinatura = 'assinado', data_assinatura = now(), forma_assinatura = 'eletronica'
  where id = p_termo and aceite_colaborador_em is not null and aceite_ti_em is not null;

  return (select jsonb_build_object('colaborador', aceite_colaborador_em is not null, 'ti', aceite_ti_em is not null,
                                    'assinado', status_assinatura = 'assinado', 'hash', hash_conteudo)
          from public.termos_responsabilidade where id = p_termo);
end;
$$;
revoke all on function public.aceitar_termo(text) from public, anon;
grant execute on function public.aceitar_termo(text) to authenticated;

-- 4 -----------------------------------------------------------------------------------------
-- Ao contestar, a T.I. ganha um lembrete (o aviso ao colaborador fica na própria ficha do termo:
-- não existe canal de aviso para o colaborador no sistema)
create or replace function public.contestar_termo(p_termo text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t  public.termos_responsabilidade%rowtype;
  v_eu text := public.meu_colaborador_id();
begin
  select * into v_t from public.termos_responsabilidade where id = p_termo for update;
  if not found or v_eu is null or v_t.colaborador_id is distinct from v_eu then
    raise exception 'Só o colaborador do termo pode contestá-lo.' using errcode = '42501';
  end if;
  if v_t.aceite_colaborador_em is not null or v_t.status_assinatura = 'assinado'
     or v_t.forma_assinatura in ('documento', 'dispensada') or v_t.cancelado_em is not null then
    raise exception 'Este termo não está mais aberto para contestação.' using errcode = '23514';
  end if;
  if length(coalesce(btrim(p_motivo), '')) < 5 then
    raise exception 'Explique o que está errado no termo.' using errcode = '23514';
  end if;
  update public.termos_responsabilidade
     set contestacao_motivo = btrim(p_motivo), contestacao_em = now(),
         contestacao_resposta = null, contestacao_respondida_em = null, contestacao_respondida_por = null
   where id = p_termo;

  if not exists (
    select 1 from public.lembretes
     where status = 'aberto' and titulo = 'Responder contestação do termo — ' || v_t.codigo
  ) then
    insert into public.lembretes (titulo, descricao, vence_em, chamado_id, colaborador_id, criado_por)
    values ('Responder contestação do termo — ' || v_t.codigo,
            v_t.colaborador_nome || ' contestou o termo: ' || btrim(p_motivo),
            current_date + 2, v_t.chamado_id, v_t.colaborador_id, v_eu);
  end if;
end;
$$;
revoke all on function public.contestar_termo(text, text) from public, anon;
grant execute on function public.contestar_termo(text, text) to authenticated;

create or replace function public.responder_contestacao(p_termo text, p_resposta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.termos_responsabilidade%rowtype;
begin
  if coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Só a T.I. responde a contestação de um termo.' using errcode = '42501';
  end if;
  if length(coalesce(btrim(p_resposta), '')) < 5 then
    raise exception 'Escreva a resposta ao colaborador.' using errcode = '23514';
  end if;
  select * into v_t from public.termos_responsabilidade where id = p_termo for update;
  if found and v_t.cancelado_em is not null then
    raise exception 'Este termo foi cancelado: não há o que responder.' using errcode = '23514';
  end if;
  update public.termos_responsabilidade
     set contestacao_resposta = btrim(p_resposta), contestacao_respondida_em = now(),
         contestacao_respondida_por = public.meu_colaborador_id()
   where id = p_termo and contestacao_em is not null and contestacao_respondida_em is null;
  if not found then
    raise exception 'Este termo não tem contestação aguardando resposta.' using errcode = '23514';
  end if;
  -- Respondida: o lembrete da T.I. se cumpriu
  update public.lembretes
     set status = 'feito', concluido_em = now(), concluido_por = public.meu_colaborador_id()
   where status = 'aberto' and titulo = 'Responder contestação do termo — ' || v_t.codigo;
end;
$$;
revoke all on function public.responder_contestacao(text, text) from public, anon;
grant execute on function public.responder_contestacao(text, text) to authenticated;

-- 6 e 7 -------------------------------------------------------------------------------------
-- Gatilho (e não índice único): não falha com dados antigos que já tenham passo repetido.
create or replace function public.proteger_processo_itens()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_op = 'INSERT' then
    select c.status into v_status from public.chamados c where c.id = new.chamado_id;
    -- Funções do sistema rodam como dono; só o acesso direto (login do app) é limitado
    if current_user in ('authenticated', 'anon') and v_status in ('resolvido', 'cancelado') then
      raise exception 'O processo já foi encerrado: não dá para incluir passos.' using errcode = 'check_violation';
    end if;
    -- Duas abas/duplo clique: a segunda gravação espera a primeira e vê o passo já salvo
    perform pg_advisory_xact_lock(hashtext('processo_itens:' || new.chamado_id));
    if exists (
      select 1 from public.processo_itens i
       where i.chamado_id = new.chamado_id
         and i.tipo = new.tipo
         and i.titulo = new.titulo
         and i.detalhe is not distinct from new.detalhe
         and i.catalogo_id is not distinct from new.catalogo_id
         and i.recurso_id is not distinct from new.recurso_id
         and i.ativo_id is not distinct from new.ativo_id
         and i.licenca_id is not distinct from new.licenca_id
         and i.linha_id is not distinct from new.linha_id
         and i.identificador is not distinct from new.identificador
         and i.status = 'pendente'
    ) then
      raise exception 'Este passo já está no checklist (o checklist pode ter sido salvo em outra tela). Atualize a página.'
        using errcode = 'unique_violation';
    end if;
    return new;
  end if;

  -- DELETE
  if current_user in ('authenticated', 'anon') then
    select c.status into v_status from public.chamados c where c.id = old.chamado_id;
    if v_status in ('resolvido', 'cancelado') then
      raise exception 'O processo já foi encerrado: os passos não podem ser removidos.' using errcode = 'check_violation';
    end if;
    if old.status = 'feito' then
      raise exception 'Este passo já foi feito e não pode ser removido do checklist.' using errcode = 'check_violation';
    end if;
  end if;
  return old;
end;
$$;
revoke all on function public.proteger_processo_itens() from public, anon, authenticated;

create or replace trigger trg_proteger_processo_itens_ins
  before insert on public.processo_itens
  for each row execute function public.proteger_processo_itens();
create or replace trigger trg_proteger_processo_itens_del
  before delete on public.processo_itens
  for each row execute function public.proteger_processo_itens();

-- 8 -----------------------------------------------------------------------------------------
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

  -- Admissão sem a pessoa cadastrada (passo "Cadastro" marcado como "não se aplica") não conclui
  if v_chamado.tipo = 'onboarding' and v_chamado.colaborador_id is null then
    raise exception 'A admissão ainda não tem o colaborador cadastrado. Faça o passo "Cadastro" (não pode ficar como "não se aplica") antes de concluir.'
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
revoke all on function public.concluir_processo(text) from public, anon;
grant execute on function public.concluir_processo(text) to authenticated;
