-- Seção 29 · Pessoas e usuários (sem DROP).
-- 1) Tipo de pessoa: "colaborador" (funcionário da empresa, padrão) ou "externo" (só acessa o
--    sistema: administrador de fora, consultor, técnico da prestadora, contador). O externo não
--    entra no headcount, no custo por colaborador, nas listas de entrega nem na admissão.
-- 2) Empresa: site, domínios de e-mail e padrão do endereço, para sugerir o e-mail no cadastro.

alter table public.colaboradores add column if not exists tipo_vinculo text not null default 'colaborador';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_colaborador_tipo_vinculo') then
    alter table public.colaboradores add constraint chk_colaborador_tipo_vinculo check (tipo_vinculo in ('colaborador', 'externo'));
  end if;
end $$;

alter table public.configuracoes_empresa add column if not exists site text;
alter table public.configuracoes_empresa add column if not exists dominios_email text[] not null default '{}';
alter table public.configuracoes_empresa add column if not exists padrao_email text not null default 'nome.sobrenome';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_config_padrao_email') then
    alter table public.configuracoes_empresa add constraint chk_config_padrao_email
      check (padrao_email in ('nome.sobrenome', 'nome.inicial', 'nome', 'nenhum'));
  end if;
end $$;

-- A tabela usa permissão por coluna (sem login só lê nome e logo): libera as novas para quem entrou
grant select (site, dominios_email, padrao_email) on public.configuracoes_empresa to authenticated;
grant insert (site, dominios_email, padrao_email) on public.configuracoes_empresa to authenticated;
grant update (site, dominios_email, padrao_email) on public.configuracoes_empresa to authenticated;
