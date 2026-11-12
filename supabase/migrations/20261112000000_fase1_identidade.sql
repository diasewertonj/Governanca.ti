-- ==============================================================================
-- FASE 1 · IDENTIDADE: ligar colaboradores ao Supabase Auth
-- ------------------------------------------------------------------------------
-- 1. colaboradores.auth_user_id (uuid único -> auth.users), preenchido pelo
--    banco a partir do e-mail. O cliente nunca define esse campo.
-- 2. Funções auxiliares usadas pelas policies:
--      public.meu_colaborador_id()  -> id do colaborador logado (ativo/férias)
--      public.meu_papel()           -> papel do colaborador logado
--    Retornam NULL para quem não tem perfil ou está 'desligado'.
-- 3. Trigger de guarda (substitui o da Fase 0), agora baseado em auth_user_id:
--      * só ti_admin cria/altera papéis;
--      * só ti_admin altera e-mail de perfis com papel de gestão;
--      * ninguém pela API define auth_user_id.
-- 4. Vínculo automático: ao criar/alterar usuário no Auth, ou ao cadastrar
--    colaborador com e-mail que já tem login.
--
-- Não cria perfil automaticamente: com o cadastro aberto desligado, o
-- ti_admin cadastra o colaborador e convida o e-mail pelo painel.
-- ==============================================================================

alter table public.colaboradores
  add column if not exists auth_user_id uuid unique references auth.users (id) on delete set null;

-- Backfill pelo e-mail
update public.colaboradores c
set auth_user_id = u.id
from auth.users u
where c.auth_user_id is null
  and lower(u.email) = lower(c.email);

-- ------------------------------------------------------------------------------
-- Funções auxiliares (SECURITY DEFINER: leem colaboradores sem passar pela RLS,
-- evitando recursão nas policies)
-- ------------------------------------------------------------------------------
create or replace function public.meu_colaborador_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.colaboradores c
  where c.auth_user_id = auth.uid()
    and c.status <> 'desligado'
$$;

create or replace function public.meu_papel()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.role
  from public.colaboradores c
  where c.auth_user_id = auth.uid()
    and c.status <> 'desligado'
$$;

revoke all on function public.meu_colaborador_id() from public, anon;
revoke all on function public.meu_papel() from public, anon;
grant execute on function public.meu_colaborador_id() to authenticated;
grant execute on function public.meu_papel() to authenticated;

-- ------------------------------------------------------------------------------
-- Guarda de colaboradores (substitui a versão da Fase 0)
-- ------------------------------------------------------------------------------
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
  -- Execução administrativa: sem JWT (SQL Editor, postgres, GoTrue) ou service_role.
  if v_claims is null or coalesce(v_claims ->> 'role', '') = 'service_role' then
    return new;
  end if;

  -- Requisição sem login: não escreve em colaboradores.
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
    if new.auth_user_id is distinct from old.auth_user_id then
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

revoke all on function public.guard_colaborador_role() from public, anon, authenticated;

create or replace trigger trg_guard_colaborador_role
  before insert or update on public.colaboradores
  for each row
  execute function public.guard_colaborador_role();

-- ------------------------------------------------------------------------------
-- Vínculo automático colaborador <-> auth.users
-- (nome começa com "trg_v" para rodar DEPOIS da guarda, que começa com "trg_g")
-- ------------------------------------------------------------------------------
create or replace function public.vincular_colaborador_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or lower(new.email) is distinct from lower(old.email) then
    select u.id into new.auth_user_id
    from auth.users u
    where lower(u.email) = lower(new.email)
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function public.vincular_colaborador_auth() from public, anon, authenticated;

create or replace trigger trg_vincular_colaborador_auth
  before insert or update of email on public.colaboradores
  for each row
  execute function public.vincular_colaborador_auth();

create or replace function public.vincular_auth_colaborador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.colaboradores c
  set auth_user_id = new.id
  where c.auth_user_id is null
    and lower(c.email) = lower(new.email);
  return new;
end;
$$;

revoke all on function public.vincular_auth_colaborador() from public, anon, authenticated;

create or replace trigger trg_vincular_auth_colaborador
  after insert or update of email on auth.users
  for each row
  execute function public.vincular_auth_colaborador();
