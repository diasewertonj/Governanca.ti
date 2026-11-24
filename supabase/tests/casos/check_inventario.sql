\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'

-- Dados fixos do check (como postgres); removidos no fim
insert into public.ativos (id, tag, nome, categoria, marca, modelo, serial_number, status, localizacao_fisica, custodiante_id) values
  ('chk-a1', '#CK1', 'Monitor estoque', 'periferico', 'M', 'X', 'CKSN1', 'disponivel', 'chk-sala', null),
  ('chk-a2', '#CK2', 'Notebook com Outro', 'hardware', 'M', 'X', 'CKSN2', 'em_uso', 'chk-casa', 'emp-outro'),
  ('chk-a3', '#CK3', 'Teclado estoque', 'periferico', 'M', 'X', 'CKSN3', 'disponivel', 'chk-sala', null);
select set_config('app.operacao_baixa', 'sim', false);
insert into public.ativos (id, tag, nome, categoria, marca, modelo, serial_number, status, localizacao_fisica) values
  ('chk-a4', '#CK4', 'Mouse baixado', 'periferico', 'M', 'X', 'CKSN4', 'descartado', 'chk-sala');
select set_config('app.operacao_baixa', '', false);
insert into public.historico_custodia (id, ativo_id, colaborador_id, colaborador_nome, data_entrega) values
  ('chk-h2', 'chk-a2', 'emp-outro', 'Outro', '2026-01-01');
insert into public.licencas_software (id, nome, fornecedor, data_renovacao, assentos_totais) values
  ('chk-lic', 'Licença check', 'MS', '2027-01-01', 5);
insert into public.fornecedores (id, nome) values ('chk-forn', 'Fornecedor do check');
insert into public.contratos (id, fornecedor_id, tipo, descricao, inicio, fim, valor, periodicidade) values
  ('chk-ct1', 'chk-forn', 'suporte', 'Contrato ativo', '2026-01-01', '2026-12-31', 100, 'mensal');
insert into public.contratos (id, fornecedor_id, tipo, descricao, inicio, fim, valor, periodicidade, status, encerrado_em, encerramento_motivo) values
  ('chk-ct2', 'chk-forn', 'suporte', 'Contrato encerrado', '2025-01-01', '2026-12-31', 100, 'mensal', 'encerrado', '2026-06-01', 'Cancelado pelo fornecedor');

-- Transferência de custódia (atômica) ---------------------------------------------------------------
select harness.rodar('check_inv', 'T1 entrega: abre a entrada, muda custodiante e status', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.transferir_custodia('chk-a1', 'emp-colab', null, 'Home office', '2026-11-20');
    perform harness.espera($s$select 1 from public.ativos where id = 'chk-a1' and custodiante_id = 'emp-colab' and status = 'em_uso' and data_entrega_atual = '2026-11-20'$s$, 1);
    perform harness.espera($s$select 1 from public.historico_custodia where ativo_id = 'chk-a1' and data_devolucao is null and colaborador_nome = 'Colab' and observacoes like '%Home office%'$s$, 1);
  end $x$$q$);
select harness.rodar('check_inv', 'T2 troca de mãos fecha a entrada anterior e abre a nova', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.transferir_custodia('chk-a2', 'emp-colab', 'Troca de equipe', null, '2026-11-20');
    perform harness.espera($s$select 1 from public.historico_custodia where id = 'chk-h2' and data_devolucao = '2026-11-20' and motivo_devolucao = 'Troca de equipe'$s$, 1);
    perform harness.espera($s$select 1 from public.historico_custodia where ativo_id = 'chk-a2' and data_devolucao is null and colaborador_id = 'emp-colab'$s$, 1);
    perform harness.espera($s$select 1 from public.ativos where id = 'chk-a2' and custodiante_id = 'emp-colab' and status = 'em_uso'$s$, 1);
  end $x$$q$);
select harness.rodar('check_inv', 'T3 devolução ao estoque deixa o ativo disponível', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.transferir_custodia('chk-a2', null, null, null, '2026-11-20');
    perform harness.espera($s$select 1 from public.ativos where id = 'chk-a2' and custodiante_id is null and status = 'disponivel' and data_entrega_atual is null$s$, 1);
    perform harness.espera($s$select 1 from public.historico_custodia where ativo_id = 'chk-a2' and data_devolucao is null$s$, 0);
  end $x$$q$);
select harness.rodar('check_inv', 'T4 colaborador comum não transfere custódia', 'bloqueado', :'colab', 'authenticated',
  $q$select public.transferir_custodia('chk-a1', 'emp-colab')$q$);
select harness.rodar('check_inv', 'T5 não entrega a colaborador desligado', 'erro: Colaborador não encontrado ou desligado', :'sup', 'authenticated',
  $q$select public.transferir_custodia('chk-a1', 'emp-ex')$q$);
select harness.rodar('check_inv', 'T6 ativo baixado não muda de custódia', 'erro: O ativo #CK4 está baixado e não pode mudar de custódia', :'sup', 'authenticated',
  $q$select public.transferir_custodia('chk-a4', 'emp-colab')$q$);
select harness.rodar('check_inv', 'T7 entregar ao mesmo custodiante é recusado', 'erro: O ativo #CK2 já está nesta custódia', :'sup', 'authenticated',
  $q$select public.transferir_custodia('chk-a2', 'emp-outro')$q$);

-- Licença ---------------------------------------------------------------------------------------------
select harness.rodar('check_inv', 'L1 aloca assento a colaborador ativo', 'ok', :'sup', 'authenticated',
  $q$select public.alocar_licenca('chk-lic', 'emp-colab')$q$);
select harness.rodar('check_inv', 'L2 colaborador desligado não recebe assento', 'erro: Colaborador não encontrado ou desligado', :'sup', 'authenticated',
  $q$select public.alocar_licenca('chk-lic', 'emp-ex')$q$);
select harness.rodar('check_inv', 'L3 colaborador inexistente não recebe assento', 'erro: Colaborador não encontrado ou desligado', :'sup', 'authenticated',
  $q$select public.alocar_licenca('chk-lic', 'emp-fantasma')$q$);

-- Contratos -------------------------------------------------------------------------------------------
select harness.rodar('check_inv', 'C1 renova contrato vigente', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.renovar_contrato('chk-ct1', '2027-01-01', '2027-12-31', 120);
    perform harness.espera($s$select 1 from public.contratos where renovado_de = 'chk-ct1'$s$, 1);
  end $x$$q$);
select harness.rodar('check_inv', 'C2 contrato já renovado não renova de novo', 'erro: Este contrato já foi renovado. Renove a versão mais recente', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.renovar_contrato('chk-ct1', '2027-01-01', '2027-12-31', 120);
    perform public.renovar_contrato('chk-ct1', '2027-01-01', '2027-12-31', 130);
  end $x$$q$);
select harness.rodar('check_inv', 'C3 contrato encerrado não renova', 'erro: Contrato encerrado não pode ser renovado. Cadastre um novo contrato', :'sup', 'authenticated',
  $q$select public.renovar_contrato('chk-ct2', '2027-01-01', '2027-12-31', 120)$q$);

-- Inventário físico -----------------------------------------------------------------------------------
select harness.rodar('check_inv', 'I1 conferência do local não inclui ativo baixado', 'ok', :'sup', 'authenticated',
  $q$do $x$
  declare v text;
  begin
    v := public.abrir_inventario('Sala check', 'chk-sala');
    perform harness.espera(format($s$select 1 from public.inventario_itens where inventario_id = %L$s$, v), 2);
    perform harness.espera(format($s$select 1 from public.inventario_itens where inventario_id = %L and ativo_id = 'chk-a4'$s$, v), 0);
  end $x$$q$);
select harness.rodar('check_inv', 'I2 incluir à mão um ativo baixado é recusado', 'erro: Este equipamento está baixado e não entra na conferência', :'sup', 'authenticated',
  $q$do $x$
  declare v text;
  begin
    v := public.abrir_inventario('Sala check', 'chk-sala');
    insert into public.inventario_itens (inventario_id, ativo_id) values (v, 'chk-a4');
  end $x$$q$);
select harness.rodar('check_inv', 'I3 baixado durante a conferência: fechar não gera "não encontrado" nem lembrete', 'ok', :'admin', 'authenticated',
  $q$do $x$
  declare v text; r jsonb;
  begin
    v := public.abrir_inventario('Sala check', 'chk-sala');
    update public.inventario_itens set situacao = 'encontrado' where inventario_id = v and ativo_id = 'chk-a1';
    perform public.baixar_ativo('chk-a3', '{"motivo":"defeito","destino":"descarte"}');
    r := public.fechar_inventario(v, false);
    if (r ->> 'nao_encontrados')::int <> 0 or (r ->> 'baixados')::int <> 1 then raise exception 'resumo errado: %', r; end if;
    perform harness.espera($s$select 1 from public.lembretes where ativo_id = 'chk-a3'$s$, 0);
    perform harness.espera(format($s$select 1 from public.inventario_itens where inventario_id = %L and ativo_id = 'chk-a3' and situacao = 'pendente'$s$, v), 1);
  end $x$$q$);
select harness.rodar('check_inv', 'I4 baixado em "outro local" não tem o local atualizado ao fechar', 'ok', :'admin', 'authenticated',
  $q$do $x$
  declare v text;
  begin
    v := public.abrir_inventario('Sala check', 'chk-sala');
    update public.inventario_itens set situacao = 'outro_local', local_encontrado = 'Sala 9' where inventario_id = v and ativo_id = 'chk-a3';
    perform public.baixar_ativo('chk-a3', '{"motivo":"defeito","destino":"descarte"}');
    perform public.fechar_inventario(v, true);
    perform harness.espera($s$select 1 from public.ativos where id = 'chk-a3' and localizacao_fisica = 'chk-sala'$s$, 1);
  end $x$$q$);
select harness.rodar('check_inv', 'I5 "todos" não abre com outra conferência aberta', 'erro: Há conferência aberta. Feche ou cancele antes de abrir uma de todos os equipamentos', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.abrir_inventario('Sala check', 'chk-sala');
    perform public.abrir_inventario('Geral check', '');
  end $x$$q$);
select harness.rodar('check_inv', 'I6 conferência de local não abre com "todos" aberta', 'erro: Há uma conferência de todos os equipamentos aberta. Feche ou cancele antes de abrir outra', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.abrir_inventario('Geral check', '');
    perform public.abrir_inventario('Sala check', 'chk-sala');
  end $x$$q$);
select harness.rodar('check_inv', 'I7 locais diferentes convivem abertos', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.abrir_inventario('Sala check', 'chk-sala');
    perform public.abrir_inventario('Casa check', 'chk-casa');
  end $x$$q$);

-- Limpeza
delete from public.contratos where id like 'chk-%' or renovado_de like 'chk-%';
delete from public.fornecedores where id = 'chk-forn';
delete from public.licencas_software where id = 'chk-lic';
delete from public.historico_custodia where ativo_id like 'chk-%';
delete from public.lembretes where ativo_id like 'chk-%';
select set_config('app.operacao_baixa', 'sim', false);
delete from public.ativos where id like 'chk-%';
select set_config('app.operacao_baixa', '', false);
