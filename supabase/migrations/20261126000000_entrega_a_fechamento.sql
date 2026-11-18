-- Entrega A — fechamento do sistema atual (seção 11 da documentação).
-- Sem DROP de tabela ou coluna. A única troca é a regra (check) dos tipos de evento do
-- chamado, que ganha 'dados' (título e categoria corrigidos pela T.I.) — mesmo padrão da seção 6.
--
-- 1. Chamado ligado a uma linha telefônica (chamados.linha_id) + histórico do vínculo.
-- 2. Histórico de título e categoria corrigidos (evento 'dados').
-- 3. Contestação do termo pelo colaborador (motivo) e resposta da T.I.
-- 4. limpar_base também apaga linhas, histórico de linhas, estoque e anexos de contrato
--    (unidades ficam, como setores e catálogo: são cadastro da empresa).

-- 1 ------------------------------------------------------------------------------------------
alter table public.chamados
  add column if not exists linha_id text references public.linhas_telefonicas (id) on delete set null;
create index if not exists idx_chamados_linha on public.chamados (linha_id);

-- 2 ------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'chamado_eventos_tipo_check') then
    alter table public.chamado_eventos drop constraint chamado_eventos_tipo_check;
  end if;
  alter table public.chamado_eventos add constraint chamado_eventos_tipo_check
    check (tipo in ('aberto', 'status', 'tecnico', 'prioridade', 'vinculo', 'dados',
                    'resolvido', 'cancelado', 'reaberto', 'avaliado'));
end $$;

create or replace function public.registrar_evento_chamado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor text := public.meu_colaborador_id();
  v_motivo text := nullif(current_setting('app.motivo_evento', true), '');
  v_tipo text;
begin
  if tg_op = 'INSERT' then
    insert into public.chamado_eventos (chamado_id, tipo, para, autor_id)
    values (new.id, 'aberto', new.status, coalesce(v_autor, new.solicitante_id));
    return new;
  end if;

  if new.status is distinct from old.status then
    v_tipo := case
      when new.status = 'resolvido' then 'resolvido'
      when new.status = 'cancelado' then 'cancelado'
      when old.status in ('resolvido', 'cancelado') then 'reaberto'
      else 'status' end;
    insert into public.chamado_eventos (chamado_id, tipo, de, para, detalhe, autor_id)
    values (new.id, v_tipo, old.status, new.status,
      case v_tipo
        when 'resolvido' then new.resolucao_solucao
        when 'cancelado' then coalesce(new.cancelamento_detalhe, new.cancelamento_motivo)
        when 'reaberto' then v_motivo
        else new.aguardando_motivo end,
      v_autor);
  elsif new.status = 'aguardando_terceiro' and new.aguardando_motivo is distinct from old.aguardando_motivo then
    insert into public.chamado_eventos (chamado_id, tipo, de, para, detalhe, autor_id)
    values (new.id, 'status', old.status, new.status, new.aguardando_motivo, v_autor);
  end if;

  if new.tecnico_responsavel_id is distinct from old.tecnico_responsavel_id then
    insert into public.chamado_eventos (chamado_id, tipo, de, para, autor_id)
    values (new.id, 'tecnico', old.tecnico_responsavel_nome, new.tecnico_responsavel_nome, v_autor);
  end if;

  if new.prioridade is distinct from old.prioridade then
    insert into public.chamado_eventos (chamado_id, tipo, de, para, autor_id)
    values (new.id, 'prioridade', old.prioridade, new.prioridade, v_autor);
  end if;

  if new.titulo is distinct from old.titulo then
    insert into public.chamado_eventos (chamado_id, tipo, de, para, detalhe, autor_id)
    values (new.id, 'dados', old.titulo, new.titulo, 'título', v_autor);
  end if;

  if new.categoria is distinct from old.categoria then
    insert into public.chamado_eventos (chamado_id, tipo, de, para, detalhe, autor_id)
    values (new.id, 'dados', old.categoria, new.categoria, 'categoria', v_autor);
  end if;

  if new.ativo_id is distinct from old.ativo_id then
    insert into public.chamado_eventos (chamado_id, tipo, de, para, detalhe, autor_id)
    values (new.id, 'vinculo',
      (select a.tag from public.ativos a where a.id = old.ativo_id),
      (select a.tag from public.ativos a where a.id = new.ativo_id), 'equipamento', v_autor);
  end if;

  if new.software_id is distinct from old.software_id then
    insert into public.chamado_eventos (chamado_id, tipo, de, para, detalhe, autor_id)
    values (new.id, 'vinculo', old.software_nome, new.software_nome, 'software', v_autor);
  end if;

  if new.linha_id is distinct from old.linha_id then
    insert into public.chamado_eventos (chamado_id, tipo, de, para, detalhe, autor_id)
    values (new.id, 'vinculo',
      (select l.numero from public.linhas_telefonicas l where l.id = old.linha_id),
      (select l.numero from public.linhas_telefonicas l where l.id = new.linha_id), 'linha', v_autor);
  end if;

  if new.colaborador_id is distinct from old.colaborador_id then
    insert into public.chamado_eventos (chamado_id, tipo, de, para, detalhe, autor_id)
    values (new.id, 'vinculo',
      (select c.nome from public.colaboradores c where c.id = old.colaborador_id),
      (select c.nome from public.colaboradores c where c.id = new.colaborador_id), 'colaborador', v_autor);
  end if;

  if new.avaliacao is not null and new.avaliacao is distinct from old.avaliacao then
    insert into public.chamado_eventos (chamado_id, tipo, para, detalhe, autor_id)
    values (new.id, 'avaliado', new.avaliacao::text, new.avaliacao_comentario, v_autor);
  end if;

  return new;
end;
$$;
revoke all on function public.registrar_evento_chamado() from public, anon, authenticated;

-- 3 ------------------------------------------------------------------------------------------
alter table public.termos_responsabilidade
  add column if not exists contestacao_motivo        text,
  add column if not exists contestacao_em            timestamptz,
  add column if not exists contestacao_resposta      text,
  add column if not exists contestacao_respondida_em timestamptz,
  add column if not exists contestacao_respondida_por text references public.colaboradores (id) on delete set null;

-- O colaborador do termo contesta (antes de aceitar), com motivo
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
end;
$$;
revoke all on function public.contestar_termo(text, text) from public, anon;
grant execute on function public.contestar_termo(text, text) to authenticated;

-- A T.I. responde a contestação (o termo correto, se for o caso, é gerado como "termo atualizado")
create or replace function public.responder_contestacao(p_termo text, p_resposta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Só a T.I. responde a contestação de um termo.' using errcode = '42501';
  end if;
  if length(coalesce(btrim(p_resposta), '')) < 5 then
    raise exception 'Escreva a resposta ao colaborador.' using errcode = '23514';
  end if;
  update public.termos_responsabilidade
     set contestacao_resposta = btrim(p_resposta), contestacao_respondida_em = now(),
         contestacao_respondida_por = public.meu_colaborador_id()
   where id = p_termo and contestacao_em is not null and contestacao_respondida_em is null;
  if not found then
    raise exception 'Este termo não tem contestação aguardando resposta.' using errcode = '23514';
  end if;
end;
$$;
revoke all on function public.responder_contestacao(text, text) from public, anon;
grant execute on function public.responder_contestacao(text, text) to authenticated;

-- 4 ------------------------------------------------------------------------------------------
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
