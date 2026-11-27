\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'

-- Seção 29 · pessoas e usuários (cada caso é desfeito no fim)
select harness.rodar('pessoas', 'P1 pessoas atuais ficam como colaborador da empresa', 'ok', :'admin', 'authenticated',
  $q$select harness.espera($s$select 1 from public.colaboradores where tipo_vinculo <> 'colaborador'$s$, 0)$q$);
select harness.rodar('pessoas', 'P2 T.I. cadastra usuário externo sem setor', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    insert into public.colaboradores (id, matricula, nome, email, cargo, status, role, data_admissao, tipo_vinculo)
      values ('emp-ext1', 'EXT-1', 'Consultor', 'consultor@prestadora.test', 'Usuário externo', 'ativo', 'colaborador', '2026-11-27', 'externo');
    perform harness.espera($s$select 1 from public.colaboradores where id = 'emp-ext1' and tipo_vinculo = 'externo' and setor_id is null$s$, 1);
  end $x$$q$);
select harness.rodar('pessoas', 'P3 tipo inválido é recusado',
  'erro: new row for relation "colaboradores" violates check constraint "chk_colaborador_tipo_vinculo"', :'admin', 'authenticated',
  $q$update public.colaboradores set tipo_vinculo = 'outro' where id = 'emp-colab'$q$);
select harness.rodar('pessoas', 'P4 admin grava site, domínios e padrão do e-mail', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    update public.configuracoes_empresa set site = 'www.x.com.br', dominios_email = array['x.com.br'], padrao_email = 'nome.inicial';
    perform harness.espera($s$select 1 from public.configuracoes_empresa where padrao_email = 'nome.inicial' and dominios_email = array['x.com.br']$s$, 1);
  end $x$$q$);
select harness.rodar('pessoas', 'P5 colaborador lê os domínios (para a sugestão), sem login não', 'ok', :'colab', 'authenticated',
  $q$select site, dominios_email, padrao_email from public.configuracoes_empresa$q$);
select harness.rodar('pessoas', 'P6 padrão inválido é recusado',
  'erro: new row for relation "configuracoes_empresa" violates check constraint "chk_config_padrao_email"', :'admin', 'authenticated',
  $q$update public.configuracoes_empresa set padrao_email = 'qualquer'$q$);
