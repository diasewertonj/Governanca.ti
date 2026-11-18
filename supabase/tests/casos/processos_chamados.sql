\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set rh '{"sub":"00000000-0000-0000-0000-000000000005","email":"rh@x.test","role":"authenticated"}'

-- Dados do arquivo (desfeitos no fim)
insert into public.colaboradores (id, matricula, nome, email, cargo, setor_id, status, role, data_admissao) values
  ('emp-pc', 'MPC', 'Pessoa PC', 'pc@x.test', 'Analista', 'dep-1', 'ativo', 'colaborador', '2026-01-01');
insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id,
  solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome, colaborador_id, offboarding) values
  ('tkt-pc1', '#CH-PC1', 'Desligamento Outro', 'd', 'offboarding', 'Offboarding', 'alta', 'em_andamento', 'emp-rh', 'RH', 'rh@x.test', 'RH', 'RH',
   'emp-pc', '{"colaboradorId": "emp-pc", "checklist": []}'::jsonb),
  ('tkt-pc2', '#CH-PC2', 'Desligamento concluído', 'd', 'offboarding', 'Offboarding', 'alta', 'resolvido', 'emp-rh', 'RH', 'rh@x.test', 'RH', 'RH',
   'emp-ex', '{"colaboradorId": "emp-ex", "checklist": []}'::jsonb);
insert into public.processo_itens (chamado_id, tipo, titulo, status) values
  ('tkt-pc1', 'entregar_linha', 'Devolver linha (11) 9999', 'feito');

-- Cancelar processo com linha já mexida: pede ciência e cria o lembrete
select harness.rodar('processos', 'P1 linha feita entra na lista do que reverter',
  'erro: Estes passos já foram feitos e precisam ser revertidos: Devolver linha (11) 9999. Confirme que vai revertê-los para cancelar.', :'sup', 'authenticated',
  $q$select public.cancelar_processo('tkt-pc1', 'engano', 'Aberto por engano')$q$);
select harness.rodar('processos', 'P2 com ciência cancela e cria lembrete da linha', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.cancelar_processo('tkt-pc1', 'engano', 'Aberto por engano', true);
    perform harness.espera($s$select 1 from public.lembretes where chamado_id = 'tkt-pc1' and status = 'aberto'
      and descricao like '%Devolver linha (11) 9999%'$s$, 1);
  end $x$$q$);

-- Caminho antigo recusa processo com checklist
select harness.rodar('processos', 'P3 concluir_offboarding recusa processo com checklist',
  'erro: Este desligamento tem checklist: conclua pelo checklist.', :'sup', 'authenticated',
  $q$select public.concluir_offboarding('tkt-pc1')$q$);

-- Reabrir processo concluído
select harness.rodar('processos', 'P4 suporte não reabre processo concluído', 'bloqueado', :'sup', 'authenticated',
  $q$select public.reabrir_processo('tkt-pc2', 'Concluído por engano')$q$);
select harness.rodar('processos', 'P5 RH não reabre processo concluído', 'bloqueado', :'rh', 'authenticated',
  $q$select public.reabrir_processo('tkt-pc2', 'Concluído por engano')$q$);
select harness.rodar('processos', 'P6 admin precisa explicar o motivo',
  'erro: Explique por que o processo precisa ser reaberto.', :'admin', 'authenticated',
  $q$select public.reabrir_processo('tkt-pc2', 'x')$q$);
select harness.rodar('processos', 'P7 admin reabre: processo em atendimento, pessoa ativa, motivo na conversa', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.reabrir_processo('tkt-pc2', 'Concluído por engano');
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-pc2' and status = 'em_andamento'$s$, 1);
    perform harness.espera($s$select 1 from public.colaboradores where id = 'emp-ex' and status = 'ativo'$s$, 1);
    perform harness.espera($s$select 1 from public.chamado_mensagens where chamado_id = 'tkt-pc2'
      and texto = 'Processo reaberto: Concluído por engano' and eh_nota_interna$s$, 1);
  end $x$$q$);
select harness.rodar('processos', 'P8 processo em andamento não é "reaberto"',
  'erro: Só uma admissão ou um desligamento concluído pode ser reaberto.', :'admin', 'authenticated',
  $q$select public.reabrir_processo('tkt-pc1', 'Concluído por engano')$q$);
select harness.rodar('processos', 'P9 seletor continua sem reabrir processo encerrado',
  'erro: Processo encerrado não pode ser reaberto.', :'admin', 'authenticated',
  $q$update public.chamados set status = 'em_andamento' where id = 'tkt-pc2'$q$);

-- Limpeza
delete from public.lembretes where chamado_id in ('tkt-pc1', 'tkt-pc2');
delete from public.processo_itens where chamado_id in ('tkt-pc1', 'tkt-pc2');
delete from public.chamado_mensagens where chamado_id in ('tkt-pc1', 'tkt-pc2');
delete from public.chamado_eventos where chamado_id in ('tkt-pc1', 'tkt-pc2');
delete from public.chamados where id in ('tkt-pc1', 'tkt-pc2');
delete from public.colaboradores where id = 'emp-pc';
update public.colaboradores set status = 'desligado' where id = 'emp-ex';
