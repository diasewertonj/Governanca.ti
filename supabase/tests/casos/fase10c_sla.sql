\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'

insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id,
  solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome) values
  ('tkt-11', '#Y', 'Wi-Fi', 'Cai toda hora', 'suporte', 'Rede', 'media', 'aberto', 'emp-colab',
   'Colab', 'colab@x.test', 'A', 'TI');

select harness.rodar('fase10c', 'S1 chamado novo começa sem 1ª resposta', 'ok', null, null,
  $q$select harness.espera($s$select 1 from public.chamados where id = 'tkt-11' and primeira_resposta_em is null$s$, 1)$q$);
select harness.rodar('fase10c', 'S2 T.I. assumir o chamado carimba a 1ª resposta', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.chamados set tecnico_responsavel_id = 'emp-sup', tecnico_responsavel_nome = 'Sup' where id = 'tkt-11';
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-11' and primeira_resposta_em is not null$s$, 1);
  end $x$$q$);
select harness.rodar('fase10c', 'S3 resposta pública da T.I. carimba; nota interna não', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_papel, texto, eh_nota_interna)
      values ('m-s3a', 'tkt-11', 'emp-sup', 'Sup', 'ti_suporte', 'anotação', true);
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-11' and primeira_resposta_em is null$s$, 1);
    insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_papel, texto, eh_nota_interna)
      values ('m-s3b', 'tkt-11', 'emp-sup', 'Sup', 'ti_suporte', 'Vou verificar', false);
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-11' and primeira_resposta_em is not null$s$, 1);
  end $x$$q$);
select harness.rodar('fase10c', 'S4 mensagem de quem abriu não conta como resposta', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
    insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_papel, texto, eh_nota_interna)
      values ('m-s4', 'tkt-11', 'emp-colab', 'Colab', 'colaborador', 'Alguma novidade?', false);
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-11' and primeira_resposta_em is null$s$, 1);
  end $x$$q$);
select harness.rodar('fase10c', 'S5 só o admin grava os prazos na configuração', 'ok', :'admin', 'authenticated',
  $q$select harness.afeta($s$update public.configuracoes_empresa set sla = '{"critica":{"resposta":60,"solucao":240}}'$s$, 1)$q$);
select harness.rodar('fase10c', 'S6 suporte não altera os prazos', 'ok', :'sup', 'authenticated',
  $q$select harness.afeta($s$update public.configuracoes_empresa set sla = '{}'$s$, 0)$q$);

delete from public.chamado_eventos where chamado_id = 'tkt-11';
delete from public.chamado_mensagens where chamado_id = 'tkt-11';
delete from public.chamados where id = 'tkt-11';
