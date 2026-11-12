\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set ex '{"sub":"00000000-0000-0000-0000-000000000004","email":"ex@x.test","role":"authenticated"}'
\set rh '{"sub":"00000000-0000-0000-0000-000000000005","email":"rh@x.test","role":"authenticated"}'
\set semperfil '{"sub":"00000000-0000-0000-0000-000000000006","email":"semperfil@x.test","role":"authenticated"}'
\set anon '{"role":"anon"}'
\set novo_chamado 'insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id, solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome) values '

-- Estrutura
select harness.rodar('estrutura', 'E1 vínculo por e-mail (backfill, maiúsculas)', 'ok', null, null,
  $q$select harness.espera($s$select 1 from public.colaboradores where auth_user_id is not null$s$, 5)$q$);
select harness.rodar('estrutura', 'E2 bitlocker saiu de ativos', 'erro: column "bitlocker_key" does not exist', null, null,
  $q$select bitlocker_key from public.ativos$q$);
select harness.rodar('estrutura', 'E3 bitlocker migrado para ativos_segredos', 'ok', null, null,
  $q$select harness.espera($s$select 1 from public.ativos_segredos where bitlocker_key = 'BL-SECRETA-1'$s$, 1)$q$);
select harness.rodar('estrutura', 'E4 chave de contrato migrada', 'ok', null, null,
  $q$select harness.espera($s$select 1 from public.licencas_segredos where chave_contrato = 'CHAVE-SECRETA'$s$, 1)$q$);
select harness.rodar('estrutura', 'E5 novo login vincula colaborador existente', 'ok', null, null,
  $q$do $x$ begin insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000007', 'Outro@x.test');
     perform harness.espera($s$select 1 from public.colaboradores where id = 'emp-outro' and auth_user_id = '00000000-0000-0000-0000-000000000007'$s$, 1); end $x$$q$);
select harness.rodar('estrutura', 'E6 rls_auto_enable não executável por anon', 'ok', null, null,
  $q$do $x$ begin if has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE') then raise exception 'exposta'; end if; end $x$$q$);

-- Colaborador
select harness.rodar('colaborador', 'C1 vê só a própria linha em colaboradores', 'ok', :'colab', 'authenticated',
  $q$select harness.espera($s$select 1 from public.colaboradores$s$, 1)$q$);
select harness.rodar('colaborador', 'C2 vê só o ativo sob sua custódia', 'ok', :'colab', 'authenticated',
  $q$select harness.espera($s$select 1 from public.ativos$s$, 1)$q$);
select harness.rodar('colaborador', 'C3 não vê chave BitLocker', 'ok', :'colab', 'authenticated',
  $q$select harness.espera($s$select 1 from public.ativos_segredos$s$, 0)$q$);
select harness.rodar('colaborador', 'C4 vê catálogo de licenças, sem chave', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin perform harness.espera($s$select 1 from public.licencas_software$s$, 1);
     perform harness.espera($s$select 1 from public.licencas_segredos$s$, 0); end $x$$q$);
select harness.rodar('colaborador', 'C5 vê só o próprio chamado', 'ok', :'colab', 'authenticated',
  $q$select harness.espera($s$select 1 from public.chamados$s$, 1)$q$);
select harness.rodar('colaborador', 'C6 não vê nota interna', 'ok', :'colab', 'authenticated',
  $q$select harness.espera($s$select 1 from public.chamado_mensagens$s$, 1)$q$);
select harness.rodar('colaborador', 'C7 vê só o próprio termo e histórico', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin perform harness.espera($s$select 1 from public.termos_responsabilidade$s$, 1);
     perform harness.espera($s$select 1 from public.historico_custodia$s$, 1); end $x$$q$);
select harness.rodar('colaborador', 'C8 abre chamado próprio (upsert como no app)', 'ok', :'colab', 'authenticated',
  :'novo_chamado' || $q$('tkt-9','#CH-9','t','d','suporte','c','media','aberto','emp-colab','Colab','colab@x.test','A','TI')
    on conflict (id) do update set titulo = excluded.titulo$q$);
select harness.rodar('colaborador', 'C9 abre chamado em nome de outro', 'bloqueado', :'colab', 'authenticated',
  :'novo_chamado' || $q$('tkt-9','#CH-9','t','d','suporte','c','media','aberto','emp-outro','Outro','outro@x.test','A','TI')$q$);
select harness.rodar('colaborador', 'C10 responde o próprio chamado e atualiza a data', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
     insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_papel, texto, eh_nota_interna)
     values ('m-9', 'tkt-1', 'emp-colab', 'Colab', 'colaborador', 'oi', false);
     perform harness.espera($s$select 1 from public.chamados where id = 'tkt-1' and data_atualizacao = now()$s$, 1); end $x$$q$);
select harness.rodar('colaborador', 'C11 tenta nota interna', 'bloqueado', :'colab', 'authenticated',
  $q$insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_papel, texto, eh_nota_interna)
     values ('m-9', 'tkt-1', 'emp-colab', 'Colab', 'colaborador', 'x', true)$q$);
select harness.rodar('colaborador', 'C12 escreve em chamado de outro', 'bloqueado', :'colab', 'authenticated',
  $q$insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_papel, texto, eh_nota_interna)
     values ('m-9', 'tkt-2', 'emp-colab', 'Colab', 'colaborador', 'x', false)$q$);
select harness.rodar('colaborador', 'C13 assina mensagem como outra pessoa', 'bloqueado', :'colab', 'authenticated',
  $q$insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_papel, texto, eh_nota_interna)
     values ('m-9', 'tkt-1', 'emp-sup', 'Sup', 'ti_suporte', 'x', false)$q$);
select harness.rodar('colaborador', 'C14 altera status do próprio chamado (0 linhas)', 'ok', :'colab', 'authenticated',
  $q$select harness.afeta($s$update public.chamados set status = 'resolvido' where id = 'tkt-1'$s$, 0)$q$);
select harness.rodar('colaborador', 'C15 altera ativo / colaborador / setor / config (0 linhas)', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
     perform harness.afeta($s$update public.ativos set nome = 'x'$s$, 0);
     perform harness.afeta($s$update public.colaboradores set telefone = 'x'$s$, 0);
     perform harness.afeta($s$delete from public.departamentos$s$, 0);
     perform harness.afeta($s$update public.configuracoes_empresa set razao_social = 'x'$s$, 0); end $x$$q$);
select harness.rodar('colaborador', 'C16 cria colaborador', 'bloqueado', :'colab', 'authenticated',
  $q$insert into public.colaboradores (id, matricula, nome, email, cargo, setor_id, status, role, data_admissao)
     values ('emp-z', 'MZ', 'Z', 'z@x.test', 'A', 'dep-1', 'ativo', 'colaborador', '2026-11-12')$q$);

-- RH
select harness.rodar('rh', 'R1 vê todos os colaboradores e ativos, sem segredos', 'ok', :'rh', 'authenticated',
  $q$do $x$ begin perform harness.espera($s$select 1 from public.colaboradores$s$, 6);
     perform harness.espera($s$select 1 from public.ativos$s$, 2);
     perform harness.espera($s$select 1 from public.ativos_segredos$s$, 0); end $x$$q$);
select harness.rodar('rh', 'R2 vê só chamados de on/offboarding e os próprios', 'ok', :'rh', 'authenticated',
  $q$select harness.espera($s$select 1 from public.chamados$s$, 1)$q$);
select harness.rodar('rh', 'R3 cadastra colaborador comum', 'ok', :'rh', 'authenticated',
  $q$insert into public.colaboradores (id, matricula, nome, email, cargo, setor_id, status, role, data_admissao)
     values ('emp-z', 'MZ', 'Z', 'z@x.test', 'A', 'dep-1', 'ativo', 'colaborador', '2026-11-12')$q$);
select harness.rodar('rh', 'R4 cadastra colaborador ti_admin', 'bloqueado', :'rh', 'authenticated',
  $q$insert into public.colaboradores (id, matricula, nome, email, cargo, setor_id, status, role, data_admissao)
     values ('emp-z', 'MZ', 'Z', 'z@x.test', 'A', 'dep-1', 'ativo', 'ti_admin', '2026-11-12')$q$);
select harness.rodar('rh', 'R5 abre offboarding', 'ok', :'rh', 'authenticated',
  :'novo_chamado' || $q$('tkt-9','#CH-9','t','d','offboarding','c','alta','aberto','emp-rh','RH','rh@x.test','RH','RH')$q$);
select harness.rodar('rh', 'R6 troca e-mail do admin para sequestrar o login', 'bloqueado', :'rh', 'authenticated',
  $q$update public.colaboradores set email = 'rh2@x.test' where id = 'emp-admin'$q$);
select harness.rodar('rh', 'R7 grava auth_user_id manualmente', 'bloqueado', :'rh', 'authenticated',
  $q$update public.colaboradores set auth_user_id = '00000000-0000-0000-0000-000000000005' where id = 'emp-outro'$q$);
select harness.rodar('rh', 'R8 altera ativo (0 linhas)', 'ok', :'rh', 'authenticated',
  $q$select harness.afeta($s$update public.ativos set nome = 'x'$s$, 0)$q$);

-- Suporte
select harness.rodar('suporte', 'S1 vê tudo de TI, inclusive segredos e notas internas', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin perform harness.espera($s$select 1 from public.ativos_segredos$s$, 1);
     perform harness.espera($s$select 1 from public.licencas_segredos$s$, 1);
     perform harness.espera($s$select 1 from public.chamados$s$, 3);
     perform harness.espera($s$select 1 from public.chamado_mensagens$s$, 2); end $x$$q$);
select harness.rodar('suporte', 'S2 muda status de chamado e grava nota interna', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin perform harness.afeta($s$update public.chamados set status = 'em_andamento' where id = 'tkt-2'$s$, 1);
     insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_papel, texto, eh_nota_interna)
     values ('m-9', 'tkt-2', 'emp-sup', 'Sup', 'ti_suporte', 'nota', true); end $x$$q$);
select harness.rodar('suporte', 'S3 grava BitLocker', 'ok', :'sup', 'authenticated',
  $q$insert into public.ativos_segredos (ativo_id, bitlocker_key) values ('ast-2', 'BL-2')
     on conflict (ativo_id) do update set bitlocker_key = excluded.bitlocker_key$q$);
select harness.rodar('suporte', 'S4 altera setores (0 linhas, só admin)', 'ok', :'sup', 'authenticated',
  $q$select harness.afeta($s$update public.departamentos set nome = 'x'$s$, 0)$q$);
select harness.rodar('suporte', 'S5 troca papel', 'bloqueado', :'sup', 'authenticated',
  $q$update public.colaboradores set role = 'ti_admin' where id = 'emp-sup'$q$);

-- Admin
select harness.rodar('admin', 'A1 altera setor e configuração', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin perform harness.afeta($s$update public.departamentos set nome = 'TI 2'$s$, 1);
     perform harness.afeta($s$update public.configuracoes_empresa set razao_social = 'Nova'$s$, 1); end $x$$q$);
select harness.rodar('admin', 'A2 troca papel', 'ok', :'admin', 'authenticated',
  $q$select harness.afeta($s$update public.colaboradores set role = 'rh' where id = 'emp-colab'$s$, 1)$q$);
select harness.rodar('admin', 'A3 cadastra colaborador já com login (vínculo automático)', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin insert into public.colaboradores (id, matricula, nome, email, cargo, setor_id, status, role, data_admissao)
     values ('emp-z', 'MZ', 'Z', 'semperfil@x.test', 'A', 'dep-1', 'ativo', 'ti_suporte', '2026-11-12');
     perform harness.espera($s$select 1 from public.colaboradores where id = 'emp-z' and auth_user_id = '00000000-0000-0000-0000-000000000006'$s$, 1); end $x$$q$);

-- Desligado, sem perfil, anônimo
select harness.rodar('outros', 'D1 admin desligado não vê nada', 'ok', :'ex', 'authenticated',
  $q$do $x$ begin perform harness.espera($s$select 1 from public.colaboradores$s$, 0);
     perform harness.espera($s$select 1 from public.chamados$s$, 0); end $x$$q$);
select harness.rodar('outros', 'N1 login sem perfil não vê nada', 'ok', :'semperfil', 'authenticated',
  $q$do $x$ begin perform harness.espera($s$select 1 from public.colaboradores$s$, 0);
     perform harness.espera($s$select 1 from public.departamentos$s$, 0);
     perform harness.espera($s$select 1 from public.licencas_software$s$, 0); end $x$$q$);
select harness.rodar('outros', 'N2 login sem perfil abre chamado', 'bloqueado', :'semperfil', 'authenticated',
  :'novo_chamado' || $q$('tkt-9','#CH-9','t','d','suporte','c','media','aberto','emp-colab','Colab','colab@x.test','A','TI')$q$);
select harness.rodar('outros', 'X1 anônimo: só a configuração', 'ok', :'anon', 'anon',
  $q$do $x$ begin perform harness.espera($s$select 1 from public.colaboradores$s$, 0);
     perform harness.espera($s$select 1 from public.configuracoes_empresa$s$, 1); end $x$$q$);
select harness.rodar('outros', 'X2 anônimo lê segredos', 'bloqueado', :'anon', 'anon',
  $q$select * from public.ativos_segredos$q$);
select harness.rodar('outros', 'X3 anônimo chama meu_papel()', 'bloqueado', :'anon', 'anon',
  $q$select public.meu_papel()$q$);
