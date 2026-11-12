-- ==============================================================================
-- FASE 0 · DIAGNÓSTICO (SOMENTE LEITURA)
-- Rode no SQL Editor do Supabase. Nenhuma consulta abaixo altera dados.
-- Rode bloco a bloco e guarde o resultado de cada um (print ou CSV).
-- ==============================================================================

-- 1. Quem tem papel de gestão hoje
select id, email, nome, cargo, role, status, setor_id, created_at
from public.colaboradores
where role in ('ti_admin', 'ti_suporte', 'rh')
order by role, created_at;

-- 2. Sinais do bug CRIT-02: perfis criados automaticamente pelo login
--    (id no formato emp-<8 primeiros caracteres do uuid do Auth>).
--    Atenção especial aos que têm role = 'ti_admin' e o cargo padrão
--    "Administrador de T.I. & Governança": provavelmente foram promovidos pelo bug.
select id, email, nome, cargo, role, matricula, created_at
from public.colaboradores
where id ~ '^emp-[0-9a-f]{8}$'
order by created_at;

-- 3. Contas do Supabase Auth e o colaborador vinculado (por e-mail).
--    Procure contas que você não reconhece (ex.: Gmail de terceiros via Google).
select u.id                                   as auth_id,
       u.email,
       u.raw_app_meta_data ->> 'provider'     as provedor,
       u.created_at                           as conta_criada_em,
       u.last_sign_in_at                      as ultimo_login,
       u.email_confirmed_at is not null       as email_confirmado,
       u.banned_until,
       c.id                                   as colaborador_id,
       c.role
from auth.users u
left join public.colaboradores c on lower(c.email) = lower(u.email)
order by u.created_at;

-- 4. Colaboradores sem conta de login (normal para quem nunca acessou)
select c.id, c.email, c.role, c.status
from public.colaboradores c
left join auth.users u on lower(u.email) = lower(c.email)
where u.id is null
order by c.role, c.email;

-- 5. RLS ligado em cada tabela?
select c.relname as tabela, c.relrowsecurity as rls_ligado, c.relforcerowsecurity as rls_forcado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- 6. Policies que estão de fato aplicadas (pode diferir do supabase-schema.sql)
select tablename, policyname, cmd, roles, qual as using_expr, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 7. CHECK constraints reais de chamados (confirma CRIT-03: urgente / aguardando_peca)
select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.chamados'::regclass and contype = 'c';

-- 8. Triggers e funções já existentes no schema public
select event_object_table as tabela, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
order by tabela, trigger_name;

select p.proname as funcao, p.prosecdef as security_definer, p.proconfig as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';

-- 9. Volume por tabela
select 'departamentos' as tabela, count(*) from public.departamentos
union all select 'colaboradores', count(*) from public.colaboradores
union all select 'ativos', count(*) from public.ativos
union all select 'historico_custodia', count(*) from public.historico_custodia
union all select 'licencas_software', count(*) from public.licencas_software
union all select 'chamados', count(*) from public.chamados
union all select 'chamado_mensagens', count(*) from public.chamado_mensagens
union all select 'termos_responsabilidade', count(*) from public.termos_responsabilidade
union all select 'configuracoes_empresa', count(*) from public.configuracoes_empresa;
