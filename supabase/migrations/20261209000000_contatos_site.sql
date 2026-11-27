-- Seção 30 · Contatos do site (formulário "Quero conhecer" da landing page). Sem DROP.
-- Qualquer visitante envia (sem login); só o administrador da T.I. lê, marca como atendido e apaga.
create table if not exists public.contatos_site (
  id         text primary key default gen_random_uuid()::text,
  nome       text not null check (char_length(btrim(nome)) between 2 and 120),
  empresa    text check (empresa is null or char_length(empresa) <= 160),
  email      text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  telefone   text check (telefone is null or char_length(telefone) <= 40),
  mensagem   text check (mensagem is null or char_length(mensagem) <= 2000),
  atendido   boolean not null default false,
  criado_em  timestamptz not null default now()
);
create index if not exists idx_contatos_site_criado on public.contatos_site (criado_em desc);

alter table public.contatos_site enable row level security;

drop policy if exists contatos_site_enviar on public.contatos_site;
create policy contatos_site_enviar on public.contatos_site for insert to anon, authenticated
  with check (atendido = false);
drop policy if exists contatos_site_ler on public.contatos_site;
create policy contatos_site_ler on public.contatos_site for select to authenticated
  using (public.meu_papel() = 'ti_admin');
drop policy if exists contatos_site_atender on public.contatos_site;
create policy contatos_site_atender on public.contatos_site for update to authenticated
  using (public.meu_papel() = 'ti_admin') with check (public.meu_papel() = 'ti_admin');
drop policy if exists contatos_site_excluir on public.contatos_site;
create policy contatos_site_excluir on public.contatos_site for delete to authenticated
  using (public.meu_papel() = 'ti_admin');

-- Quem envia não escolhe id nem data
revoke all on public.contatos_site from anon, authenticated;
grant insert (nome, empresa, email, telefone, mensagem) on public.contatos_site to anon, authenticated;
grant select, update (atendido), delete on public.contatos_site to authenticated;
