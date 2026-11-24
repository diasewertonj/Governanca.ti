\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set rh '{"sub":"00000000-0000-0000-0000-000000000005","email":"rh@x.test","role":"authenticated"}'
\set anon '{"role":"anon"}'

-- Dados do arquivo (desfeitos no fim)
update public.licencas_software
   set valor_mensal = 99, forma_pagamento = 'cartao', cartao_final = '1234', pagamento_titular = 'Financeiro',
       centro_custo = 'ADM', assentos_totais = 5, colaboradores_ids = '["emp-colab"]'::jsonb
 where id = 'lic-1';
update public.ativos set fiscal = '{"valorCompra": 5000, "notaFiscal": "NF-1"}'::jsonb where id = 'ast-1';
insert into public.estoque_itens (id, nome, tipo) values ('est-s1', 'Mouse teste', 'mouse'), ('est-s2', 'Cabo sem uso', 'cabo');
insert into public.estoque_movimentos (id, item_id, tipo, quantidade, motivo) values ('mov-s1', 'est-s1', 'entrada', 10, 'Compra');
insert into public.linhas_telefonicas (id, numero, colaborador_id) values ('lin-s1', '(11) 99999-0001', 'emp-colab');
insert into public.linhas_telefonicas (id, numero) values ('lin-s2', '(11) 99999-0002');
insert into public.fornecedores (id, nome) values ('forn-s1', 'Fornecedor Seg');
insert into public.contratos (id, fornecedor_id, tipo, descricao, inicio, fim, valor, periodicidade) values
  ('ct-s1', 'forn-s1', 'licenciamento', 'Licenças', '2026-01-01', '2026-12-31', 1000, 'mensal');
insert into public.faturas (id, contrato_id, competencia, valor, vencimento, status, pago_em) values
  ('fat-s1', 'ct-s1', '2026-10-01', 1000, '2026-10-10', 'paga', '2026-10-09');

-- Licenças: valores e cartão só para a T.I. ---------------------------------------------------
select harness.rodar('seguranca', 'L1 colaborador não lê a tabela de licenças', 'ok', :'colab', 'authenticated',
  $q$select harness.espera($s$select 1 from public.licencas_software$s$, 0)$q$);
select harness.rodar('seguranca', 'L2 colaborador vê só a própria licença, sem valor/cartão e só ele nos assentos', 'ok', :'colab', 'authenticated',
  $q$select harness.espera($s$select 1 from public.licencas_visiveis()
      where id = 'lic-1' and valor_mensal = 0 and cartao_final is null and pagamento_titular is null
        and centro_custo is null and forma_pagamento is null and colaboradores_ids = '["emp-colab"]'::jsonb$s$, 1)$q$);
select harness.rodar('seguranca', 'L3 RH não lê a tabela de licenças', 'ok', :'rh', 'authenticated',
  $q$select harness.espera($s$select 1 from public.licencas_software$s$, 0)$q$);
select harness.rodar('seguranca', 'L4 RH vê o catálogo sem valores nem cartão', 'ok', :'rh', 'authenticated',
  $q$select harness.espera($s$select 1 from public.licencas_visiveis()
      where valor_mensal = 0 and cartao_final is null and colaboradores_ids = '["emp-colab"]'::jsonb$s$, 1)$q$);
select harness.rodar('seguranca', 'L5 suporte lê tudo (tabela e função)', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    -- Check geral: o suporte lê a licença, mas não o cartão (só admin e Compras veem pagamento)
    perform harness.espera($s$select 1 from public.licencas_software where valor_mensal = 99$s$, 1);
    perform harness.espera($s$select 1 from public.licencas_visiveis() where valor_mensal = 99 and cartao_final is null$s$, 1);
  end $x$$q$);
select harness.rodar('seguranca', 'L6 anônimo não executa licencas_visiveis', 'bloqueado', :'anon', 'anon',
  $q$select * from public.licencas_visiveis()$q$);

-- Equipamentos: dados fiscais só para a T.I. ----------------------------------------------------
select harness.rodar('seguranca', 'A1 colaborador vê o próprio equipamento sem valor de compra', 'ok', :'colab', 'authenticated',
  $q$select harness.espera($s$select 1 from public.ativos_visiveis() where id = 'ast-1' and fiscal = '{}'::jsonb$s$, 1)$q$);
select harness.rodar('seguranca', 'A2 RH vê todos os equipamentos sem valor de compra', 'ok', :'rh', 'authenticated',
  $q$do $x$ begin
    perform harness.espera($s$select 1 from public.ativos_visiveis() where id in ('ast-1', 'ast-2')$s$, 2);
    perform harness.espera($s$select 1 from public.ativos_visiveis() where fiscal <> '{}'::jsonb$s$, 0);
  end $x$$q$);
select harness.rodar('seguranca', 'A3 suporte vê o valor de compra', 'ok', :'sup', 'authenticated',
  $q$select harness.espera($s$select 1 from public.ativos_visiveis() where fiscal ->> 'notaFiscal' = 'NF-1'$s$, 1)$q$);
select harness.rodar('seguranca', 'A4 anônimo não executa ativos_visiveis', 'bloqueado', :'anon', 'anon',
  $q$select * from public.ativos_visiveis()$q$);

-- Estoque ---------------------------------------------------------------------------------------
select harness.rodar('seguranca', 'E1 saldo calculado pelo movimento', 'ok', :'sup', 'authenticated',
  $q$select harness.espera($s$select 1 from public.estoque_itens where id = 'est-s1' and quantidade = 10$s$, 1)$q$);
select harness.rodar('seguranca', 'E2 admin não exclui movimento (0 linhas)', 'ok', :'admin', 'authenticated',
  $q$select harness.afeta($s$delete from public.estoque_movimentos where id = 'mov-s1'$s$, 0)$q$);
select harness.rodar('seguranca', 'E3 movimento não é alterado', 'erro: erro', :'admin', 'authenticated',
  $q$do $x$ begin update public.estoque_movimentos set quantidade = 1 where id = 'mov-s1';
    exception when others then raise exception 'erro'; end $x$$q$);
select harness.rodar('seguranca', 'E4 saída maior que o saldo é recusada', 'erro: erro', :'sup', 'authenticated',
  $q$do $x$ begin insert into public.estoque_movimentos (item_id, tipo, quantidade) values ('est-s1', 'saida', 11);
    exception when others then raise exception 'erro'; end $x$$q$);
select harness.rodar('seguranca', 'E5 acessório com movimentos não é excluído',
  'erro: O acessório tem movimentos no histórico: desative em vez de excluir.', :'admin', 'authenticated',
  $q$delete from public.estoque_itens where id = 'est-s1'$q$);
select harness.rodar('seguranca', 'E6 acessório sem movimentos é excluído pelo admin', 'ok', :'admin', 'authenticated',
  $q$select harness.afeta($s$delete from public.estoque_itens where id = 'est-s2'$s$, 1)$q$);
select harness.rodar('seguranca', 'E7 RH não lança movimento', 'bloqueado', :'rh', 'authenticated',
  $q$insert into public.estoque_movimentos (item_id, tipo, quantidade) values ('est-s1', 'entrada', 1)$q$);
select harness.rodar('seguranca', 'E8 colaborador não lê estoque', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin perform harness.espera($s$select 1 from public.estoque_itens$s$, 0);
    perform harness.espera($s$select 1 from public.estoque_movimentos$s$, 0); end $x$$q$);

-- Linhas telefônicas ------------------------------------------------------------------------------
select harness.rodar('seguranca', 'T1 atribuir linha grava o histórico', 'ok', :'sup', 'authenticated',
  $q$select harness.espera($s$select 1 from public.linha_atribuicoes where linha_id = 'lin-s1' and colaborador_id = 'emp-colab' and fim is null$s$, 1)$q$);
select harness.rodar('seguranca', 'T2 linha com histórico não é excluída',
  'erro: A linha tem histórico de uso: cancele em vez de excluir.', :'admin', 'authenticated',
  $q$delete from public.linhas_telefonicas where id = 'lin-s1'$q$);
select harness.rodar('seguranca', 'T3 linha sem histórico é excluída pelo admin', 'ok', :'admin', 'authenticated',
  $q$select harness.afeta($s$delete from public.linhas_telefonicas where id = 'lin-s2'$s$, 1)$q$);
select harness.rodar('seguranca', 'T4 suporte não exclui linha (0 linhas)', 'ok', :'sup', 'authenticated',
  $q$select harness.afeta($s$delete from public.linhas_telefonicas where id = 'lin-s2'$s$, 0)$q$);
select harness.rodar('seguranca', 'T5 colaborador não lê as linhas', 'ok', :'colab', 'authenticated',
  $q$select harness.espera($s$select 1 from public.linhas_telefonicas$s$, 0)$q$);
select harness.rodar('seguranca', 'T6 número repetido em linha ativa é recusado', 'erro: erro', :'sup', 'authenticated',
  $q$do $x$ begin insert into public.linhas_telefonicas (numero) values ('11999990001');
    exception when unique_violation then raise exception 'erro'; end $x$$q$);

-- Funções das seções 6 e 9 ------------------------------------------------------------------------
select harness.rodar('seguranca', 'F1 colaborador não libera assento', 'bloqueado', :'colab', 'authenticated',
  $q$select public.liberar_assento('lic-1', 'emp-colab', 'não usa mais')$q$);
select harness.rodar('seguranca', 'F2 RH não libera assento', 'bloqueado', :'rh', 'authenticated',
  $q$select public.liberar_assento('lic-1', 'emp-colab', 'não usa mais')$q$);
select harness.rodar('seguranca', 'F3 suporte libera assento sem motivo', 'erro: Informe o motivo para liberar o assento', :'sup', 'authenticated',
  $q$select public.liberar_assento('lic-1', 'emp-colab', '')$q$);
select harness.rodar('seguranca', 'F4 suporte libera assento e o motivo fica no histórico', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.liberar_assento('lic-1', 'emp-colab', 'Não usa mais');
    perform harness.espera($s$select 1 from public.licencas_software where id = 'lic-1' and colaboradores_ids = '[]'::jsonb$s$, 1);
    perform harness.espera($s$select 1 from public.licenca_atribuicoes where licenca_id = 'lic-1' and colaborador_id = 'emp-colab'
      and fim is not null and motivo_remocao = 'Não usa mais'$s$, 1);
  end $x$$q$);
select harness.rodar('seguranca', 'F5 colaborador não renova contrato', 'bloqueado', :'colab', 'authenticated',
  $q$select public.renovar_contrato('ct-s1', '2027-01-01', '2027-12-31', 1100)$q$);
select harness.rodar('seguranca', 'F6 suporte renova contrato e o novo aponta o anterior', 'ok', :'sup', 'authenticated',
  $q$do $x$ declare v text; begin
    v := public.renovar_contrato('ct-s1', '2027-01-01', '2027-12-31', 1100);
    perform harness.espera(format($s$select 1 from public.contratos where id = %L and renovado_de = 'ct-s1' and valor = 1100$s$, v), 1);
  end $x$$q$);
select harness.rodar('seguranca', 'F7 suporte não desfaz pagamento', 'bloqueado', :'sup', 'authenticated',
  $q$select public.desfazer_pagamento('fat-s1', 'Pago por engano')$q$);
select harness.rodar('seguranca', 'F8 admin desfaz pagamento com motivo', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.desfazer_pagamento('fat-s1', 'Pago por engano');
    perform harness.espera($s$select 1 from public.faturas where id = 'fat-s1' and status = 'a_pagar' and pago_em is null$s$, 1);
  end $x$$q$);
select harness.rodar('seguranca', 'F9 fatura paga não volta pelo update direto',
  'erro: Use "Desfazer pagamento" (administrador) para reabrir uma fatura paga', :'admin', 'authenticated',
  $q$do $x$ begin update public.faturas set status = 'a_pagar' where id = 'fat-s1';
    exception when insufficient_privilege then raise exception 'Use "Desfazer pagamento" (administrador) para reabrir uma fatura paga'; end $x$$q$);
select harness.rodar('seguranca', 'F10 RH não lê contratos nem faturas', 'ok', :'rh', 'authenticated',
  $q$do $x$ begin perform harness.espera($s$select 1 from public.contratos$s$, 0);
    perform harness.espera($s$select 1 from public.faturas$s$, 0); end $x$$q$);

-- Limpeza dos dados do arquivo
delete from public.faturas where id = 'fat-s1';
delete from public.contratos where id = 'ct-s1';
delete from public.fornecedores where id = 'forn-s1';
alter table public.linhas_telefonicas disable trigger trg_linha_proteger_exclusao;
delete from public.linhas_telefonicas where id in ('lin-s1', 'lin-s2');
alter table public.linhas_telefonicas enable trigger trg_linha_proteger_exclusao;
alter table public.estoque_itens disable trigger trg_estoque_proteger_exclusao;
delete from public.estoque_itens where id in ('est-s1', 'est-s2');
alter table public.estoque_itens enable trigger trg_estoque_proteger_exclusao;
update public.ativos set fiscal = '{}'::jsonb where id = 'ast-1';
update public.licencas_software
   set valor_mensal = 0, forma_pagamento = null, cartao_final = null, pagamento_titular = null,
       centro_custo = null, colaboradores_ids = '[]'::jsonb
 where id = 'lic-1';
delete from public.licenca_atribuicoes where licenca_id = 'lic-1';
