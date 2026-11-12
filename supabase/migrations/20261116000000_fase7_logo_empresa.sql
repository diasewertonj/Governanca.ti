-- =============================================================================
-- Fase 7 · Logo da empresa (cabeçalho do sistema e dos termos)
-- Só acrescenta uma coluna; pode ser rodada mais de uma vez. Sem DROP.
-- =============================================================================
alter table public.configuracoes_empresa
  add column if not exists logo_url text;

-- Só links https (a política de imagens do site aceita https:)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_config_logo_https') then
    alter table public.configuracoes_empresa
      add constraint chk_config_logo_https check (logo_url is null or logo_url ~ '^https://');
  end if;
end $$;

comment on column public.configuracoes_empresa.logo_url is 'Fase 7: link https do logo da empresa';
