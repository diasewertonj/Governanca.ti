-- ==============================================================================
-- FASE 2 · INTEGRIDADE DE DADOS
-- ------------------------------------------------------------------------------
-- Depende da Fase 1 (RLS por papel). Reexecutável.
--
-- 1. Códigos de chamado (#CH-AAAA-NNNN) e termo (#TR-AAAA-NNNN) gerados pelo
--    banco, por sequence (ALTO-05: o cliente calculava length+1 e colidia).
-- 2. data_atualizacao do chamado mantida pelo banco em todo UPDATE.
-- 3. ativos.setor_id (MED-03: o front mandava e o banco descartava).
-- 4. Alocação/revogação de licença atômica por RPC (ALTO-04: duas pessoas
--    alocando ao mesmo tempo perdiam uma alocação). Respeita a RLS.
-- 5. Índices nas chaves estrangeiras e colunas filtradas (MED-07).
-- 6. Trilha de auditoria protegida (ALTO-06): excluir colaborador ou ativo com
--    histórico, chamados, mensagens ou termos passa a ser BLOQUEADO
--    (antes apagava tudo em cascata). Use status 'desligado' / 'descartado'.
-- 7. CHECKs simples de sanidade.
-- ==============================================================================

-- 1. Códigos gerados pelo banco -------------------------------------------------
create sequence if not exists public.seq_codigo_chamado;
create sequence if not exists public.seq_codigo_termo;

select setval('public.seq_codigo_chamado', greatest((select count(*) from public.chamados), 1),
              (select count(*) from public.chamados) > 0)
where (select last_value from public.seq_codigo_chamado) = 1
  and not (select is_called from public.seq_codigo_chamado);
select setval('public.seq_codigo_termo', greatest((select count(*) from public.termos_responsabilidade), 1),
              (select count(*) from public.termos_responsabilidade) > 0)
where (select last_value from public.seq_codigo_termo) = 1
  and not (select is_called from public.seq_codigo_termo);

create or replace function public.gerar_codigo_chamado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.codigo := '#CH-' || to_char(now(), 'YYYY') || '-'
                || lpad(nextval('public.seq_codigo_chamado')::text, 4, '0');
  return new;
end;
$$;

create or replace function public.gerar_codigo_termo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.codigo := '#TR-' || to_char(now(), 'YYYY') || '-'
                || lpad(nextval('public.seq_codigo_termo')::text, 4, '0');
  return new;
end;
$$;

revoke all on function public.gerar_codigo_chamado() from public, anon, authenticated;
revoke all on function public.gerar_codigo_termo() from public, anon, authenticated;

create or replace trigger trg_gerar_codigo_chamado
  before insert on public.chamados
  for each row execute function public.gerar_codigo_chamado();

create or replace trigger trg_gerar_codigo_termo
  before insert on public.termos_responsabilidade
  for each row execute function public.gerar_codigo_termo();

-- 2. data_atualizacao pelo banco -------------------------------------------------
create or replace function public.tocar_data_atualizacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.data_atualizacao := now();
  return new;
end;
$$;

revoke all on function public.tocar_data_atualizacao() from public, anon, authenticated;

create or replace trigger trg_tocar_data_atualizacao
  before update on public.chamados
  for each row execute function public.tocar_data_atualizacao();

-- 3. Setor do ativo ---------------------------------------------------------------
alter table public.ativos
  add column if not exists setor_id text references public.departamentos (id) on delete set null;

-- 4. Alocação de licença atômica (SECURITY INVOKER: a RLS decide quem pode) -------
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

create or replace function public.revogar_licenca(p_licenca text, p_colaborador text)
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
  update public.licencas_software l
  set colaboradores_ids = coalesce(l.colaboradores_ids, '[]'::jsonb) - p_colaborador
  where l.id = p_licenca
  returning l.colaboradores_ids into v_ids;

  if v_ids is null then
    raise exception 'Licença não encontrada ou sem permissão' using errcode = '42501';
  end if;
  return v_ids;
end;
$$;

revoke all on function public.alocar_licenca(text, text) from public, anon;
revoke all on function public.revogar_licenca(text, text) from public, anon;
grant execute on function public.alocar_licenca(text, text) to authenticated;
grant execute on function public.revogar_licenca(text, text) to authenticated;

-- 5. Índices ---------------------------------------------------------------------
create index if not exists idx_colaboradores_setor on public.colaboradores (setor_id);
create index if not exists idx_colaboradores_gestor on public.colaboradores (gestor_id);
create index if not exists idx_ativos_custodiante on public.ativos (custodiante_id);
create index if not exists idx_ativos_setor on public.ativos (setor_id);
create index if not exists idx_custodia_ativo on public.historico_custodia (ativo_id, data_entrega);
create index if not exists idx_custodia_colaborador on public.historico_custodia (colaborador_id);
create index if not exists idx_chamados_solicitante on public.chamados (solicitante_id);
create index if not exists idx_chamados_tecnico on public.chamados (tecnico_responsavel_id);
create index if not exists idx_chamados_ativo on public.chamados (ativo_id);
create index if not exists idx_chamados_software on public.chamados (software_id);
create index if not exists idx_chamados_status_data on public.chamados (status, data_criacao desc);
create index if not exists idx_mensagens_chamado on public.chamado_mensagens (chamado_id, data_envio);
create index if not exists idx_mensagens_autor on public.chamado_mensagens (autor_id);
create index if not exists idx_termos_colaborador on public.termos_responsabilidade (colaborador_id);

-- 6. Trilha de auditoria: CASCADE -> RESTRICT -------------------------------------
do $$
declare
  r record;
  alvo record;
begin
  for alvo in
    select * from (values
      ('historico_custodia',      'colaborador_id', 'colaboradores'),
      ('historico_custodia',      'ativo_id',       'ativos'),
      ('chamados',                'solicitante_id', 'colaboradores'),
      ('chamado_mensagens',       'autor_id',       'colaboradores'),
      ('termos_responsabilidade', 'colaborador_id', 'colaboradores')
    ) as t(tabela, coluna, referencia)
  loop
    for r in
      select con.conname, con.confdeltype
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
      where n.nspname = 'public' and rel.relname = alvo.tabela
        and con.contype = 'f' and att.attname = alvo.coluna
    loop
      if r.confdeltype <> 'r' then
        execute format('alter table public.%I drop constraint %I', alvo.tabela, r.conname);
        execute format('alter table public.%I add constraint %I foreign key (%I) references public.%I (id) on delete restrict',
                       alvo.tabela, r.conname, alvo.coluna, alvo.referencia);
      end if;
    end loop;
  end loop;
end $$;

-- 7. CHECKs de sanidade ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_licenca_assentos') then
    alter table public.licencas_software
      add constraint chk_licenca_assentos check (assentos_totais >= 0 and valor_mensal >= 0);
  end if;
end $$;
