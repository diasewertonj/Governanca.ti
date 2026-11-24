\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'

-- Dados do arquivo (desfeitos no fim)
insert into public.linhas_telefonicas (id, numero) values ('lin-ck1', '(11) 97777-0001');
insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id,
  solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome, cancelamento_motivo, cancelamento_detalhe) values
  ('tkt-ck1', '#CH-CK1', 'Encerrado', 'd', 'suporte', 'c', 'media', 'cancelado', 'emp-outro', 'Outro', 'outro@x.test', 'A', 'TI', 'engano', 'teste');
update public.chamados set linha_id = 'lin-ck1', ativo_id = 'ast-1' where id = 'tkt-ck1';
insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id,
  solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome) values
  ('tkt-ck2', '#CH-CK2', 'Admissão aberta', 'd', 'onboarding', 'Onboarding', 'alta', 'aberto', 'emp-rh', 'RH', 'rh@x.test', 'RH', 'RH'),
  ('tkt-ck6', '#CH-CK6', 'Suporte do próprio técnico', 'd', 'suporte', 'c', 'media', 'aberto', 'emp-sup', 'Sup', 'sup@x.test', 'Suporte', 'TI'),
  ('tkt-ck7', '#CH-CK7', 'Suporte do colaborador', 'd', 'suporte', 'c', 'media', 'aberto', 'emp-colab', 'Colab', 'colab@x.test', 'Analista', 'TI');
insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id,
  solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome, cancelamento_motivo, cancelamento_detalhe) values
  ('tkt-ck5', '#CH-CK5', 'Admissão cancelada', 'd', 'onboarding', 'Onboarding', 'alta', 'cancelado', 'emp-rh', 'RH', 'rh@x.test', 'RH', 'RH', 'engano', 'teste');
insert into public.processo_itens (id, chamado_id, tipo, titulo, status, ordem) values
  ('it-ck-feito', 'tkt-ck2', 'tarefa', 'Passo já feito', 'feito', 1),
  ('it-ck-pend', 'tkt-ck2', 'tarefa', 'Passo pendente', 'pendente', 2),
  ('it-ck-enc', 'tkt-ck5', 'tarefa', 'Passo de processo encerrado', 'pendente', 1);
insert into public.termos_responsabilidade (id, codigo, tipo, colaborador_id, colaborador_nome, colaborador_matricula,
  colaborador_cargo, colaborador_setor_nome, status_assinatura, responsavel_ti_id, responsavel_ti_nome) values
  ('tr-ck1', '#TR-CK1', 'entrega', 'emp-colab', 'Colab', 'M2', 'A', 'TI', 'gerado', 'emp-sup', 'Sup'),
  ('tr-ck3', '#TR-CK3', 'entrega', 'emp-colab', 'Colab', 'M2', 'A', 'TI', 'gerado', 'emp-sup', 'Sup');
update public.termos_responsabilidade set contestacao_motivo = 'Número de série errado', contestacao_em = now() where id = 'tr-ck3';
insert into public.termos_responsabilidade (id, codigo, tipo, colaborador_id, colaborador_nome, colaborador_matricula,
  colaborador_cargo, colaborador_setor_nome, status_assinatura, responsavel_ti_id, responsavel_ti_nome,
  contestacao_motivo, contestacao_em, cancelado_em, cancelamento_motivo) values
  ('tr-ck2', '#TR-CK2', 'entrega', 'emp-colab', 'Colab', 'M2', 'A', 'TI', 'gerado', 'emp-sup', 'Sup',
   'Item errado', now(), now(), 'Substituído');
insert into public.termos_responsabilidade (id, codigo, tipo, colaborador_id, colaborador_nome, colaborador_matricula,
  colaborador_cargo, colaborador_setor_nome, status_assinatura, responsavel_ti_id, responsavel_ti_nome, cancelado_em, cancelamento_motivo) values
  ('tr-ck4', '#TR-CK4', 'entrega', 'emp-colab', 'Colab', 'M2', 'A', 'TI', 'gerado', 'emp-sup', 'Sup', now(), 'Substituído');

-- 1. Desvínculo por exclusão passa; troca de vínculo continua barrada
select harness.rodar('check', 'K1 excluir linha ligada a chamado encerrado funciona', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    delete from public.linhas_telefonicas where id = 'lin-ck1';
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-ck1' and linha_id is null$s$, 1);
  end $x$$q$);
select harness.rodar('check', 'K2 trocar o equipamento de chamado encerrado continua barrado',
  'erro: Chamado encerrado não pode ser alterado. Reabra o chamado para mudar algo.', :'sup', 'authenticated',
  $q$update public.chamados set ativo_id = 'ast-2' where id = 'tkt-ck1'$q$);
select harness.rodar('check', 'K3 chamado encerrado não reabre por UPDATE direto',
  'erro: Chamado encerrado só volta a ficar aberto pelo botão "Reabrir".', :'sup', 'authenticated',
  $q$update public.chamados set status = 'aberto' where id = 'tkt-ck1'$q$);

-- 2/4. Termo contestado
select harness.rodar('check', 'K4 contestar cria lembrete para a T.I.', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
    perform public.contestar_termo('tr-ck1', 'O notebook não é este');
    -- lembretes são da T.I.: confere com o login do suporte
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}', true);
    perform harness.espera($s$select 1 from public.lembretes where status = 'aberto' and titulo like 'Responder contestação do termo —%'$s$, 1);
  end $x$$q$);
select harness.rodar('check', 'K5 colaborador não assina termo com contestação aberta',
  'erro: Aguardando resposta da T.I. à contestação: o termo não pode ser assinado agora.', :'colab', 'authenticated',
  $q$select public.aceitar_termo('tr-ck3')$q$);
select harness.rodar('check', 'K6 T.I. não assina termo com contestação aberta',
  'erro: Aguardando resposta da T.I. à contestação: o termo não pode ser assinado agora.', :'sup', 'authenticated',
  $q$select public.aceitar_termo('tr-ck3')$q$);
select harness.rodar('check', 'K7 depois da resposta a T.I. e o colaborador assinam; o lembrete se cumpre', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.responder_contestacao('tr-ck3', 'Corrigido, pode assinar');
    perform public.aceitar_termo('tr-ck3');
    perform harness.espera($s$select 1 from public.termos_responsabilidade where id = 'tr-ck3' and aceite_ti_em is not null$s$, 1);
  end $x$$q$);
select harness.rodar('check', 'K8 responder fecha o lembrete da contestação', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    -- (o código do termo é gerado pelo banco)
    insert into public.lembretes (titulo, vence_em)
      select 'Responder contestação do termo — ' || codigo, current_date from public.termos_responsabilidade where id = 'tr-ck3';
    perform public.responder_contestacao('tr-ck3', 'Corrigido, pode assinar');
    perform harness.espera($s$select 1 from public.lembretes where titulo like 'Responder contestação do termo —%' and status = 'feito'$s$, 1);
  end $x$$q$);
select harness.rodar('check', 'K9 responder contestação de termo cancelado é recusado',
  'erro: Este termo foi cancelado: não há o que responder.', :'sup', 'authenticated',
  $q$select public.responder_contestacao('tr-ck2', 'Resposta qualquer')$q$);
select harness.rodar('check', 'K10 aceitar termo cancelado é recusado',
  'erro: Este termo foi cancelado e não pode mais ser alterado nem assinado.', :'colab', 'authenticated',
  $q$select public.aceitar_termo('tr-ck4')$q$);

-- 6/7. Passos do checklist
select harness.rodar('check', 'K11 o mesmo passo não entra duas vezes',
  'erro: Este passo já está no checklist (o checklist pode ter sido salvo em outra tela). Atualize a página.', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.processo_itens (chamado_id, tipo, titulo, ordem) values ('tkt-ck2', 'tarefa', 'Passo novo', 3);
    insert into public.processo_itens (chamado_id, tipo, titulo, ordem) values ('tkt-ck2', 'tarefa', 'Passo novo', 4);
  end $x$$q$);
select harness.rodar('check', 'K12 passos diferentes entram normalmente', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.processo_itens (chamado_id, tipo, titulo, ordem) values ('tkt-ck2', 'tarefa', 'Passo novo A', 3), ('tkt-ck2', 'tarefa', 'Passo novo B', 4);
  end $x$$q$);
select harness.rodar('check', 'K13 passo já feito não é apagado',
  'erro: Este passo já foi feito e não pode ser removido do checklist.', :'sup', 'authenticated',
  $q$delete from public.processo_itens where id = 'it-ck-feito'$q$);
select harness.rodar('check', 'K14 passo pendente de processo aberto pode ser apagado', 'ok', :'sup', 'authenticated',
  $q$select harness.afeta($s$delete from public.processo_itens where id = 'it-ck-pend'$s$, 1)$q$);
select harness.rodar('check', 'K15 processo encerrado não recebe passo novo',
  'erro: O processo já foi encerrado: não dá para incluir passos.', :'sup', 'authenticated',
  $q$insert into public.processo_itens (chamado_id, tipo, titulo, ordem) values ('tkt-ck5', 'tarefa', 'Tardio', 2)$q$);
select harness.rodar('check', 'K16 processo encerrado não perde passo',
  'erro: O processo já foi encerrado: os passos não podem ser removidos.', :'sup', 'authenticated',
  $q$delete from public.processo_itens where id = 'it-ck-enc'$q$);

-- 8. Admissão sem colaborador cadastrado
select harness.rodar('check', 'K17 admissão sem colaborador cadastrado não conclui',
  'erro: A admissão ainda não tem o colaborador cadastrado. Faça o passo "Cadastro" (não pode ficar como "não se aplica") antes de concluir.',
  :'sup', 'authenticated',
  $q$do $x$ begin
    update public.processo_itens set status = 'nao_se_aplica', observacao = 'Sem cadastro' where chamado_id = 'tkt-ck2' and status = 'pendente';
    perform public.concluir_processo('tkt-ck2');
  end $x$$q$);

-- 9. Primeira resposta
select harness.rodar('check', 'K18 técnico que assume o próprio chamado não conta como 1ª resposta', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.chamados set tecnico_responsavel_id = 'emp-sup', tecnico_responsavel_nome = 'Sup' where id = 'tkt-ck6';
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-ck6' and primeira_resposta_em is null$s$, 1);
  end $x$$q$);
select harness.rodar('check', 'K19 técnico que assume chamado de outra pessoa carimba a 1ª resposta', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.chamados set tecnico_responsavel_id = 'emp-sup', tecnico_responsavel_nome = 'Sup' where id = 'tkt-ck7';
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-ck7' and primeira_resposta_em is not null$s$, 1);
  end $x$$q$);

-- Limpeza
delete from public.lembretes where titulo like 'Responder contestação do termo —%';
delete from public.termos_responsabilidade where id in ('tr-ck1', 'tr-ck2', 'tr-ck3', 'tr-ck4');
delete from public.processo_itens where chamado_id in ('tkt-ck2', 'tkt-ck5');
delete from public.chamado_mensagens where chamado_id like 'tkt-ck%';
delete from public.chamado_eventos where chamado_id like 'tkt-ck%';
delete from public.chamados where id like 'tkt-ck%';
delete from public.linhas_telefonicas where id = 'lin-ck1';
