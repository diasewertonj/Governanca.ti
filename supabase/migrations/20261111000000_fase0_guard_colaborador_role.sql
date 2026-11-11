-- ==============================================================================
-- FASE 0 · CONTENÇÃO: só um ti_admin pode criar ou alterar papéis
-- ------------------------------------------------------------------------------
-- O que faz:
--   Um trigger em public.colaboradores rejeita, vindo da API (usuário logado):
--     * INSERT com role diferente de 'colaborador', se quem chama não é ti_admin;
--     * UPDATE que muda a coluna role, se quem chama não é ti_admin.
--   "Quem chama" é identificado pelo e-mail do JWT (auth.jwt() ->> 'email'),
--   porque hoje não existe coluna ligando colaboradores a auth.users.
--
-- O que NÃO faz (fica para a Fase 1):
--   * Não fecha as policies using(true): qualquer logado ainda lê e grava o resto.
--   * Não corrige o bug de login no front (CRIT-02); só impede que ele grave ti_admin no banco.
--
-- Não é bloqueado: SQL Editor / postgres (sem JWT na requisição) e service_role.
-- É bloqueado: anon (requisição sem login, só com a anon key) e qualquer
-- authenticated que não seja ti_admin ativo.
--
-- Efeito colateral conhecido: o primeiro login de um usuário novo tenta gravar
-- role = 'ti_admin' (bug CRIT-02) e passa a ser rejeitado, então o perfil dele
-- não é criado automaticamente. Cadastre-o pela tela Colaboradores (como
-- ti_admin) com o mesmo e-mail antes do primeiro acesso.
--
-- Rollback no fim do arquivo.
-- ==============================================================================

create or replace function public.guard_colaborador_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims       jsonb   := auth.jwt();
  v_caller_email text    := lower(coalesce(v_claims ->> 'email', ''));
  v_caller_admin boolean := false;
begin
  -- Execução administrativa: sem JWT (SQL Editor, postgres) ou service_role.
  if v_claims is null or coalesce(v_claims ->> 'role', '') = 'service_role' then
    return new;
  end if;

  -- Requisição anônima (anon key, sem login): nunca cria nem altera papéis.
  if auth.uid() is null then
    if tg_op = 'INSERT' or new.role is distinct from old.role then
      raise exception 'Requisição sem login não pode definir papéis de acesso'
        using errcode = '42501';
    end if;
    return new;
  end if;

  select exists (
    select 1
    from public.colaboradores c
    where lower(c.email) = v_caller_email
      and c.role = 'ti_admin'
      and c.status <> 'desligado'
  ) into v_caller_admin;

  if tg_op = 'INSERT' then
    if new.role is distinct from 'colaborador' and not v_caller_admin then
      raise exception 'Apenas ti_admin pode criar colaborador com papel "%"', new.role
        using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role and not v_caller_admin then
      raise exception 'Apenas ti_admin pode alterar papéis de acesso'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_colaborador_role() from public, anon, authenticated;

drop trigger if exists trg_guard_colaborador_role on public.colaboradores;
create trigger trg_guard_colaborador_role
  before insert or update on public.colaboradores
  for each row
  execute function public.guard_colaborador_role();

-- Conferência (deve listar 1 linha, tgenabled = 'O'):
-- select tgname, tgenabled from pg_trigger
-- where tgrelid = 'public.colaboradores'::regclass and not tgisinternal;

-- ------------------------------------------------------------------------------
-- ROLLBACK (só se precisar desfazer):
-- drop trigger if exists trg_guard_colaborador_role on public.colaboradores;
-- drop function if exists public.guard_colaborador_role();
-- ------------------------------------------------------------------------------
