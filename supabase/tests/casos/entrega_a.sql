\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set rh '{"sub":"00000000-0000-0000-0000-000000000005","email":"rh@x.test","role":"authenticated"}'

-- Dados do arquivo (desfeitos no fim)
insert into public.linhas_telefonicas (id, numero, colaborador_id) values ('lin-ea', '(11) 98888-0001', 'emp-outro');

-- Chamado: linha, título e categoria com histórico ------------------------------------------
select harness.rodar('entrega_a', 'A1 T.I. liga a linha ao chamado e o histórico registra', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.chamados set linha_id = 'lin-ea' where id = 'tkt-2';
    perform harness.espera($s$select 1 from public.chamado_eventos where chamado_id = 'tkt-2' and tipo = 'vinculo'
      and detalhe = 'linha' and para = '(11) 98888-0001'$s$, 1);
  end $x$$q$);
select harness.rodar('entrega_a', 'A2 T.I. corrige título e categoria; o histórico guarda de → para', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.chamados set titulo = 'Notebook não liga', categoria = 'Hardware / Equipamento' where id = 'tkt-2';
    perform harness.espera($s$select 1 from public.chamado_eventos where chamado_id = 'tkt-2' and tipo = 'dados'
      and detalhe = 'título' and para = 'Notebook não liga'$s$, 1);
    perform harness.espera($s$select 1 from public.chamado_eventos where chamado_id = 'tkt-2' and tipo = 'dados'
      and detalhe = 'categoria'$s$, 1);
  end $x$$q$);
select harness.rodar('entrega_a', 'A3 quem abriu não corrige o título (0 linhas)', 'ok', :'colab', 'authenticated',
  $q$select harness.afeta($s$update public.chamados set titulo = 'x' where id = 'tkt-1'$s$, 0)$q$);
select harness.rodar('entrega_a', 'A4 linha excluída deixa o chamado sem vínculo', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    insert into public.linhas_telefonicas (id, numero) values ('lin-ea2', '(11) 98888-0002');
    update public.chamados set linha_id = 'lin-ea2' where id = 'tkt-2';
    delete from public.linhas_telefonicas where id = 'lin-ea2';
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-2' and linha_id is null$s$, 1);
  end $x$$q$);

-- Contestação do termo ------------------------------------------------------------------------
select harness.rodar('entrega_a', 'T1 colaborador contesta o próprio termo', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
    perform public.contestar_termo('tr-1', 'Não recebi o mouse listado');
    perform harness.espera($s$select 1 from public.termos_responsabilidade where id = 'tr-1'
      and contestacao_motivo = 'Não recebi o mouse listado' and contestacao_em is not null$s$, 1);
  end $x$$q$);
select harness.rodar('entrega_a', 'T2 colaborador não contesta termo de outra pessoa', 'bloqueado', :'colab', 'authenticated',
  $q$select public.contestar_termo('tr-2', 'Não é meu')$q$);
select harness.rodar('entrega_a', 'T3 contestação exige motivo', 'erro: Explique o que está errado no termo.', :'colab', 'authenticated',
  $q$select public.contestar_termo('tr-1', 'x')$q$);
select harness.rodar('entrega_a', 'T4 termo já aceito não é contestado', 'erro: Este termo não está mais aberto para contestação.', :'colab', 'authenticated',
  $q$do $x$ begin
    perform public.aceitar_termo('tr-1');
    perform public.contestar_termo('tr-1', 'Mudei de ideia');
  end $x$$q$);
select harness.rodar('entrega_a', 'T5 T.I. responde a contestação', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.termos_responsabilidade set contestacao_motivo = 'Série errada', contestacao_em = now() where id = 'tr-1';
    perform public.responder_contestacao('tr-1', 'Termo corrigido e reemitido');
    perform harness.espera($s$select 1 from public.termos_responsabilidade where id = 'tr-1'
      and contestacao_resposta = 'Termo corrigido e reemitido' and contestacao_respondida_por = 'emp-sup'$s$, 1);
  end $x$$q$);
select harness.rodar('entrega_a', 'T6 RH não responde contestação', 'bloqueado', :'rh', 'authenticated',
  $q$select public.responder_contestacao('tr-1', 'Resposta do RH')$q$);
select harness.rodar('entrega_a', 'T7 sem contestação não há o que responder',
  'erro: Este termo não tem contestação aguardando resposta.', :'sup', 'authenticated',
  $q$select public.responder_contestacao('tr-2', 'Nada a responder')$q$);

-- Limpar base também apaga linhas e estoque ---------------------------------------------------
select harness.rodar('entrega_a', 'L1 limpar base apaga linhas, histórico de linhas e estoque', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    insert into public.estoque_itens (id, nome, tipo) values ('est-ea', 'Cabo EA', 'cabo');
    insert into public.estoque_movimentos (item_id, tipo, quantidade) values ('est-ea', 'entrada', 3);
    perform public.limpar_base('APAGAR TUDO');
    perform harness.espera($s$select 1 from public.linhas_telefonicas$s$, 0);
    perform harness.espera($s$select 1 from public.linha_atribuicoes$s$, 0);
    perform harness.espera($s$select 1 from public.estoque_itens$s$, 0);
    perform harness.espera($s$select 1 from public.chamados$s$, 0);
  end $x$$q$);

-- Limpeza
delete from public.chamado_eventos where chamado_id = 'tkt-2' and tipo in ('vinculo', 'dados');
delete from public.linha_atribuicoes where linha_id = 'lin-ea';
delete from public.linhas_telefonicas where id = 'lin-ea';
