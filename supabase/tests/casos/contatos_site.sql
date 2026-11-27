\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set anon '{"role":"anon"}'

-- Seção 30 · contatos do site (cada caso é desfeito no fim)
select harness.rodar('contatos', 'C1 visitante sem login envia o contato', 'ok', :'anon', 'anon',
  $q$insert into public.contatos_site (nome, empresa, email) values ('Visitante', 'Empresa', 'v@x.test')$q$);
select harness.rodar('contatos', 'C2 visitante não lê os contatos', 'bloqueado', :'anon', 'anon',
  $q$select * from public.contatos_site$q$);
select harness.rodar('contatos', 'C3 e-mail inválido é recusado',
  'erro: new row for relation "contatos_site" violates check constraint "contatos_site_email_check"', :'anon', 'anon',
  $q$insert into public.contatos_site (nome, email) values ('Visitante', 'sem-arroba')$q$);
select harness.rodar('contatos', 'C4 suporte não vê os contatos', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.contatos_site (nome, email) values ('Visitante', 'v@x.test');
    perform harness.espera($s$select 1 from public.contatos_site$s$, 0);
  end $x$$q$);
select harness.rodar('contatos', 'C5 admin lê e marca como atendido', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    insert into public.contatos_site (nome, email) values ('Visitante', 'v@x.test');
    perform harness.afeta($s$update public.contatos_site set atendido = true$s$, 1);
  end $x$$q$);
