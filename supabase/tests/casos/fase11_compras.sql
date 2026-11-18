\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set rh '{"sub":"00000000-0000-0000-0000-000000000005","email":"rh@x.test","role":"authenticated"}'

-- Dados do arquivo (desfeitos no fim)
insert into public.fornecedores (id, nome) values ('for-f11', 'Fornecedor F11');
insert into public.estoque_itens (id, nome, tipo) values ('est-f11', 'Mouse F11', 'mouse');
insert into public.pedidos_compra (id, titulo, categoria, area, solicitante_id) values ('pc-1', 'Notebooks para admissão', 'hardware', 'TI', 'emp-sup');
insert into public.pedido_itens (id, pedido_id, tipo, descricao, categoria_ativo, quantidade, valor_unitario, ordem) values
  ('pi-1', 'pc-1', 'equipamento', 'Notebook Dell 5440', 'hardware', 2, 5000, 1),
  ('pi-2', 'pc-1', 'acessorio', 'Mouse F11', null, 3, 50, 2),
  ('pi-3', 'pc-1', 'licenca', 'Office (assentos)', null, 2, 40, 3);
update public.pedido_itens set estoque_item_id = 'est-f11' where id = 'pi-2';
update public.pedido_itens set licenca_id = 'lic-1' where id = 'pi-3';

-- Orçamento ------------------------------------------------------------------------------------
select harness.rodar('fase11', 'O1 admin grava o orçamento; o anual é a soma dos 12 meses', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    insert into public.orcamentos (ano, categoria, area, meses) values (2027, 'hardware', ' TI ', '[100,100,100,100,100,100,100,100,100,100,100,150]');
    perform harness.espera($s$select 1 from public.orcamentos where ano = 2027 and area = 'TI' and valor_anual = 1250$s$, 1);
  end $x$$q$);
select harness.rodar('fase11', 'O2 T.I. (suporte) não grava orçamento', 'bloqueado', :'sup', 'authenticated',
  $q$insert into public.orcamentos (ano, categoria, valor_anual) values (2027, 'software', 10)$q$);
select harness.rodar('fase11', 'O3 RH não lê orçamento (0 linhas)', 'ok', :'rh', 'authenticated',
  $q$do $x$ begin
    perform harness.espera($s$select 1 from public.orcamentos$s$, 0);
  end $x$$q$);
select harness.rodar('fase11', 'O4 mesma categoria e área no mesmo ano não se repete', 'erro: duplicate key value violates unique constraint "uq_orcamento"', :'admin', 'authenticated',
  $q$do $x$ begin
    insert into public.orcamentos (ano, categoria, area, valor_anual) values (2027, 'nuvem', 'TI', 10);
    insert into public.orcamentos (ano, categoria, area, valor_anual) values (2027, 'nuvem', 'ti', 20);
  end $x$$q$);

-- Pedido: rascunho, código e situação -------------------------------------------------------------
select harness.rodar('fase11', 'P1 pedido ganha código PC-AAAA-NNNN e começa como rascunho', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform harness.espera($s$select 1 from public.pedidos_compra where id = 'pc-1' and codigo like 'PC-____-____' and status = 'rascunho'$s$, 1);
  end $x$$q$);
select harness.rodar('fase11', 'P2 situação não muda por UPDATE direto', 'erro: Use as ações do pedido para mudar a situação', :'admin', 'authenticated',
  $q$update public.pedidos_compra set status = 'aprovado' where id = 'pc-1'$q$);
select harness.rodar('fase11', 'P3 pedido novo não nasce aprovado', 'erro: Pedido novo começa como rascunho', :'sup', 'authenticated',
  $q$insert into public.pedidos_compra (titulo, status) values ('x', 'aprovado')$q$);
select harness.rodar('fase11', 'P4 RH não lê a tabela de pedidos (0 linhas)', 'ok', :'rh', 'authenticated',
  $q$do $x$ begin
    perform harness.espera($s$select 1 from public.pedidos_compra$s$, 0);
    perform harness.espera($s$select 1 from public.pedido_itens$s$, 0);
  end $x$$q$);
select harness.rodar('fase11', 'P5 no máximo 3 cotações e uma vencedora', 'erro: Cada pedido tem no máximo 3 cotações', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.pedido_cotacoes (pedido_id, fornecedor_id, valor) values ('pc-1', 'for-f11', 1), ('pc-1', 'for-f11', 2), ('pc-1', 'for-f11', 3);
    insert into public.pedido_cotacoes (pedido_id, fornecedor_id, valor) values ('pc-1', 'for-f11', 4);
  end $x$$q$);

-- Aprovação: só o admin --------------------------------------------------------------------------
select harness.rodar('fase11', 'A1 suporte envia e não consegue aprovar', 'bloqueado', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.mudar_status_pedido('pc-1', 'enviar');
    perform public.mudar_status_pedido('pc-1', 'aprovar');
  end $x$$q$);
select harness.rodar('fase11', 'A2 com cotações, aprovar exige a vencedora', 'erro: Escolha a cotação vencedora antes de aprovar', :'admin', 'authenticated',
  $q$do $x$ begin
    insert into public.pedido_cotacoes (pedido_id, fornecedor_id, valor) values ('pc-1', 'for-f11', 10230);
    perform public.mudar_status_pedido('pc-1', 'enviar');
    perform public.mudar_status_pedido('pc-1', 'aprovar');
  end $x$$q$);
select harness.rodar('fase11', 'A3 admin aprova; fornecedor da vencedora e histórico gravados', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    insert into public.pedido_cotacoes (pedido_id, fornecedor_id, valor, vencedora) values ('pc-1', 'for-f11', 10230, true);
    perform public.mudar_status_pedido('pc-1', 'enviar');
    perform public.mudar_status_pedido('pc-1', 'aprovar');
    perform harness.espera($s$select 1 from public.pedidos_compra where id = 'pc-1' and status = 'aprovado'
      and aprovado_por = 'emp-admin' and fornecedor_id = 'for-f11'$s$, 1);
    perform harness.espera($s$select 1 from public.pedido_eventos where pedido_id = 'pc-1' and para in ('aguardando', 'aprovado')$s$, 2);
  end $x$$q$);
select harness.rodar('fase11', 'A4 recusar exige motivo', 'erro: Explique por que o pedido foi recusado', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.mudar_status_pedido('pc-1', 'enviar');
    perform public.mudar_status_pedido('pc-1', 'recusar', 'x');
  end $x$$q$);
select harness.rodar('fase11', 'A5 aprovado não aceita mais itens', 'erro: O pedido não pode mais ser alterado (situação: aprovado)', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.mudar_status_pedido('pc-1', 'enviar');
    perform public.mudar_status_pedido('pc-1', 'aprovar');
    insert into public.pedido_itens (pedido_id, tipo, descricao) values ('pc-1', 'servico', 'Instalação');
  end $x$$q$);

-- Comprado → fatura; Recebido → ativos, estoque e assentos ----------------------------------------
select harness.rodar('fase11', 'C1 comprado gera a fatura do pedido em Contas a pagar', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.mudar_status_pedido('pc-1', 'enviar');
    perform public.mudar_status_pedido('pc-1', 'aprovar');
    perform public.registrar_compra_pedido('pc-1', '{"fornecedor_id":"for-f11","data_compra":"2026-11-10","vencimento":"2026-12-10","numero_nf":"NF-77","forma_pagamento":"boleto","itens":[{"id":"pi-1","valor_unitario":4900}]}');
    perform harness.espera($s$select 1 from public.faturas where pedido_id = 'pc-1' and valor = 10030 and competencia = '2026-11-01'
      and status = 'a_pagar' and numero_documento = 'NF-77'$s$, 1);
    perform harness.espera($s$select 1 from public.pedidos_compra where id = 'pc-1' and status = 'comprado' and valor_final = 10030 and fatura_id is not null$s$, 1);
  end $x$$q$);
select harness.rodar('fase11', 'C2 compra só de pedido aprovado', 'erro: Só um pedido aprovado pode ser registrado como comprado', :'admin', 'authenticated',
  $q$select public.registrar_compra_pedido('pc-1', '{"fornecedor_id":"for-f11","data_compra":"2026-11-10","vencimento":"2026-12-10"}')$q$);
select harness.rodar('fase11', 'C3 receber exige o patrimônio de cada unidade', 'erro: Informe o patrimônio de cada unidade de "Notebook Dell 5440" (2 unidade(s))', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.mudar_status_pedido('pc-1', 'enviar');
    perform public.mudar_status_pedido('pc-1', 'aprovar');
    perform public.registrar_compra_pedido('pc-1', '{"fornecedor_id":"for-f11","data_compra":"2026-11-10","vencimento":"2026-12-10"}');
    perform public.receber_pedido('pc-1', '{"ativos":[{"item_id":"pi-1","tag":"#PAT-9001"}]}');
  end $x$$q$);
select harness.rodar('fase11', 'C4 recebido cria os equipamentos, dá entrada no estoque e soma assentos', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.mudar_status_pedido('pc-1', 'enviar');
    perform public.mudar_status_pedido('pc-1', 'aprovar');
    perform public.registrar_compra_pedido('pc-1', '{"fornecedor_id":"for-f11","data_compra":"2026-11-10","vencimento":"2026-12-10","numero_nf":"NF-77"}');
    perform public.receber_pedido('pc-1', '{"ativos":[{"item_id":"pi-1","tag":"#PAT-9001"},{"item_id":"pi-1","tag":"#PAT-9002","serial_number":"ABC123"}]}');
    perform harness.espera($s$select 1 from public.ativos where pedido_id = 'pc-1' and status = 'disponivel' and fornecedor_id = 'for-f11'
      and (fiscal ->> 'valorCompra')::numeric = 5000 and fiscal ->> 'numeroNF' = 'NF-77' and fiscal ->> 'dataAquisicao' = '2026-11-10'$s$, 2);
    perform harness.espera($s$select 1 from public.ativos where tag = '#PAT-9001' and serial_number like 'A-PREENCHER-%'$s$, 1);
    perform harness.espera($s$select 1 from public.estoque_itens where id = 'est-f11' and quantidade = 3 and valor_unitario = 50$s$, 1);
    perform harness.espera($s$select 1 from public.licencas_software where id = 'lic-1' and assentos_totais = 3$s$, 1);
    perform harness.espera($s$select 1 from public.pedidos_compra where id = 'pc-1' and status = 'recebido' and recebido_por = 'emp-admin'$s$, 1);
  end $x$$q$);
select harness.rodar('fase11', 'C5 recebido não pode ser cancelado', 'erro: O pedido PC-', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.mudar_status_pedido('pc-1', 'enviar');
    perform public.mudar_status_pedido('pc-1', 'aprovar');
    perform public.registrar_compra_pedido('pc-1', '{"fornecedor_id":"for-f11","data_compra":"2026-11-10","vencimento":"2026-12-10"}');
    perform public.receber_pedido('pc-1', '{"ativos":[{"item_id":"pi-1","tag":"#PAT-9001"},{"item_id":"pi-1","tag":"#PAT-9002"}]}');
    begin
      perform public.mudar_status_pedido('pc-1', 'cancelar', 'Mudou de ideia');
    exception when others then
      raise exception '%', left(sqlerrm, 12);
    end;
  end $x$$q$);
select harness.rodar('fase11', 'C6 RH não registra o recebimento', 'bloqueado', :'rh', 'authenticated',
  $q$select public.receber_pedido('pc-1')$q$);

-- RH e gestor pedem compra sem ver valores --------------------------------------------------------
select harness.rodar('fase11', 'R1 RH pede compra e o pedido vai para a cotação da T.I.', 'ok', :'rh', 'authenticated',
  $q$do $x$
  declare v text;
  begin
    v := public.solicitar_compra('{"titulo":"Notebook para nova analista","justificativa":"Admissão em dezembro","chamado_id":"tkt-3"}',
                                 '[{"tipo":"equipamento","descricao":"Notebook","quantidade":1}]');
    perform harness.espera(format($s$select 1 from public.pedidos_solicitados() where id = %L and status = 'em_cotacao'
      and solicitante_id = 'emp-rh' and chamado_id = 'tkt-3' and jsonb_array_length(itens) = 1$s$, v), 1);
  end $x$$q$);
select harness.rodar('fase11', 'R2 RH vê os pedidos sem valores (nenhuma chave de valor nos itens)', 'ok', :'rh', 'authenticated',
  $q$do $x$
  declare v text;
  begin
    v := public.solicitar_compra('{"titulo":"Mouses","justificativa":"Reposição"}', '[{"descricao":"Mouse","quantidade":3},{"descricao":"Teclado"}]');
    perform harness.espera(format($s$select 1 from public.pedidos_solicitados() p, jsonb_array_elements(p.itens) i
      where p.id = %L and not (i ? 'valor_unitario')$s$, v), 2);
  end $x$$q$);
select harness.rodar('fase11', 'R2b RH não vê rascunho de outra pessoa', 'ok', :'rh', 'authenticated',
  $q$do $x$ begin
    perform harness.espera($s$select 1 from public.pedidos_solicitados() where id = 'pc-1'$s$, 0);
  end $x$$q$);
select harness.rodar('fase11', 'R3 qualquer colaborador pede compra (seção 13)', 'ok', :'colab', 'authenticated',
  $q$select public.solicitar_compra('{"titulo":"Monitor","justificativa":"Trabalho remoto"}', '[{"descricao":"Monitor"}]')$q$);
update public.colaboradores set gestor_id = 'emp-colab' where id = 'emp-outro';
select harness.rodar('fase11', 'R4 gestor pede compra e vê só os pedidos dele', 'ok', :'colab', 'authenticated',
  $q$do $x$
  declare v text;
  begin
    v := public.solicitar_compra('{"titulo":"Monitor para a equipe","justificativa":"Trabalho remoto"}', '[{"descricao":"Monitor 24","quantidade":2}]');
    perform harness.espera($s$select 1 from public.pedidos_solicitados()$s$, 1);
    perform public.mudar_status_pedido(v, 'cancelar', 'Não precisa mais');
    perform harness.espera($s$select 1 from public.pedidos_solicitados() where status = 'cancelado'$s$, 1);
  end $x$$q$);
select harness.rodar('fase11', 'R5 RH não aprova o próprio pedido (está em cotação)', 'erro: O pedido PC-', :'rh', 'authenticated',
  $q$do $x$
  declare v text;
  begin
    v := public.solicitar_compra('{"titulo":"Headset","justificativa":"Atendimento"}', '[{"descricao":"Headset"}]');
    begin
      perform public.mudar_status_pedido(v, 'aprovar');
    exception when others then
      raise exception '%', left(sqlerrm, 12);
    end;
  end $x$$q$);
select harness.rodar('fase11', 'R6 pedido sem justificativa é recusado na entrada', 'erro: Explique para que é a compra', :'rh', 'authenticated',
  $q$select public.solicitar_compra('{"titulo":"Headset"}', '[{"descricao":"Headset"}]')$q$);

-- Fatura do pedido --------------------------------------------------------------------------------
select harness.rodar('fase11', 'F1 fatura tem um único alvo (pedido OU licença OU contrato)', 'erro: new row for relation "faturas" violates check constraint "chk_fatura_alvo"', :'sup', 'authenticated',
  $q$insert into public.faturas (licenca_id, pedido_id, competencia, valor, vencimento) values ('lic-1', 'pc-1', '2026-11-01', 1, '2026-11-10')$q$);

-- Inventário físico -------------------------------------------------------------------------------
select harness.rodar('fase11', 'I1 conferência por local lista só os equipamentos daquele local', 'ok', :'sup', 'authenticated',
  $q$do $x$
  declare v text;
  begin
    v := public.abrir_inventario('Conferência casa', 'CASA');
    perform harness.espera(format($s$select 1 from public.inventario_itens where inventario_id = %L and situacao = 'pendente'$s$, v), 2);
  end $x$$q$);
select harness.rodar('fase11', 'I2 marcar encontrado carimba quem conferiu; fechar gera pendências e atualiza local', 'ok', :'sup', 'authenticated',
  $q$do $x$
  declare v text; r jsonb;
  begin
    v := public.abrir_inventario('Conferência casa', 'casa');
    update public.inventario_itens set situacao = 'encontrado', via_qr = true where inventario_id = v and ativo_id = 'ast-1';
    perform harness.espera(format($s$select 1 from public.inventario_itens where inventario_id = %L and conferido_por = 'emp-sup'$s$, v), 1);
    r := public.fechar_inventario(v, false);
    if (r ->> 'nao_encontrados')::int <> 1 or (r ->> 'via_qr')::int <> 1 then raise exception 'resumo errado: %', r; end if;
    perform harness.espera($s$select 1 from public.lembretes where ativo_id = 'ast-2' and titulo like 'Inventário:%'$s$, 1);
  end $x$$q$);
select harness.rodar('fase11', 'I3 em outro local exige o local; fechar com atualizar muda o local do ativo', 'ok', :'sup', 'authenticated',
  $q$do $x$
  declare v text;
  begin
    v := public.abrir_inventario('Geral', '');
    update public.inventario_itens set situacao = 'outro_local', local_encontrado = 'Sala 2' where inventario_id = v and ativo_id = 'ast-1';
    perform public.fechar_inventario(v, true);
    perform harness.espera($s$select 1 from public.ativos where id = 'ast-1' and localizacao_fisica = 'Sala 2'$s$, 1);
  end $x$$q$);
select harness.rodar('fase11', 'I4 conferência fechada não muda mais', 'erro: Esta conferência já foi encerrada', :'sup', 'authenticated',
  $q$do $x$
  declare v text;
  begin
    v := public.abrir_inventario('Casa', 'casa');
    perform public.fechar_inventario(v);
    update public.inventario_itens set situacao = 'encontrado' where inventario_id = v;
  end $x$$q$);
select harness.rodar('fase11', 'I5 RH não abre conferência', 'bloqueado', :'rh', 'authenticated',
  $q$select public.abrir_inventario('Casa', 'casa')$q$);
select harness.rodar('fase11', 'I6 dois inventários abertos no mesmo local não', 'erro: Já existe uma conferência aberta para este local', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.abrir_inventario('Casa', 'casa');
    perform public.abrir_inventario('Casa de novo', 'CASA');
  end $x$$q$);

-- Vida útil e limpar base --------------------------------------------------------------------------
select harness.rodar('fase11', 'V1 admin grava a vida útil nas configurações', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform harness.afeta($s$update public.configuracoes_empresa set vida_util = '{"computadores":5,"moveis":10}'$s$, 1);
  end $x$$q$);
select harness.rodar('fase11', 'L1 limpar base apaga pedidos, faturas do pedido, orçamento e conferências', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.mudar_status_pedido('pc-1', 'enviar');
    perform public.mudar_status_pedido('pc-1', 'aprovar');
    perform public.registrar_compra_pedido('pc-1', '{"fornecedor_id":"for-f11","data_compra":"2026-11-10","vencimento":"2026-12-10"}');
    perform public.abrir_inventario('Casa', 'casa');
    insert into public.orcamentos (ano, categoria, valor_anual) values (2027, 'software', 10);
    perform public.limpar_base('APAGAR TUDO');
    perform harness.espera($s$select 1 from public.pedidos_compra$s$, 0);
    perform harness.espera($s$select 1 from public.faturas$s$, 0);
    perform harness.espera($s$select 1 from public.orcamentos$s$, 0);
    perform harness.espera($s$select 1 from public.inventarios_fisicos$s$, 0);
  end $x$$q$);

-- Limpeza
update public.colaboradores set gestor_id = null where id = 'emp-outro';
delete from public.pedido_cotacoes where pedido_id = 'pc-1';
delete from public.pedido_itens where pedido_id = 'pc-1';
delete from public.pedido_eventos where pedido_id = 'pc-1';
delete from public.pedidos_compra where id = 'pc-1';
delete from public.estoque_itens where id = 'est-f11';
delete from public.fornecedores where id = 'for-f11';
