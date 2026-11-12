-- ==============================================================================
-- FASE 6 · PROCESSOS GUIADOS DE ONBOARDING E OFFBOARDING
-- ------------------------------------------------------------------------------
-- Depende das Fases 1-3. Reexecutável. Sem DROP.
--
-- Princípio: o sistema SUGERE e a TI DECIDE. Cada passo é registrado
-- (quem, quando, observação) e o que foi entregue na entrada (contas,
-- grupos de e-mail, acessórios) forma o inventário usado na saída.
--
-- 1. catalogo_itens           sugestões editáveis pela TI (contas, grupos, equipamentos, acessórios)
-- 2. chamados.colaborador_id  a pessoa que entra/sai
-- 3. colaborador_recursos     inventário: contas, grupos de e-mail e acessórios sem patrimônio
-- 4. processo_itens           checklist auditável por chamado
-- 5. processo_eventos         trilha de auditoria do checklist (preenchida por trigger)
-- 6. lembretes                ações futuras com prazo (ex.: excluir conta em 30 dias)
-- 7. termos                   modelo do documento da Qualidade (RG.TI.002), itens com
--                             condição/situação, aceite eletrônico do colaborador e da TI
-- 8. RPCs                     registrar_item_processo, concluir_processo,
--                             aceitar_termo, dispensar_assinatura_termo
-- ==============================================================================

-- 1. Catálogo ----------------------------------------------------------------------
create table if not exists public.catalogo_itens (
  id                  text primary key default gen_random_uuid()::text,
  tipo                text not null check (tipo in ('conta', 'grupo_email', 'equipamento', 'acessorio', 'tarefa')),
  nome                text not null,
  descricao           text,
  sugerido_onboarding boolean not null default false,
  ativo               boolean not null default true,
  ordem               integer not null default 0,
  created_at          timestamptz not null default now(),
  unique (tipo, nome)
);

insert into public.catalogo_itens (tipo, nome, sugerido_onboarding, ordem) values
  ('conta', 'Microsoft 365', true, 10),
  ('conta', 'Google Workspace', true, 20),
  ('conta', 'Slack', true, 30),
  ('equipamento', 'Notebook', true, 10),
  ('equipamento', 'Monitor extra', false, 20),
  ('acessorio', 'Fonte do notebook', true, 10),
  ('acessorio', 'Suporte para notebook', true, 20),
  ('acessorio', 'Fone de ouvido', true, 30),
  ('acessorio', 'Teclado', false, 40),
  ('acessorio', 'Mouse', false, 50)
on conflict (tipo, nome) do nothing;

-- 2. Pessoa do processo -----------------------------------------------------------
alter table public.chamados
  add column if not exists colaborador_id text references public.colaboradores (id) on delete restrict;

update public.chamados
set colaborador_id = offboarding ->> 'colaboradorId'
where colaborador_id is null
  and tipo = 'offboarding'
  and offboarding ->> 'colaboradorId' in (select id from public.colaboradores);

create index if not exists idx_chamados_colaborador on public.chamados (colaborador_id);

-- 3. Inventário de recursos do colaborador ------------------------------------------
create table if not exists public.colaborador_recursos (
  id                   text primary key default gen_random_uuid()::text,
  colaborador_id       text not null references public.colaboradores (id) on delete restrict,
  tipo                 text not null check (tipo in ('conta', 'grupo_email', 'acessorio')),
  catalogo_id          text references public.catalogo_itens (id) on delete set null,
  nome                 text not null,
  identificador        text,
  status               text not null default 'ativo'
                         check (status in ('ativo', 'suspenso', 'excluido', 'mantido', 'transferido', 'devolvido')),
  concedido_em         timestamptz not null default now(),
  concedido_por        text references public.colaboradores (id) on delete set null,
  chamado_concessao    text references public.chamados (id) on delete set null,
  encerrado_em         timestamptz,
  encerrado_por        text references public.colaboradores (id) on delete set null,
  chamado_encerramento text references public.chamados (id) on delete set null,
  observacao           text
);
create index if not exists idx_recursos_colaborador on public.colaborador_recursos (colaborador_id, status);

-- 4. Checklist do processo ---------------------------------------------------------------
create table if not exists public.processo_itens (
  id                     text primary key default gen_random_uuid()::text,
  chamado_id             text not null references public.chamados (id) on delete restrict,
  tipo                   text not null check (tipo in (
                           'cadastro', 'conta', 'grupo_email', 'equipamento', 'acessorio', 'licenca', 'termo', 'acesso_nexus',
                           'encerrar_recurso', 'devolver_equipamento', 'liberar_licenca', 'dados_drive', 'email', 'tarefa')),
  titulo                 text not null,
  detalhe                text,
  sugerido_por           text not null default 'ti' check (sugerido_por in ('rh', 'ti', 'sistema')),
  status                 text not null default 'pendente' check (status in ('pendente', 'feito', 'nao_se_aplica')),
  observacao             text,
  catalogo_id            text references public.catalogo_itens (id) on delete set null,
  recurso_id             text references public.colaborador_recursos (id) on delete set null,
  ativo_id               text references public.ativos (id) on delete set null,
  licenca_id             text references public.licencas_software (id) on delete set null,
  identificador          text,
  destino                text check (destino in ('suspender', 'excluir', 'manter', 'transferir', 'outro')),
  destino_colaborador_id text references public.colaboradores (id) on delete set null,
  condicao               text check (condicao in ('bom', 'avaria')),
  lembrete_em            date,
  ordem                  integer not null default 0,
  criado_por             text references public.colaboradores (id) on delete set null,
  criado_em              timestamptz not null default now(),
  concluido_por          text references public.colaboradores (id) on delete set null,
  concluido_em           timestamptz,
  constraint chk_item_nao_se_aplica_justificado
    check (status <> 'nao_se_aplica' or coalesce(btrim(observacao), '') <> '')
);
create index if not exists idx_itens_chamado on public.processo_itens (chamado_id, ordem);

-- 5. Trilha de auditoria do checklist --------------------------------------------------------
create table if not exists public.processo_eventos (
  id         bigint generated always as identity primary key,
  chamado_id text not null,
  item_id    text,
  acao       text not null,
  detalhe    jsonb,
  por        text,
  em         timestamptz not null default now()
);
create index if not exists idx_eventos_chamado on public.processo_eventos (chamado_id, em);

-- 6. Lembretes --------------------------------------------------------------------------------
create table if not exists public.lembretes (
  id                   text primary key default gen_random_uuid()::text,
  titulo               text not null,
  descricao            text,
  vence_em             date not null,
  status               text not null default 'aberto' check (status in ('aberto', 'feito', 'cancelado')),
  chamado_id           text references public.chamados (id) on delete set null,
  colaborador_id       text references public.colaboradores (id) on delete set null,
  item_id              text references public.processo_itens (id) on delete set null,
  criado_por           text references public.colaboradores (id) on delete set null,
  criado_em            timestamptz not null default now(),
  concluido_por        text references public.colaboradores (id) on delete set null,
  concluido_em         timestamptz,
  observacao_conclusao text
);
create index if not exists idx_lembretes_status_venc on public.lembretes (status, vence_em);

-- 7. Termos: modelo da Qualidade, itens e aceite eletrônico ------------------------------------
alter table public.termos_responsabilidade
  add column if not exists chamado_id            text references public.chamados (id) on delete set null,
  add column if not exists itens                 jsonb not null default '[]'::jsonb,
  add column if not exists observacoes           text,
  add column if not exists local_unidade         text,
  add column if not exists doc_codigo            text,
  add column if not exists doc_versao            text,
  add column if not exists doc_referencia        text,
  add column if not exists doc_titulo            text,
  add column if not exists texto_clausula        text,
  add column if not exists hash_conteudo         text,
  add column if not exists aceite_colaborador_em timestamptz,
  add column if not exists aceite_colaborador_uid uuid,
  add column if not exists aceite_ti_em          timestamptz,
  add column if not exists aceite_ti_por         text references public.colaboradores (id) on delete set null,
  add column if not exists forma_assinatura      text not null default 'pendente',
  add column if not exists motivo_dispensa       text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_termo_forma_assinatura') then
    alter table public.termos_responsabilidade
      add constraint chk_termo_forma_assinatura
      check (forma_assinatura in ('pendente', 'eletronica', 'documento', 'dispensada'));
  end if;
end $$;

-- Termos já assinados por scan (Fase 3) passam a constar como "documento"
update public.termos_responsabilidade
set forma_assinatura = 'documento'
where status_assinatura = 'assinado' and forma_assinatura = 'pendente';

alter table public.configuracoes_empresa
  add column if not exists doc_entrega jsonb not null default
    '{"codigo":"RG.TI.001","versao":"01","referencia":"POP.TI.013","titulo":"Termo de Responsabilidade e Entrega de Equipamentos"}'::jsonb,
  add column if not exists doc_devolucao jsonb not null default
    '{"codigo":"RG.TI.002","versao":"02","referencia":"POP.TI.013","titulo":"Recibo de Devolução de Equipamento para o Setor de T.I."}'::jsonb;

-- ==============================================================================
-- Triggers
-- ==============================================================================

-- Quem/quando de cada item é definido pelo banco (o cliente não informa)
create or replace function public.processo_item_carimbar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(public.meu_colaborador_id(), new.criado_por);
    new.criado_em := now();
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status in ('feito', 'nao_se_aplica') then
      new.concluido_por := coalesce(public.meu_colaborador_id(), new.concluido_por);
      new.concluido_em := now();
    else
      new.concluido_por := null;
      new.concluido_em := null;
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger trg_processo_item_carimbar
  before insert or update on public.processo_itens
  for each row execute function public.processo_item_carimbar();

create or replace function public.processo_item_auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.processo_eventos (chamado_id, item_id, acao, detalhe, por)
    values (new.chamado_id, new.id, 'item_criado',
            jsonb_build_object('tipo', new.tipo, 'titulo', new.titulo), public.meu_colaborador_id());
  elsif tg_op = 'UPDATE' then
    insert into public.processo_eventos (chamado_id, item_id, acao, detalhe, por)
    values (new.chamado_id, new.id,
            case when new.status is distinct from old.status then 'status_' || new.status else 'item_alterado' end,
            jsonb_strip_nulls(jsonb_build_object(
              'titulo', new.titulo, 'de', old.status, 'para', new.status, 'observacao', new.observacao,
              'identificador', new.identificador, 'destino', new.destino, 'condicao', new.condicao,
              'lembrete_em', new.lembrete_em)),
            public.meu_colaborador_id());
  else
    insert into public.processo_eventos (chamado_id, item_id, acao, detalhe, por)
    values (old.chamado_id, old.id, 'item_removido',
            jsonb_build_object('tipo', old.tipo, 'titulo', old.titulo), public.meu_colaborador_id());
    return old;
  end if;
  return new;
end;
$$;

create or replace trigger trg_processo_item_auditar
  after insert or update or delete on public.processo_itens
  for each row execute function public.processo_item_auditar();

create or replace function public.lembrete_carimbar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(public.meu_colaborador_id(), new.criado_por);
    new.criado_em := now();
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status in ('feito', 'cancelado') then
      new.concluido_por := coalesce(public.meu_colaborador_id(), new.concluido_por);
      new.concluido_em := now();
    else
      new.concluido_por := null;
      new.concluido_em := null;
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger trg_lembrete_carimbar
  before insert or update on public.lembretes
  for each row execute function public.lembrete_carimbar();

revoke all on function public.processo_item_carimbar() from public, anon, authenticated;
revoke all on function public.processo_item_auditar() from public, anon, authenticated;
revoke all on function public.lembrete_carimbar() from public, anon, authenticated;

-- ==============================================================================
-- RLS
-- ==============================================================================
alter table public.catalogo_itens enable row level security;
alter table public.colaborador_recursos enable row level security;
alter table public.processo_itens enable row level security;
alter table public.processo_eventos enable row level security;
alter table public.lembretes enable row level security;

revoke all on public.catalogo_itens, public.colaborador_recursos, public.processo_itens,
              public.processo_eventos, public.lembretes from anon;
grant select, insert, update, delete on public.catalogo_itens, public.colaborador_recursos,
              public.processo_itens, public.lembretes to authenticated;
grant select on public.processo_eventos to authenticated;

do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('catalogo_itens', 'colaborador_recursos', 'processo_itens', 'processo_eventos', 'lembretes')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy catalogo_ler on public.catalogo_itens for select to authenticated
  using (public.meu_papel() is not null);
create policy catalogo_gravar on public.catalogo_itens for all to authenticated
  using (public.meu_papel() in ('ti_admin', 'ti_suporte'))
  with check (public.meu_papel() in ('ti_admin', 'ti_suporte'));

create policy recurso_ler on public.colaborador_recursos for select to authenticated
  using (public.meu_papel() in ('ti_admin', 'ti_suporte', 'rh') or colaborador_id = public.meu_colaborador_id());
create policy recurso_gravar on public.colaborador_recursos for all to authenticated
  using (public.meu_papel() in ('ti_admin', 'ti_suporte'))
  with check (public.meu_papel() in ('ti_admin', 'ti_suporte'));

-- RH acompanha os itens dos chamados que ele enxerga (on/offboarding)
create policy item_ler on public.processo_itens for select to authenticated
  using (
    public.meu_papel() in ('ti_admin', 'ti_suporte')
    or (public.meu_papel() = 'rh' and exists (select 1 from public.chamados c where c.id = chamado_id))
  );
create policy item_gravar on public.processo_itens for all to authenticated
  using (public.meu_papel() in ('ti_admin', 'ti_suporte'))
  with check (public.meu_papel() in ('ti_admin', 'ti_suporte'));

create policy evento_ler on public.processo_eventos for select to authenticated
  using (
    public.meu_papel() in ('ti_admin', 'ti_suporte')
    or (public.meu_papel() = 'rh' and exists (select 1 from public.chamados c where c.id = chamado_id))
  );

create policy lembrete_ti on public.lembretes for all to authenticated
  using (public.meu_papel() in ('ti_admin', 'ti_suporte'))
  with check (public.meu_papel() in ('ti_admin', 'ti_suporte'));

-- ==============================================================================
-- RPC: registrar um item do checklist (com o efeito colateral, numa transação)
-- ==============================================================================
create or replace function public.registrar_item_processo(
  p_item text,
  p_status text,
  p_observacao text default null,
  p_dados jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_item     public.processo_itens%rowtype;
  v_chamado  public.chamados%rowtype;
  v_colab    text;
  v_hoje     date := current_date;
  v_eu       text := public.meu_colaborador_id();
  v_recurso  text;
  v_ativo    public.ativos%rowtype;
  v_destino  text := nullif(p_dados ->> 'destino', '');
  v_condicao text := nullif(p_dados ->> 'condicao', '');
  v_lembrete date := nullif(p_dados ->> 'lembrete_em', '')::date;
  v_ident    text := nullif(btrim(coalesce(p_dados ->> 'identificador', '')), '');
  v_novo_rec text;
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Apenas a T.I. registra os passos do processo' using errcode = '42501';
  end if;
  if p_status not in ('pendente', 'feito', 'nao_se_aplica') then
    raise exception 'Situação inválida: %', p_status using errcode = '23514';
  end if;

  select * into v_item from public.processo_itens where id = p_item for update;
  if not found then
    raise exception 'Item não encontrado ou sem permissão' using errcode = '42501';
  end if;
  select * into v_chamado from public.chamados where id = v_item.chamado_id for update;
  if v_chamado.status in ('resolvido', 'cancelado') then
    raise exception 'O chamado % já foi encerrado', v_chamado.codigo using errcode = '23514';
  end if;

  -- Itens com efeito no inventário não "voltam": desfazer é pela ficha do ativo/colaborador
  if v_item.status = 'feito' and p_status <> 'feito'
     and v_item.tipo in ('cadastro', 'conta', 'grupo_email', 'equipamento', 'acessorio', 'licenca',
                         'encerrar_recurso', 'devolver_equipamento', 'liberar_licenca') then
    raise exception 'Este passo já alterou o inventário e não pode ser reaberto. Ajuste pela ficha do colaborador ou do ativo.'
      using errcode = '23514';
  end if;
  if p_status = 'nao_se_aplica' and coalesce(btrim(p_observacao), '') = '' then
    raise exception 'Informe o motivo para marcar como "não se aplica"' using errcode = '23514';
  end if;

  v_colab := v_chamado.colaborador_id;

  if p_status = 'feito' and v_item.status <> 'feito' then
    -- Cadastro do colaborador (onboarding): liga o chamado à pessoa
    if v_item.tipo = 'cadastro' then
      v_colab := p_dados ->> 'colaborador_id';
      if v_colab is null or not exists (select 1 from public.colaboradores where id = v_colab) then
        raise exception 'Informe o colaborador cadastrado' using errcode = '23514';
      end if;
      update public.chamados set colaborador_id = v_colab where id = v_chamado.id;

    elsif v_colab is null then
      raise exception 'Faça primeiro o passo "Cadastrar colaborador"' using errcode = '23514';

    elsif v_item.tipo in ('conta', 'grupo_email', 'acessorio') then
      if v_item.tipo <> 'acessorio' and v_ident is null then
        raise exception 'Informe o login, e-mail ou nome do grupo criado' using errcode = '23514';
      end if;
      insert into public.colaborador_recursos
        (colaborador_id, tipo, catalogo_id, nome, identificador, concedido_por, chamado_concessao, observacao)
      values (v_colab, v_item.tipo, v_item.catalogo_id, v_item.titulo, v_ident, v_eu, v_chamado.id, p_observacao)
      returning id into v_novo_rec;
      update public.processo_itens set recurso_id = v_novo_rec, identificador = v_ident where id = v_item.id;

    elsif v_item.tipo = 'equipamento' then
      select * into v_ativo from public.ativos where id = p_dados ->> 'ativo_id' for update;
      if not found then
        raise exception 'Escolha o equipamento (ativo) entregue' using errcode = '23514';
      end if;
      if v_ativo.custodiante_id is not null or v_ativo.status <> 'disponivel' then
        raise exception 'O ativo % não está disponível no estoque', v_ativo.tag using errcode = '23514';
      end if;
      update public.ativos
      set custodiante_id = v_colab, status = 'em_uso', data_entrega_atual = v_hoje
      where id = v_ativo.id;
      insert into public.historico_custodia (id, ativo_id, colaborador_id, colaborador_nome, data_entrega, observacoes)
      select 'cust-' || gen_random_uuid(), v_ativo.id, c.id, c.nome, v_hoje, 'Entrega no onboarding ' || v_chamado.codigo
      from public.colaboradores c where c.id = v_colab;
      update public.processo_itens set ativo_id = v_ativo.id, identificador = v_ativo.tag where id = v_item.id;

    elsif v_item.tipo = 'licenca' then
      if p_dados ->> 'licenca_id' is null then
        raise exception 'Escolha a licença' using errcode = '23514';
      end if;
      perform public.alocar_licenca(p_dados ->> 'licenca_id', v_colab);
      update public.processo_itens set licenca_id = p_dados ->> 'licenca_id' where id = v_item.id;

    elsif v_item.tipo = 'encerrar_recurso' then
      if v_item.recurso_id is null then
        raise exception 'Item sem recurso vinculado' using errcode = '23514';
      end if;
      if (select tipo from public.colaborador_recursos where id = v_item.recurso_id) = 'acessorio' then
        update public.colaborador_recursos
        set status = 'devolvido', encerrado_em = now(), encerrado_por = v_eu, chamado_encerramento = v_chamado.id,
            observacao = coalesce(p_observacao, observacao)
        where id = v_item.recurso_id;
      else
        if v_destino is null then
          raise exception 'Escolha o destino da conta (suspender, excluir, manter, transferir ou outro)' using errcode = '23514';
        end if;
        update public.colaborador_recursos
        set status = case v_destino when 'suspender' then 'suspenso' when 'excluir' then 'excluido'
                                    when 'transferir' then 'transferido' else 'mantido' end,
            encerrado_em = now(), encerrado_por = v_eu, chamado_encerramento = v_chamado.id,
            observacao = coalesce(p_observacao, observacao)
        where id = v_item.recurso_id;
      end if;

    elsif v_item.tipo = 'devolver_equipamento' then
      if v_condicao is null then
        raise exception 'Informe a condição do equipamento (bom ou avaria)' using errcode = '23514';
      end if;
      update public.historico_custodia
      set data_devolucao = v_hoje,
          motivo_devolucao = 'Devolução no desligamento ' || v_chamado.codigo || ' — condição: ' || v_condicao
      where ativo_id = v_item.ativo_id and colaborador_id = v_colab and data_devolucao is null;
      update public.ativos
      set custodiante_id = null, data_entrega_atual = null,
          status = case when v_condicao = 'avaria' then 'manutencao' else 'disponivel' end
      where id = v_item.ativo_id and custodiante_id = v_colab;

    elsif v_item.tipo = 'liberar_licenca' then
      perform public.revogar_licenca(v_item.licenca_id, v_colab);
    end if;
  end if;

  update public.processo_itens
  set status = p_status,
      observacao = coalesce(p_observacao, observacao),
      destino = coalesce(v_destino, destino),
      destino_colaborador_id = coalesce(nullif(p_dados ->> 'destino_colaborador_id', ''), destino_colaborador_id),
      condicao = coalesce(v_condicao, condicao),
      lembrete_em = coalesce(v_lembrete, lembrete_em),
      identificador = coalesce(v_ident, identificador)
  where id = v_item.id;

  if v_lembrete is not null then
    insert into public.lembretes (titulo, descricao, vence_em, chamado_id, colaborador_id, item_id)
    values (v_item.titulo || coalesce(' — ' || v_destino, ''), p_observacao, v_lembrete, v_chamado.id, v_colab, v_item.id);
  end if;

  return jsonb_build_object('item', v_item.id, 'status', p_status, 'colaboradorId', v_colab);
end;
$$;

-- ==============================================================================
-- RPC: concluir o processo (onboarding ou offboarding com checklist)
-- ==============================================================================
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
    -- Nada pode ficar com a pessoa sem decisão registrada
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

  -- Termo pendente não trava a conclusão (assinatura pode vir depois), mas vira lembrete
  if v_termo_pend > 0 and not exists (
    select 1 from public.lembretes where chamado_id = p_chamado and status = 'aberto' and titulo like 'Coletar assinatura do termo%'
  ) then
    insert into public.lembretes (titulo, descricao, vence_em, chamado_id, colaborador_id)
    values ('Coletar assinatura do termo — ' || v_chamado.codigo,
            'Processo concluído com o termo ainda sem assinatura. Anexe o documento assinado ou registre a dispensa.',
            current_date + 7, p_chamado, v_chamado.colaborador_id);
  end if;

  update public.chamados set status = 'resolvido' where id = p_chamado;

  return jsonb_build_object('chamado', v_chamado.codigo, 'termoPendente', v_termo_pend > 0);
end;
$$;

-- ==============================================================================
-- RPC: aceite eletrônico do termo (colaborador e TI) e dispensa
-- ==============================================================================
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
  if v_t.forma_assinatura in ('documento', 'dispensada') or v_t.status_assinatura = 'assinado' then
    raise exception 'Este termo já foi encerrado (%).', v_t.forma_assinatura using errcode = '23514';
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

create or replace function public.dispensar_assinatura_termo(p_termo text, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Apenas a T.I. pode dispensar a assinatura' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da dispensa' using errcode = '23514';
  end if;
  update public.termos_responsabilidade
  set forma_assinatura = 'dispensada', motivo_dispensa = p_motivo, status_assinatura = 'recusado'
  where id = p_termo and status_assinatura <> 'assinado';
  if not found then
    raise exception 'Termo não encontrado, já assinado ou sem permissão' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.registrar_item_processo(text, text, text, jsonb) from public, anon;
revoke all on function public.concluir_processo(text) from public, anon;
revoke all on function public.aceitar_termo(text) from public, anon;
revoke all on function public.dispensar_assinatura_termo(text, text) from public, anon;
grant execute on function public.registrar_item_processo(text, text, text, jsonb) to authenticated;
grant execute on function public.concluir_processo(text) to authenticated;
grant execute on function public.aceitar_termo(text) to authenticated;
grant execute on function public.dispensar_assinatura_termo(text, text) to authenticated;
