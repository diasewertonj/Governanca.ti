-- ==============================================================================
-- FASE 0 · CONTENÇÃO: tirar o acesso de quem não fez login (anon)
-- ------------------------------------------------------------------------------
-- Contexto (diagnóstico de produção, 2026-11-11):
--   As policies do banco real valem para roles = {public}, o que inclui anon.
--   Qualquer pessoa com a anon key (pública, vai no bundle do site) lê, grava
--   e apaga todas as tabelas sem login.
--
-- O que faz:
--   1. Toda policy de public que vale para public/anon passa a valer só para
--      authenticated. Exceção: SELECT em configuracoes_empresa continua público,
--      porque a tela de login mostra a razão social.
--   2. Revoga INSERT/UPDATE/DELETE/TRUNCATE de anon em todas as tabelas de public
--      (segunda camada, caso alguma policy nova seja criada sem "TO").
--
-- O que NÃO faz (Fase 1):
--   * Usuários logados continuam com using (true): leem e gravam tudo.
--
-- Efeito no app: nenhum para quem está logado. Sem login, as consultas passam a
-- voltar vazias (é o comportamento que o código já espera).
--
-- Funciona com qualquer nome de policy (o banco real usa nomes diferentes do
-- supabase-schema.sql). Pode ser executada mais de uma vez.
-- Rollback no fim do arquivo.
-- ==============================================================================

do $$
declare
  p record;
begin
  for p in
    select tablename, policyname, cmd, roles
    from pg_policies
    where schemaname = 'public'
      and (roles @> array['public']::name[] or roles @> array['anon']::name[])
  loop
    if p.tablename = 'configuracoes_empresa' and p.cmd = 'SELECT' then
      raise notice 'Mantida pública: % em % (%)', p.policyname, p.tablename, p.cmd;
      continue;
    end if;

    execute format('alter policy %I on public.%I to authenticated', p.policyname, p.tablename);
    raise notice 'Restrita a authenticated: % em % (%)', p.policyname, p.tablename, p.cmd;
  end loop;
end
$$;

revoke insert, update, delete, truncate on all tables in schema public from anon;

-- Conferência: só deve sobrar a leitura pública de configuracoes_empresa.
-- select tablename, policyname, cmd, roles from pg_policies
-- where schemaname = 'public' and (roles @> array['public']::name[] or roles @> array['anon']::name[]);

-- ------------------------------------------------------------------------------
-- ROLLBACK (volta ao estado anterior, inseguro):
-- do $$ declare p record; begin
--   for p in select tablename, policyname from pg_policies
--            where schemaname = 'public' and roles = array['authenticated']::name[]
--   loop execute format('alter policy %I on public.%I to public', p.policyname, p.tablename); end loop;
-- end $$;
-- grant insert, update, delete, truncate on all tables in schema public to anon;
-- ------------------------------------------------------------------------------
