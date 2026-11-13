-- Fase 10 · Atendimento profissional (chamados)
-- Chamado como registro de atendimento: solução documentada (causa, solução,
-- definitiva/paliativa), cancelamento com motivo, reabertura, avaliação e
-- histórico automático de cada mudança. Sem confirmação de quem abriu:
-- registrar a solução encerra o chamado.
-- Reexecutável e sem DROP: só colunas novas, tabela nova, gatilhos e funções.

-- 1. Colunas do chamado ---------------------------------------------------------------
alter table public.chamados
  add column if not exists resolucao_causa text
    constraint chk_chamado_resolucao_causa
    check (resolucao_causa in ('hardware', 'configuracao', 'software', 'rede', 'acesso', 'uso', 'fornecedor', 'outro')),
  add column if not exists resolucao_solucao text,
  add column if not exists resolucao_tipo text
    constraint chk_chamado_resolucao_tipo check (resolucao_tipo in ('definitiva', 'paliativa')),
  add column if not exists resolucao_proximo_passo text,
  add column if not exists resolucao_tempo_min integer
    constraint chk_chamado_resolucao_tempo check (resolucao_tempo_min >= 0),
  add column if not exists resolvido_por text references public.colaboradores (id) on delete set null,
  add column if not exists resolvido_em timestamptz,
  add column if not exists cancelamento_motivo text
    constraint chk_chamado_cancelamento_motivo check (cancelamento_motivo in ('duplicado', 'engano', 'sem_retorno', 'outro')),
  add column if not exists cancelamento_detalhe text,
  add column if not exists cancelado_por text references public.colaboradores (id) on delete set null,
  add column if not exists reaberturas integer not null default 0,
  add column if not exists avaliacao smallint
    constraint chk_chamado_avaliacao check (avaliacao between 1 and 5),
  add column if not exists avaliacao_comentario text,
  add column if not exists aguardando_motivo text
    constraint chk_chamado_aguardando_motivo check (aguardando_motivo in ('peca', 'fornecedor', 'solicitante'));

-- 2. Regras de encerramento (chamados de suporte) -----------------------------------
-- Resolver exige causa, solução e tipo; cancelar exige motivo. Admissão e
-- desligamento são encerrados pelo próprio processo (checklist) e não entram aqui.
create or replace function public.validar_encerramento_chamado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from 'aguardando_terceiro' then
    new.aguardando_motivo := null;
  end if;
  if new.tipo = 'suporte' then
    if new.status = 'resolvido' and old.status is distinct from 'resolvido'
       and (new.resolucao_causa is null or coalesce(btrim(new.resolucao_solucao), '') = '' or new.resolucao_tipo is null) then
      raise exception 'Para encerrar o chamado, registre a causa e a solução.' using errcode = 'check_violation';
    end if;
    if new.status = 'cancelado' and old.status is distinct from 'cancelado' and new.cancelamento_motivo is null then
      raise exception 'Para cancelar o chamado, informe o motivo.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validar_encerramento_chamado() from public, anon, authenticated;

create or replace trigger trg_validar_encerramento_chamado
  before update on public.chamados
  for each row execute function public.validar_encerramento_chamado();

-- 3. Histórico automático -------------------------------------------------------------
create table if not exists public.chamado_eventos (
  id         text primary key default gen_random_uuid()::text,
  chamado_id text not null references public.chamados (id) on delete restrict,
  tipo       text not null check (tipo in ('aberto', 'status', 'tecnico', 'prioridade', 'vinculo',
                                           'resolvido', 'cancelado', 'reaberto', 'avaliado')),
  de         text,
  para       text,
  detalhe    text,
  autor_id   text references public.colaboradores (id) on delete set null,
  criado_em  timestamptz not null default now()
);
create index if not exists idx_chamado_eventos_chamado on public.chamado_eventos (chamado_id, criado_em);

alter table public.chamado_eventos enable row level security;
revoke all on public.chamado_eventos from anon;
grant select on public.chamado_eventos to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chamado_eventos'
                 and policyname = 'chamado_evento_ler') then
    -- Quem enxerga o chamado (pela RLS de chamados) enxerga o histórico dele
    create policy chamado_evento_ler on public.chamado_eventos for select to authenticated
      using (exists (select 1 from public.chamados c where c.id = chamado_id));
  end if;
end $$;

-- Grava um evento a cada mudança relevante. O motivo de uma reabertura chega
-- pela variável de sessão app.motivo_evento (definida pela função reabrir_chamado).
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

create or replace trigger trg_evento_chamado
  after insert or update on public.chamados
  for each row execute function public.registrar_evento_chamado();

-- 4. Ações (funções) -------------------------------------------------------------------

-- Registrar a solução: só a T.I.; encerra o chamado.
create or replace function public.resolver_chamado(
  p_chamado text,
  p_causa text,
  p_solucao text,
  p_tipo text,
  p_proximo_passo text default null,
  p_tempo_min integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Apenas a T.I. registra a solução de um chamado.' using errcode = 'insufficient_privilege';
  end if;
  if length(coalesce(btrim(p_solucao), '')) < 10 then
    raise exception 'Descreva a solução com pelo menos 10 caracteres.' using errcode = 'check_violation';
  end if;
  if p_tipo = 'paliativa' and coalesce(btrim(p_proximo_passo), '') = '' then
    raise exception 'Solução paliativa: informe o próximo passo.' using errcode = 'check_violation';
  end if;

  update public.chamados
     set status = 'resolvido',
         resolucao_causa = p_causa,
         resolucao_solucao = btrim(p_solucao),
         resolucao_tipo = p_tipo,
         resolucao_proximo_passo = nullif(btrim(coalesce(p_proximo_passo, '')), ''),
         resolucao_tempo_min = p_tempo_min,
         resolvido_por = public.meu_colaborador_id(),
         resolvido_em = now(),
         avaliacao = null,
         avaliacao_comentario = null
   where id = p_chamado and status not in ('resolvido', 'cancelado');
  if not found then
    raise exception 'Chamado não encontrado ou já encerrado.' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Cancelar: a T.I. cancela qualquer chamado em aberto; quem abriu cancela o
-- próprio enquanto ninguém começou a atender (status "aberto").
create or replace function public.cancelar_chamado(p_chamado text, p_motivo text, p_detalhe text default null)
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
  if p_motivo = 'outro' and coalesce(btrim(p_detalhe), '') = '' then
    raise exception 'Motivo "outro": descreva o motivo do cancelamento.' using errcode = 'check_violation';
  end if;

  update public.chamados
     set status = 'cancelado',
         cancelamento_motivo = p_motivo,
         cancelamento_detalhe = nullif(btrim(coalesce(p_detalhe, '')), ''),
         cancelado_por = v_eu
   where id = p_chamado
     and status not in ('resolvido', 'cancelado')
     and (v_ti or (solicitante_id = v_eu and status = 'aberto'));
  if not found then
    raise exception 'Não é possível cancelar este chamado.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Reabrir: quem abriu ou a T.I., com motivo. A solução anterior fica no histórico.
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
    raise exception 'Não é possível reabrir este chamado.' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('app.motivo_evento', '', true);

  -- O motivo também entra na conversa, para a T.I. ver no atendimento
  insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_papel, texto, eh_nota_interna)
  select gen_random_uuid()::text, p_chamado, c.id, c.nome, c.role, 'Reaberto: ' || btrim(p_motivo), false
    from public.colaboradores c where c.id = v_eu;
end;
$$;

-- Avaliar: só quem abriu, depois de encerrado.
create or replace function public.avaliar_chamado(p_chamado text, p_nota integer, p_comentario text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_nota is null or p_nota < 1 or p_nota > 5 then
    raise exception 'A avaliação vai de 1 a 5.' using errcode = 'check_violation';
  end if;
  update public.chamados
     set avaliacao = p_nota,
         avaliacao_comentario = nullif(btrim(coalesce(p_comentario, '')), '')
   where id = p_chamado and status = 'resolvido' and solicitante_id = public.meu_colaborador_id();
  if not found then
    raise exception 'Só quem abriu avalia, depois do chamado encerrado.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke all on function public.resolver_chamado(text, text, text, text, text, integer) from public, anon;
revoke all on function public.cancelar_chamado(text, text, text) from public, anon;
revoke all on function public.reabrir_chamado(text, text) from public, anon;
revoke all on function public.avaliar_chamado(text, integer, text) from public, anon;
grant execute on function public.resolver_chamado(text, text, text, text, text, integer) to authenticated;
grant execute on function public.cancelar_chamado(text, text, text) to authenticated;
grant execute on function public.reabrir_chamado(text, text) to authenticated;
grant execute on function public.avaliar_chamado(text, integer, text) to authenticated;
