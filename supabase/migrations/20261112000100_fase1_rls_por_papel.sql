-- ==============================================================================
-- FASE 1 · RLS POR PAPEL
-- ------------------------------------------------------------------------------
-- Depende de 20261112000000_fase1_identidade.sql (meu_papel / meu_colaborador_id).
--
-- Matriz (TI = ti_admin ou ti_suporte; "eu" = meu_colaborador_id()):
--   tabela                  | ler                                        | gravar
--   ------------------------+--------------------------------------------+--------------------------
--   departamentos           | qualquer perfil ativo                      | ti_admin
--   colaboradores           | TI, rh, a própria linha                    | TI, rh (excluir: ti_admin)
--   ativos                  | TI, rh, ativos sob minha custódia          | TI
--   ativos_segredos (novo)  | TI                                         | TI
--   historico_custodia      | TI, rh, meu histórico                      | TI
--   licencas_software       | qualquer perfil ativo (catálogo)           | TI
--   licencas_segredos (novo)| TI                                         | TI
--   chamados                | TI, os que eu abri, rh: on/offboarding     | abrir: o próprio solicitante ou TI;
--                           |                                            | alterar: TI; excluir: ti_admin
--   chamado_mensagens       | TI tudo; demais: não-internas dos chamados | autor = eu; nota interna só TI
--                           | que eu posso ver                           |
--   termos_responsabilidade | TI, rh, meus termos                        | TI
--   configuracoes_empresa   | público (tela de login)                    | ti_admin
--
-- Perfil desligado ou sem vínculo: meu_papel() = NULL -> não vê nada.
-- Também move bitlocker_key e chave_contrato para tabelas só da TI.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Segredos fora das tabelas que o colaborador lê
-- ------------------------------------------------------------------------------
create table if not exists public.ativos_segredos (
  ativo_id      text primary key references public.ativos (id) on delete cascade,
  bitlocker_key text,
  updated_at    timestamptz not null default now()
);

create table if not exists public.licencas_segredos (
  licenca_id     text primary key references public.licencas_software (id) on delete cascade,
  chave_contrato text,
  updated_at     timestamptz not null default now()
);

alter table public.ativos_segredos enable row level security;
alter table public.licencas_segredos enable row level security;

-- Copia e remove as colunas antigas só se ainda existirem (reexecutável)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'ativos' and column_name = 'bitlocker_key') then
    insert into public.ativos_segredos (ativo_id, bitlocker_key)
    select id, bitlocker_key from public.ativos where bitlocker_key is not null
    on conflict (ativo_id) do nothing;
    alter table public.ativos drop column bitlocker_key;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'licencas_software' and column_name = 'chave_contrato') then
    insert into public.licencas_segredos (licenca_id, chave_contrato)
    select id, chave_contrato from public.licencas_software where chave_contrato is not null
    on conflict (licenca_id) do nothing;
    alter table public.licencas_software drop column chave_contrato;
  end if;
end $$;

revoke all on public.ativos_segredos, public.licencas_segredos from anon;
grant select, insert, update, delete on public.ativos_segredos, public.licencas_segredos to authenticated;

-- ------------------------------------------------------------------------------
-- 2. Remove todas as policies atuais das tabelas do app (nomes variam entre
--    o banco real e o supabase-schema.sql)
-- ------------------------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('departamentos','colaboradores','ativos','ativos_segredos','historico_custodia',
                        'licencas_software','licencas_segredos','chamados','chamado_mensagens',
                        'termos_responsabilidade','configuracoes_empresa')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ------------------------------------------------------------------------------
-- 3. Policies novas
-- ------------------------------------------------------------------------------
-- departamentos
create policy dep_ler on public.departamentos for select to authenticated
  using (public.meu_papel() is not null);
create policy dep_gravar on public.departamentos for all to authenticated
  using (public.meu_papel() = 'ti_admin') with check (public.meu_papel() = 'ti_admin');

-- colaboradores
create policy colab_ler on public.colaboradores for select to authenticated
  using (public.meu_papel() in ('ti_admin','ti_suporte','rh') or id = public.meu_colaborador_id());
create policy colab_inserir on public.colaboradores for insert to authenticated
  with check (public.meu_papel() in ('ti_admin','ti_suporte','rh'));
create policy colab_alterar on public.colaboradores for update to authenticated
  using (public.meu_papel() in ('ti_admin','ti_suporte','rh'))
  with check (public.meu_papel() in ('ti_admin','ti_suporte','rh'));
create policy colab_excluir on public.colaboradores for delete to authenticated
  using (public.meu_papel() = 'ti_admin');

-- ativos
create policy ativo_ler on public.ativos for select to authenticated
  using (public.meu_papel() in ('ti_admin','ti_suporte','rh') or custodiante_id = public.meu_colaborador_id());
create policy ativo_gravar on public.ativos for all to authenticated
  using (public.meu_papel() in ('ti_admin','ti_suporte'))
  with check (public.meu_papel() in ('ti_admin','ti_suporte'));

create policy ativo_segredo_ti on public.ativos_segredos for all to authenticated
  using (public.meu_papel() in ('ti_admin','ti_suporte'))
  with check (public.meu_papel() in ('ti_admin','ti_suporte'));

-- historico_custodia
create policy custodia_ler on public.historico_custodia for select to authenticated
  using (public.meu_papel() in ('ti_admin','ti_suporte','rh') or colaborador_id = public.meu_colaborador_id());
create policy custodia_gravar on public.historico_custodia for all to authenticated
  using (public.meu_papel() in ('ti_admin','ti_suporte'))
  with check (public.meu_papel() in ('ti_admin','ti_suporte'));

-- licencas_software
create policy licenca_ler on public.licencas_software for select to authenticated
  using (public.meu_papel() is not null);
create policy licenca_gravar on public.licencas_software for all to authenticated
  using (public.meu_papel() in ('ti_admin','ti_suporte'))
  with check (public.meu_papel() in ('ti_admin','ti_suporte'));

create policy licenca_segredo_ti on public.licencas_segredos for all to authenticated
  using (public.meu_papel() in ('ti_admin','ti_suporte'))
  with check (public.meu_papel() in ('ti_admin','ti_suporte'));

-- chamados
create policy chamado_ler on public.chamados for select to authenticated
  using (
    public.meu_papel() in ('ti_admin','ti_suporte')
    or solicitante_id = public.meu_colaborador_id()
    or (public.meu_papel() = 'rh' and tipo in ('onboarding','offboarding'))
  );
create policy chamado_abrir on public.chamados for insert to authenticated
  with check (
    public.meu_papel() in ('ti_admin','ti_suporte')
    or (public.meu_papel() is not null and solicitante_id = public.meu_colaborador_id())
  );
create policy chamado_alterar on public.chamados for update to authenticated
  using (public.meu_papel() in ('ti_admin','ti_suporte'))
  with check (public.meu_papel() in ('ti_admin','ti_suporte'));
create policy chamado_excluir on public.chamados for delete to authenticated
  using (public.meu_papel() = 'ti_admin');

-- chamado_mensagens
create policy msg_ler on public.chamado_mensagens for select to authenticated
  using (
    public.meu_papel() in ('ti_admin','ti_suporte')
    or (not eh_nota_interna
        and exists (select 1 from public.chamados ch where ch.id = chamado_id))
  );
create policy msg_enviar on public.chamado_mensagens for insert to authenticated
  with check (
    autor_id = public.meu_colaborador_id()
    and (
      public.meu_papel() in ('ti_admin','ti_suporte')
      or (not eh_nota_interna
          and exists (select 1 from public.chamados ch where ch.id = chamado_id))
    )
  );
create policy msg_excluir on public.chamado_mensagens for delete to authenticated
  using (public.meu_papel() = 'ti_admin');

-- termos_responsabilidade
create policy termo_ler on public.termos_responsabilidade for select to authenticated
  using (public.meu_papel() in ('ti_admin','ti_suporte','rh') or colaborador_id = public.meu_colaborador_id());
create policy termo_gravar on public.termos_responsabilidade for all to authenticated
  using (public.meu_papel() in ('ti_admin','ti_suporte'))
  with check (public.meu_papel() in ('ti_admin','ti_suporte'));

-- configuracoes_empresa
create policy config_ler on public.configuracoes_empresa for select
  using (true);
create policy config_gravar on public.configuracoes_empresa for all to authenticated
  using (public.meu_papel() = 'ti_admin') with check (public.meu_papel() = 'ti_admin');

-- ------------------------------------------------------------------------------
-- 4. Nova mensagem atualiza data_atualizacao do chamado (o cliente não precisa
--    mais regravar o chamado inteiro só para isso)
-- ------------------------------------------------------------------------------
create or replace function public.tocar_chamado_na_mensagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chamados set data_atualizacao = now() where id = new.chamado_id;
  return new;
end;
$$;

revoke all on function public.tocar_chamado_na_mensagem() from public, anon, authenticated;

create or replace trigger trg_tocar_chamado_na_mensagem
  after insert on public.chamado_mensagens
  for each row
  execute function public.tocar_chamado_na_mensagem();

-- ------------------------------------------------------------------------------
-- 5. Aviso do verificador do Supabase: função padrão exposta na API
-- ------------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.assinatura);
  end loop;
end $$;
