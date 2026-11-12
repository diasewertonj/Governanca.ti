-- ==============================================================================
-- FASE 3 · PROCESSOS
-- ------------------------------------------------------------------------------
-- Depende das Fases 1 e 2. Reexecutável.
--
-- 1. Storage privado "documentos" (MED-04): anexos de chamado e termos
--    assinados de verdade. Limite de 10 MB; PDF, imagens e texto.
--    Caminhos:
--      usuarios/<auth.uid()>/<arquivo>  -> anexos enviados pela pessoa
--      termos/<termo_id>/<arquivo>       -> termo assinado (só TI envia)
--    Leitura: TI lê tudo; cada pessoa lê a própria pasta; termos seguem a
--    visibilidade do termo (o colaborador lê o próprio, RH lê todos).
--    Nada é público: o site gera links temporários (signed URL).
-- 2. concluir_offboarding(chamado): numa transação, devolve os ativos ao
--    estoque (fechando a custódia), libera as licenças, marca o colaborador
--    como 'desligado' e resolve o chamado. Só TI.
-- 3. anonimizar_colaborador(id): direito de eliminação (LGPD art. 18) sem
--    destruir a trilha de auditoria. Só ti_admin, só para desligados.
-- 4. Guarda de colaboradores: passa a permitir que o ti_admin DESVINCULE o
--    login (auth_user_id -> NULL), usado na anonimização.
-- ==============================================================================

-- 1. Storage --------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'documentos\_%'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

create policy documentos_ler on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos'
    and (
      public.meu_papel() in ('ti_admin', 'ti_suporte')
      or ((storage.foldername(name))[1] = 'usuarios'
          and (storage.foldername(name))[2] = auth.uid()::text
          and public.meu_papel() is not null)
      or ((storage.foldername(name))[1] = 'termos'
          and exists (select 1 from public.termos_responsabilidade t
                      where t.id = (storage.foldername(name))[2]))
    )
  );

create policy documentos_enviar on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and public.meu_papel() is not null
    and (
      ((storage.foldername(name))[1] = 'usuarios' and (storage.foldername(name))[2] = auth.uid()::text)
      or ((storage.foldername(name))[1] = 'termos' and public.meu_papel() in ('ti_admin', 'ti_suporte'))
    )
  );

create policy documentos_excluir on storage.objects for delete to authenticated
  using (
    bucket_id = 'documentos'
    and (
      public.meu_papel() in ('ti_admin', 'ti_suporte')
      or ((storage.foldername(name))[1] = 'usuarios' and (storage.foldername(name))[2] = auth.uid()::text)
    )
  );

-- 2. Guarda de colaboradores (versão da Fase 1 + desvínculo pelo ti_admin) ---------
create or replace function public.guard_colaborador_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := auth.jwt();
  v_admin  boolean;
begin
  if v_claims is null or coalesce(v_claims ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'Requisição sem login não pode alterar colaboradores'
      using errcode = '42501';
  end if;

  v_admin := coalesce(public.meu_papel() = 'ti_admin', false);

  if tg_op = 'INSERT' then
    if new.auth_user_id is not null then
      raise exception 'auth_user_id é definido pelo banco' using errcode = '42501';
    end if;
    if new.role is distinct from 'colaborador' and not v_admin then
      raise exception 'Apenas ti_admin pode criar colaborador com papel "%"', new.role
        using errcode = '42501';
    end if;
  else
    if new.auth_user_id is distinct from old.auth_user_id
       and not (v_admin and new.auth_user_id is null) then
      raise exception 'auth_user_id é definido pelo banco' using errcode = '42501';
    end if;
    if new.role is distinct from old.role and not v_admin then
      raise exception 'Apenas ti_admin pode alterar papéis de acesso' using errcode = '42501';
    end if;
    if lower(new.email) is distinct from lower(old.email)
       and old.role <> 'colaborador' and not v_admin then
      raise exception 'Apenas ti_admin pode alterar o e-mail de perfis de gestão'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- 3. Offboarding automático ---------------------------------------------------------
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

  v_colab := v_chamado.offboarding ->> 'colaboradorId';
  if v_colab is null or not exists (select 1 from public.colaboradores where id = v_colab) then
    raise exception 'O chamado não identifica o colaborador a desligar' using errcode = '23514';
  end if;
  if auth.uid() is not null
     and exists (select 1 from public.colaboradores where id = v_colab and role <> 'colaborador')
     and public.meu_papel() <> 'ti_admin' then
    raise exception 'Apenas ti_admin desliga perfis de gestão (TI/RH)' using errcode = '42501';
  end if;

  -- Fecha a custódia aberta de cada ativo e devolve ao estoque
  update public.historico_custodia h
  set data_devolucao = current_date,
      motivo_devolucao = coalesce(h.motivo_devolucao, 'Devolução por desligamento (' || v_chamado.codigo || ')')
  where h.colaborador_id = v_colab and h.data_devolucao is null;

  update public.ativos
  set custodiante_id = null, status = 'disponivel', data_entrega_atual = null
  where custodiante_id = v_colab;
  get diagnostics v_ativos = row_count;

  -- Libera todos os assentos de licença
  update public.licencas_software
  set colaboradores_ids = colaboradores_ids - v_colab
  where colaboradores_ids ? v_colab;
  get diagnostics v_lics = row_count;

  -- Desliga o colaborador (perde acesso: meu_papel() passa a ser NULL)
  update public.colaboradores set status = 'desligado' where id = v_colab;

  -- Resolve o chamado e marca o checklist
  update public.chamados
  set status = 'resolvido',
      offboarding = jsonb_set(
        v_chamado.offboarding,
        '{checklist}',
        coalesce((select jsonb_agg(item || '{"concluido": true}'::jsonb)
                  from jsonb_array_elements(v_chamado.offboarding -> 'checklist') item), '[]'::jsonb)
      )
  where id = p_chamado;

  return jsonb_build_object('colaboradorId', v_colab, 'ativosDevolvidos', v_ativos, 'licencasLiberadas', v_lics);
end;
$$;

revoke all on function public.concluir_offboarding(text) from public, anon;
grant execute on function public.concluir_offboarding(text) to authenticated;

-- 4. Anonimização (LGPD) --------------------------------------------------------------
create or replace function public.anonimizar_colaborador(p_colaborador text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.colaboradores%rowtype;
  v_rotulo text;
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') <> 'ti_admin' then
    raise exception 'Apenas ti_admin pode anonimizar dados pessoais' using errcode = '42501';
  end if;

  select * into v_c from public.colaboradores where id = p_colaborador for update;
  if not found then
    raise exception 'Colaborador não encontrado' using errcode = '42501';
  end if;
  if v_c.status <> 'desligado' then
    raise exception 'Desligue o colaborador antes de anonimizar' using errcode = '23514';
  end if;
  if exists (select 1 from public.ativos where custodiante_id = p_colaborador) then
    raise exception 'O colaborador ainda tem equipamentos sob custódia' using errcode = '23514';
  end if;

  v_rotulo := 'Titular anonimizado ' || left(md5(p_colaborador), 6);

  update public.colaboradores
  set nome = v_rotulo,
      email = 'anonimizado.' || left(md5(p_colaborador), 12) || '@anonimizado.invalid',
      matricula = 'ANON-' || left(md5(p_colaborador), 8),
      telefone = null,
      avatar_url = null,
      gestor_id = null,
      role = 'colaborador',
      auth_user_id = null
  where id = p_colaborador;

  update public.historico_custodia set colaborador_nome = v_rotulo where colaborador_id = p_colaborador;
  update public.chamados
  set solicitante_nome = v_rotulo, solicitante_email = 'anonimizado@anonimizado.invalid'
  where solicitante_id = p_colaborador;
  update public.chamados set tecnico_responsavel_nome = v_rotulo where tecnico_responsavel_id = p_colaborador;
  update public.chamado_mensagens set autor_nome = v_rotulo where autor_id = p_colaborador;
  update public.termos_responsabilidade
  set colaborador_nome = v_rotulo, colaborador_matricula = 'ANON-' || left(md5(p_colaborador), 8)
  where colaborador_id = p_colaborador;
end;
$$;

revoke all on function public.anonimizar_colaborador(text) from public, anon;
grant execute on function public.anonimizar_colaborador(text) to authenticated;
