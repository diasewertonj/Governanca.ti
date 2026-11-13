\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set rh '{"sub":"00000000-0000-0000-0000-000000000005","email":"rh@x.test","role":"authenticated"}'

-- Processos (tkt-3 = admissão aberta pelo RH) ------------------------------------------
select harness.rodar('lote1', 'P1 admissão não encerra pelo seletor',
  'erro: Admissão e desligamento só se encerram por "Concluir" (checklist) ou "Cancelar" com motivo.', :'sup', 'authenticated',
  $q$update public.chamados set status = 'resolvido' where id = 'tkt-3'$q$);
select harness.rodar('lote1', 'P2 admissão não cancela pelo seletor',
  'erro: Admissão e desligamento só se encerram por "Concluir" (checklist) ou "Cancelar" com motivo.', :'sup', 'authenticated',
  $q$update public.chamados set status = 'cancelado', cancelamento_motivo = 'engano' where id = 'tkt-3'$q$);
select harness.rodar('lote1', 'P3 admissão pode ir para "em atendimento"', 'ok', :'sup', 'authenticated',
  $q$select harness.afeta($s$update public.chamados set status = 'em_andamento' where id = 'tkt-3'$s$, 1)$q$);
select harness.rodar('lote1', 'P4 quem abriu (RH) não cancela admissão', 'bloqueado', :'rh', 'authenticated',
  $q$select public.cancelar_chamado('tkt-3', 'engano', 'Candidato desistiu')$q$);
select harness.rodar('lote1', 'P5 T.I. cancela admissão só com a descrição do motivo',
  'erro: Para cancelar uma admissão ou um desligamento, descreva o motivo.', :'sup', 'authenticated',
  $q$select public.cancelar_chamado('tkt-3', 'engano')$q$);
select harness.rodar('lote1', 'P6 T.I. cancela admissão com motivo', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.cancelar_chamado('tkt-3', 'engano', 'Candidato desistiu');
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-3' and status = 'cancelado' and cancelado_por = 'emp-sup'$s$, 1);
  end $x$$q$);
select harness.rodar('lote1', 'P7 processo cancelado não reabre pelo seletor',
  'erro: Processo encerrado não pode ser reaberto.', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.cancelar_chamado('tkt-3', 'engano', 'Candidato desistiu');
    update public.chamados set status = 'aberto' where id = 'tkt-3';
  end $x$$q$);
select harness.rodar('lote1', 'P8 não cancela processo com passo que mexeu no inventário',
  'erro: Não dá para cancelar: estes passos já mexeram no inventário e precisam ser desfeitos antes: Conta Microsoft 365.', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.processo_itens (chamado_id, tipo, titulo, status) values ('tkt-3', 'conta', 'Conta Microsoft 365', 'feito');
    perform public.cancelar_chamado('tkt-3', 'engano', 'Candidato desistiu');
  end $x$$q$);
select harness.rodar('lote1', 'P9 concluir pelo checklist continua funcionando', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.processo_itens (chamado_id, tipo, titulo, status, observacao)
      values ('tkt-3', 'tarefa', 'Boas-vindas', 'nao_se_aplica', 'Remoto');
    perform public.concluir_processo('tkt-3');
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-3' and status = 'resolvido'$s$, 1);
  end $x$$q$);
select harness.rodar('lote1', 'P10 processo cancelado não é concluído', 'erro: Este processo foi cancelado', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.cancelar_chamado('tkt-3', 'engano', 'Candidato desistiu');
    perform public.concluir_processo('tkt-3');
  end $x$$q$);
select harness.rodar('lote1', 'P11 suporte: quem abriu ainda cancela o próprio chamado', 'ok', :'colab', 'authenticated',
  $q$select public.cancelar_chamado('tkt-1', 'engano')$q$);

-- Admissão ligada a pessoa ------------------------------------------------------------
select harness.rodar('lote1', 'A1 admissão não se liga a pessoa desligada',
  'erro: A admissão só pode ser ligada a uma pessoa ativa.', :'sup', 'authenticated',
  $q$update public.chamados set colaborador_id = 'emp-ex' where id = 'tkt-3'$q$);
select harness.rodar('lote1', 'A2 admissão liga a pessoa ativa', 'ok', :'sup', 'authenticated',
  $q$select harness.afeta($s$update public.chamados set colaborador_id = 'emp-outro' where id = 'tkt-3'$s$, 1)$q$);

-- Desligamento duplicado ----------------------------------------------------------------
select harness.rodar('lote1', 'D1 segundo desligamento aberto da mesma pessoa é recusado',
  'erro: duplicate key value violates unique constraint "uq_desligamento_aberto"', :'admin', 'authenticated',
  $q$do $x$ begin
    insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id,
      solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome, colaborador_id) values
      ('tkt-d1', '#D1', 'Deslig', 'd', 'offboarding', 'RH', 'alta', 'aberto', 'emp-admin', 'Admin', 'admin@x.test', 'A', 'TI', 'emp-outro'),
      ('tkt-d2', '#D2', 'Deslig', 'd', 'offboarding', 'RH', 'alta', 'aberto', 'emp-admin', 'Admin', 'admin@x.test', 'A', 'TI', 'emp-outro');
  end $x$$q$);

-- 1ª resposta ---------------------------------------------------------------------------
select harness.rodar('lote1', 'S1 mensagem da T.I. no próprio chamado não é 1ª resposta', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id,
      solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome) values
      ('tkt-s1', '#S1', 'Meu', 'd', 'suporte', 'c', 'media', 'aberto', 'emp-sup', 'Sup', 'sup@x.test', 'S', 'TI');
    insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_papel, texto, eh_nota_interna)
      values ('m-s1', 'tkt-s1', 'emp-sup', 'Sup', 'ti_suporte', 'abertura', false);
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-s1' and primeira_resposta_em is null$s$, 1);
    insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_papel, texto, eh_nota_interna)
      values ('m-s2', 'tkt-1', 'emp-sup', 'Sup', 'ti_suporte', 'Olá, vou ver', false);
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-1' and primeira_resposta_em is not null$s$, 1);
  end $x$$q$);

-- Colaborador: reativar e e-mail ----------------------------------------------------------
select harness.rodar('lote1', 'C1 suporte não reativa desligado', 'bloqueado', :'sup', 'authenticated',
  $q$update public.colaboradores set status = 'ativo' where id = 'emp-ex'$q$);
select harness.rodar('lote1', 'C2 admin reativa desligado', 'ok', :'admin', 'authenticated',
  $q$select harness.afeta($s$update public.colaboradores set status = 'ativo' where id = 'emp-ex'$s$, 1)$q$);
select harness.rodar('lote1', 'C3 e-mail de quem tem login não muda (nem pelo admin)', 'bloqueado', :'admin', 'authenticated',
  $q$update public.colaboradores set email = 'novo@x.test' where id = 'emp-colab'$q$);
select harness.rodar('lote1', 'C4 e-mail de quem não tem login muda', 'ok', :'sup', 'authenticated',
  $q$select harness.afeta($s$update public.colaboradores set email = 'outro2@x.test' where id = 'emp-outro'$s$, 1)$q$);
select harness.rodar('lote1', 'C5 anonimizar desligado com login continua possível', 'ok', :'admin', 'authenticated',
  $q$select public.anonimizar_colaborador('emp-ex')$q$);

-- Termo: cancelar / substituir -------------------------------------------------------------
select harness.rodar('lote1', 'T1 colaborador não cancela termo', 'bloqueado', :'colab', 'authenticated',
  $q$select public.cancelar_termo('tr-1', 'Termo errado')$q$);
select harness.rodar('lote1', 'T2 cancelar exige motivo', 'erro: Explique o motivo do cancelamento.', :'sup', 'authenticated',
  $q$select public.cancelar_termo('tr-1', 'x')$q$);
select harness.rodar('lote1', 'T3 substituto de outra pessoa é recusado',
  'erro: O termo substituto precisa ser da mesma pessoa e estar válido.', :'sup', 'authenticated',
  $q$select public.cancelar_termo('tr-1', 'Termo errado', 'tr-2')$q$);
select harness.rodar('lote1', 'T4 cancelado não pode mais ser assinado',
  'erro: Este termo foi cancelado e não pode mais ser alterado nem assinado.', :'colab', 'authenticated',
  $q$do $x$ begin
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
    perform public.cancelar_termo('tr-1', 'Itens errados');
    perform harness.espera($s$select 1 from public.termos_responsabilidade where id = 'tr-1' and cancelado_por = 'emp-sup'$s$, 1);
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
    perform public.aceitar_termo('tr-1');
  end $x$$q$);
select harness.rodar('lote1', 'T5 cancelar por update direto é recusado', 'erro: Use "Cancelar/substituir termo".', :'sup', 'authenticated',
  $q$update public.termos_responsabilidade set cancelado_em = now() where id = 'tr-1'$q$);

-- Licença: ativa/inativa e histórico de assentos -----------------------------------------------
select harness.rodar('lote1', 'L1 atribuir e liberar assento grava o histórico', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.licencas_software set assentos_totais = 5 where id = 'lic-1';
    perform public.alocar_licenca('lic-1', 'emp-colab');
    perform harness.espera($s$select 1 from public.licenca_atribuicoes where licenca_id = 'lic-1' and colaborador_id = 'emp-colab'
      and fim is null and atribuido_por = 'emp-sup'$s$, 1);
    perform public.revogar_licenca('lic-1', 'emp-colab');
    perform harness.espera($s$select 1 from public.licenca_atribuicoes where licenca_id = 'lic-1' and fim is not null
      and removido_por = 'emp-sup'$s$, 1);
  end $x$$q$);
select harness.rodar('lote1', 'L2 colaborador vê só o próprio histórico de assentos', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
    update public.licencas_software set assentos_totais = 5 where id = 'lic-1';
    perform public.alocar_licenca('lic-1', 'emp-colab');
    perform public.alocar_licenca('lic-1', 'emp-outro');
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
    perform harness.espera($s$select 1 from public.licenca_atribuicoes$s$, 1);
  end $x$$q$);
select harness.rodar('lote1', 'L3 assentos não ficam abaixo dos em uso',
  'erro: Assentos totais (1) não podem ser menos que os 2 em uso.', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.licencas_software set assentos_totais = 5 where id = 'lic-1';
    perform public.alocar_licenca('lic-1', 'emp-colab');
    perform public.alocar_licenca('lic-1', 'emp-outro');
    update public.licencas_software set assentos_totais = 1 where id = 'lic-1';
  end $x$$q$);
select harness.rodar('lote1', 'L4 inativar exige motivo', 'erro: Informe o motivo da inativação.', :'sup', 'authenticated',
  $q$update public.licencas_software set status = 'inativa' where id = 'lic-1'$q$);
select harness.rodar('lote1', 'L5 inativar com assento em uso é recusado',
  'erro: Libere os 1 assento(s) em uso antes de inativar a licença.', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.licencas_software set assentos_totais = 5 where id = 'lic-1';
    perform public.alocar_licenca('lic-1', 'emp-colab');
    update public.licencas_software set status = 'inativa', inativacao_motivo = 'Contrato encerrado' where id = 'lic-1';
  end $x$$q$);
select harness.rodar('lote1', 'L6 licença inativa não recebe assento', 'erro: Licença inativa não recebe assentos.', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.licencas_software set assentos_totais = 5 where id = 'lic-1';
    update public.licencas_software set status = 'inativa', inativacao_motivo = 'Contrato encerrado' where id = 'lic-1';
    perform harness.espera($s$select 1 from public.licencas_software where id = 'lic-1' and inativada_por = 'emp-sup'$s$, 1);
    perform public.alocar_licenca('lic-1', 'emp-colab');
  end $x$$q$);
select harness.rodar('lote1', 'L7 suporte não reativa licença', 'bloqueado', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.licencas_software set status = 'inativa', inativacao_motivo = 'Contrato encerrado' where id = 'lic-1';
    update public.licencas_software set status = 'ativa' where id = 'lic-1';
  end $x$$q$);
select harness.rodar('lote1', 'L8 admin reativa licença', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    update public.licencas_software set status = 'inativa', inativacao_motivo = 'Contrato encerrado' where id = 'lic-1';
    update public.licencas_software set status = 'ativa' where id = 'lic-1';
  end $x$$q$);

-- Fatura x contrato de licenciamento ---------------------------------------------------------
select harness.rodar('lote1', 'F1 licença sem contrato aceita fatura própria', 'ok', :'sup', 'authenticated',
  $q$insert into public.faturas (licenca_id, competencia, valor, vencimento) values ('lic-1', '2026-11-01', 100, '2026-11-10')$q$);
select harness.rodar('lote1', 'F2 licença coberta por contrato de licenciamento vigente recusa fatura própria',
  'erro: Esta licença é paga pelo contrato CT-9: lance a fatura no contrato.', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.fornecedores (id, nome) values ('forn-l1', 'Fornecedor L1');
    insert into public.contratos (id, fornecedor_id, tipo, numero, descricao, inicio) values
      ('ct-l1', 'forn-l1', 'licenciamento', 'CT-9', 'Office anual', '2026-01-01');
    insert into public.contrato_itens (contrato_id, licenca_id) values ('ct-l1', 'lic-1');
    insert into public.faturas (licenca_id, competencia, valor, vencimento) values ('lic-1', '2026-11-01', 100, '2026-11-10');
  end $x$$q$);
select harness.rodar('lote1', 'F3 contrato encerrado não bloqueia a fatura da licença', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.fornecedores (id, nome) values ('forn-l1', 'Fornecedor L1');
    insert into public.contratos (id, fornecedor_id, tipo, numero, descricao, inicio, fim) values
      ('ct-l1', 'forn-l1', 'licenciamento', 'CT-9', 'Office anual', '2025-01-01', '2025-12-31');
    insert into public.contrato_itens (contrato_id, licenca_id) values ('ct-l1', 'lic-1');
    insert into public.faturas (licenca_id, competencia, valor, vencimento) values ('lic-1', '2026-11-01', 100, '2026-11-10');
  end $x$$q$);

-- Limpar base ---------------------------------------------------------------------------------
select harness.rodar('lote1', 'B1 suporte não limpa a base', 'bloqueado', :'sup', 'authenticated',
  $q$select public.limpar_base('APAGAR TUDO')$q$);
select harness.rodar('lote1', 'B2 confirmação errada não apaga', 'erro: Confirmação inválida.', :'admin', 'authenticated',
  $q$select public.limpar_base('sim')$q$);
select harness.rodar('lote1', 'B3 admin limpa tudo de uma vez (inclui histórico e checklist) e mantém quem pediu', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    insert into public.processo_itens (chamado_id, tipo, titulo) values ('tkt-3', 'tarefa', 'Boas-vindas');
    update public.chamados set status = 'em_andamento' where id = 'tkt-1';
    perform public.limpar_base('APAGAR TUDO', 'colab@x.test');
    perform harness.espera($s$select 1 from public.chamados$s$, 0);
    perform harness.espera($s$select 1 from public.chamado_eventos$s$, 0);
    perform harness.espera($s$select 1 from public.processo_itens$s$, 0);
    perform harness.espera($s$select 1 from public.ativos$s$, 0);
    perform harness.espera($s$select 1 from public.colaboradores where id in ('emp-admin', 'emp-colab')$s$, 2);
    perform harness.espera($s$select 1 from public.colaboradores$s$, 2);
  end $x$$q$);
