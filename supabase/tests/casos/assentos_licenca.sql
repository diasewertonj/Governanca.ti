\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set compras '{"sub":"00000000-0000-0000-0000-000000000008","email":"compras@x.test","role":"authenticated"}'

-- Dados do arquivo (desfeitos no fim)
insert into public.colaboradores (id, matricula, nome, email, cargo, setor_id, status, role, data_admissao)
  values ('emp-compras', 'M9', 'Compras', 'compras@x.test', 'Comprador', 'dep-1', 'ativo', 'compras', '2026-01-01');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000008', 'compras@x.test');
insert into public.fornecedores (id, nome) values ('asl-forn', 'Fornecedor assentos');
insert into public.licencas_software (id, nome, fornecedor, data_renovacao, assentos_totais, valor_mensal, forma_cobranca, colaboradores_ids) values
  ('asl-propria', 'Própria', 'MS', '2027-01-01', 10, 100, 'propria', '["emp-colab","emp-sup"]'),
  ('asl-contrato', 'Por contrato', 'MS', null, 10, 0, 'contrato', '[]'),
  ('asl-semcusto', 'Sem custo', 'MS', null, 5, 0, 'sem_custo', '[]'),
  ('asl-ped', 'Do pedido', 'MS', '2027-01-01', 4, 40, 'propria', '[]');
insert into public.licencas_software (id, nome, fornecedor, data_renovacao, assentos_totais, valor_mensal, forma_cobranca, colaboradores_ids, status, inativacao_motivo) values
  ('asl-inativa', 'Inativa', 'MS', null, 5, 0, 'sem_custo', '[]', 'ativa', null);
update public.licencas_software set status = 'inativa', inativacao_motivo = 'Não usamos mais' where id = 'asl-inativa';
insert into public.contratos (id, fornecedor_id, tipo, descricao, inicio, fim, valor, periodicidade) values
  ('asl-ct', 'asl-forn', 'licenciamento', 'Contrato de licenças', '2026-01-01', '2026-12-31', 100, 'mensal');
insert into public.contrato_itens (contrato_id, licenca_id, quantidade_contratada) values ('asl-ct', 'asl-contrato', 12);
insert into public.pedidos_compra (id, titulo, categoria, area, solicitante_id) values ('asl-pc', 'Assentos', 'software', 'TI', 'emp-sup');
insert into public.pedido_itens (id, pedido_id, tipo, descricao, quantidade, valor_unitario, ordem, licenca_id)
  values ('asl-pi', 'asl-pc', 'licenca', 'Assentos', 3, 10, 1, 'asl-ped');
select set_config('app.operacao_pedido', 'sim', false);
update public.pedidos_compra set status = 'comprado' where id = 'asl-pc';
select set_config('app.operacao_pedido', '', false);

-- Quem pode -------------------------------------------------------------------------------------------
select harness.rodar('assentos', 'A1 suporte não ajusta o total', 'bloqueado', :'sup', 'authenticated',
  $q$select public.ajustar_assentos_licenca('asl-semcusto', 6, null, 'Mais uma pessoa')$q$);
select harness.rodar('assentos', 'A2 colaborador não ajusta o total', 'bloqueado', :'colab', 'authenticated',
  $q$select public.ajustar_assentos_licenca('asl-semcusto', 6, null, 'Mais uma pessoa')$q$);
select harness.rodar('assentos', 'A3 suporte não muda o total direto na tabela', 'bloqueado', :'sup', 'authenticated',
  $q$update public.licencas_software set assentos_totais = 50 where id = 'asl-semcusto'$q$);
select harness.rodar('assentos', 'A4 administrador também não muda o total direto na tabela', 'bloqueado', :'admin', 'authenticated',
  $q$update public.licencas_software set assentos_totais = 50 where id = 'asl-semcusto'$q$);
select harness.rodar('assentos', 'A5 administrador ajusta (sem custo) com motivo e fica no histórico', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.ajustar_assentos_licenca('asl-semcusto', 8, null, 'Nova equipe');
    perform harness.espera($s$select 1 from public.licencas_software where id = 'asl-semcusto' and assentos_totais = 8$s$, 1);
    perform harness.espera($s$select 1 from public.licenca_eventos where licenca_id = 'asl-semcusto' and tipo = 'capacidade' and total_antes = 5 and total_depois = 8 and motivo = 'Nova equipe' and por = 'emp-admin'$s$, 1);
  end $x$$q$);
select harness.rodar('assentos', 'A6 compras não ajusta (só o admin)', 'bloqueado', :'compras', 'authenticated',
  $q$select public.ajustar_assentos_licenca('asl-semcusto', 7, null, 'Compra aprovada')$q$);
select harness.rodar('assentos', 'A7 sem motivo é recusado', 'erro: Informe o motivo do ajuste (mínimo 5 caracteres)', :'admin', 'authenticated',
  $q$select public.ajustar_assentos_licenca('asl-semcusto', 7, null, 'ok')$q$);
select harness.rodar('assentos', 'A8 licença inativa é recusada', 'erro: Licença inativa não muda de total. Reative-a antes', :'admin', 'authenticated',
  $q$select public.ajustar_assentos_licenca('asl-inativa', 7, null, 'Tentativa na inativa')$q$);
select harness.rodar('assentos', 'A9 abaixo dos em uso é recusado', 'erro: Assentos totais (1) não podem ser menos que os 2 em uso.', :'admin', 'authenticated',
  $q$select public.ajustar_assentos_licenca('asl-propria', 1, 50, 'Reduzir demais')$q$);

-- Cobrança própria: total e valor juntos --------------------------------------------------------------
select harness.rodar('assentos', 'P1 própria exige o novo valor mensal', 'erro: Informe o novo valor mensal da licença', :'admin', 'authenticated',
  $q$select public.ajustar_assentos_licenca('asl-propria', 12, null, 'Mais dois assentos')$q$);
select harness.rodar('assentos', 'P2 própria grava total e valor juntos no histórico', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.ajustar_assentos_licenca('asl-propria', 12, 120, 'Mais dois assentos');
    perform harness.espera($s$select 1 from public.licencas_software where id = 'asl-propria' and assentos_totais = 12 and valor_mensal = 120$s$, 1);
    perform harness.espera($s$select 1 from public.licenca_eventos where licenca_id = 'asl-propria' and tipo = 'capacidade_valor' and valor_antes = 100 and valor_depois = 120$s$, 1);
  end $x$$q$);

-- Por contrato ----------------------------------------------------------------------------------------
select harness.rodar('assentos', 'C1 acima do contratado é recusado', 'erro: Acima do contratado (12). Faça um aditivo/renovação do contrato com a nova quantidade ou um pedido de compra.', :'admin', 'authenticated',
  $q$select public.ajustar_assentos_licenca('asl-contrato', 13, null, 'Quero mais assentos')$q$);
select harness.rodar('assentos', 'C2 dentro do contratado é permitido', 'ok', :'admin', 'authenticated',
  $q$select public.ajustar_assentos_licenca('asl-contrato', 12, null, 'Usar o contratado')$q$);
select harness.rodar('assentos', 'C3 admin salva a quantidade contratada pelo contrato; suporte não altera', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.salvar_contrato('{"id":"asl-ct","fornecedor_id":"asl-forn","tipo":"licenciamento","descricao":"Contrato de licenças","inicio":"2026-01-01","fim":"2026-12-31","valor":100}'::jsonb,
      '[{"licenca_id":"asl-contrato","quantidade_contratada":20}]'::jsonb);
    perform harness.espera($s$select 1 from public.contrato_itens where contrato_id = 'asl-ct' and licenca_id = 'asl-contrato' and quantidade_contratada = 20$s$, 1);
  end $x$$q$);
select harness.rodar('assentos', 'C4 suporte não muda a quantidade contratada', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.salvar_contrato('{"id":"asl-ct","fornecedor_id":"asl-forn","tipo":"licenciamento","descricao":"Contrato de licenças","inicio":"2026-01-01","fim":"2026-12-31","valor":100}'::jsonb,
      '[{"licenca_id":"asl-contrato","quantidade_contratada":99}]'::jsonb);
    perform harness.espera($s$select 1 from public.contrato_itens where contrato_id = 'asl-ct' and quantidade_contratada = 12$s$, 1);
  end $x$$q$);
select harness.rodar('assentos', 'C5 renovar contrato copia a quantidade contratada', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.renovar_contrato('asl-ct', '2027-01-01', '2027-12-31', 100);
    perform harness.espera($s$select 1 from public.contrato_itens ci join public.contratos c on c.id = ci.contrato_id where c.renovado_de = 'asl-ct' and ci.quantidade_contratada = 12$s$, 1);
  end $x$$q$);

-- Recebimento de pedido continua somando e deixa histórico ----------------------------------------------
select harness.rodar('assentos', 'R1 receber pedido soma assentos e grava histórico', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.receber_pedido('asl-pc');
    perform harness.espera($s$select 1 from public.licencas_software where id = 'asl-ped' and assentos_totais = 7$s$, 1);
    perform harness.espera($s$select 1 from public.licenca_eventos where licenca_id = 'asl-ped' and tipo = 'recebimento' and total_antes = 4 and total_depois = 7 and motivo = 'Recebimento de pedido'$s$, 1);
  end $x$$q$);

-- Histórico: leitura ----------------------------------------------------------------------------------
select harness.rodar('assentos', 'H1 suporte lê o histórico', 'ok', :'sup', 'authenticated',
  $q$select harness.espera($s$select 1 from public.licenca_eventos where licenca_id = 'asl-propria' and tipo = 'cadastro'$s$, 1)$q$);
select harness.rodar('assentos', 'H2 compras lê o histórico', 'ok', :'compras', 'authenticated',
  $q$select harness.espera($s$select 1 from public.licenca_eventos where licenca_id = 'asl-propria' and tipo = 'cadastro'$s$, 1)$q$);
select harness.rodar('assentos', 'H3 colaborador não vê o histórico', 'ok', :'colab', 'authenticated',
  $q$select harness.espera($s$select 1 from public.licenca_eventos where licenca_id = 'asl-propria'$s$, 0)$q$);
select harness.rodar('assentos', 'H4 ninguém grava o histórico direto', 'bloqueado', :'admin', 'authenticated',
  $q$insert into public.licenca_eventos (licenca_id, tipo, motivo) values ('asl-propria', 'capacidade', 'forjado')$q$);

-- Limpeza
delete from public.contratos where id like 'asl-%' or renovado_de like 'asl-%';
select set_config('app.operacao_pedido', 'sim', false);
delete from public.pedido_itens where pedido_id = 'asl-pc';
delete from public.pedidos_compra where id = 'asl-pc';
select set_config('app.operacao_pedido', '', false);
delete from public.licenca_atribuicoes where licenca_id like 'asl-%';
delete from public.licencas_software where id like 'asl-%';
delete from public.fornecedores where id = 'asl-forn';
delete from public.colaboradores where id = 'emp-compras';
delete from auth.users where id = '00000000-0000-0000-0000-000000000008';

