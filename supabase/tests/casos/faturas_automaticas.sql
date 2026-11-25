\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'

-- Seção 26 · faturas automáticas (dados do arquivo, desfeitos no fim). "Hoje" = 05/12/2026.
insert into public.fornecedores (id, nome) values ('for-fa1', 'Fornecedor FA');
insert into public.contratos (id, fornecedor_id, tipo, descricao, inicio, valor, periodicidade, dia_vencimento)
  values ('ct-fa1', 'for-fa1', 'suporte', 'Suporte FA', '2026-01-01', 300, 'mensal', 10),
         ('ct-fa2', 'for-fa1', 'locacao', 'Anual FA', '2025-12-01', 1200, 'anual', 20),
         ('ct-fa3', 'for-fa1', 'licenciamento', 'Licenciamento FA', '2026-01-01', 500, 'mensal', 10);
insert into public.licencas_software (id, nome, fornecedor, data_renovacao, valor_mensal, forma_cobranca, tipo_cobranca, dia_vencimento)
  values ('lic-fa1', 'Software FA', 'FA', '2027-06-01', 80, 'propria', 'mensal', 15),
         ('lic-fa2', 'Coberto FA', 'FA', '2027-06-01', 40, 'propria', 'mensal', 15);
insert into public.contrato_itens (contrato_id, licenca_id) values ('ct-fa3', 'lic-fa2');
insert into public.linhas_telefonicas (id, numero, valor_mensal, dia_vencimento) values ('lin-fa1', '(11) 96666-0001', 50, 5);

select harness.rodar('faturas_auto', 'FA1 admin gera as faturas do mês (contrato, anual no aniversário, licença, linha)', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.gerar_faturas_previstas('2026-12-05');
    perform harness.espera($s$select 1 from public.faturas where contrato_id = 'ct-fa1' and competencia = '2026-12-01' and origem_geracao = 'automatica' and valor = 300 and vencimento = '2026-12-10'$s$, 1);
    perform harness.espera($s$select 1 from public.faturas where contrato_id = 'ct-fa2' and competencia = '2026-12-01' and valor = 1200 and vencimento = '2026-12-20'$s$, 1);
    perform harness.espera($s$select 1 from public.faturas where licenca_id = 'lic-fa1' and competencia = '2026-12-01' and valor = 80$s$, 1);
    perform harness.espera($s$select 1 from public.faturas where linha_id = 'lin-fa1' and competencia = '2026-12-01' and valor = 50 and vencimento = '2026-12-05'$s$, 1);
    -- janeiro vence em 10/01, fora dos 30 dias
    perform harness.espera($s$select 1 from public.faturas where contrato_id = 'ct-fa1' and competencia = '2027-01-01'$s$, 0);
    -- licença paga pelo contrato de licenciamento não recebe fatura própria
    perform harness.espera($s$select 1 from public.faturas where licenca_id = 'lic-fa2'$s$, 0);
  end $x$$q$);

select harness.rodar('faturas_auto', 'FA2 rodar de novo não duplica', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.gerar_faturas_previstas('2026-12-05');
    if public.gerar_faturas_previstas('2026-12-05') <> 0 then raise exception 'duplicou'; end if;
    perform harness.espera($s$select 1 from public.faturas where contrato_id = 'ct-fa1' and competencia = '2026-12-01'$s$, 1);
  end $x$$q$);

select harness.rodar('faturas_auto', 'FA3 mês já lançado à mão não ganha automática', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    insert into public.faturas (contrato_id, competencia, valor, vencimento) values ('ct-fa1', '2026-12-01', 310, '2026-12-12');
    perform public.gerar_faturas_previstas('2026-12-05');
    perform harness.espera($s$select 1 from public.faturas where contrato_id = 'ct-fa1' and competencia = '2026-12-01'$s$, 1);
  end $x$$q$);

select harness.rodar('faturas_auto', 'FA4 fatura adicional no mesmo mês, com motivo', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.gerar_faturas_previstas('2026-12-05');
    insert into public.faturas (contrato_id, competencia, valor, vencimento, origem_geracao, motivo_adicional)
      values ('ct-fa1', '2026-12-01', 45, '2026-12-15', 'adicional', 'Hora extra de suporte');
    perform harness.espera($s$select 1 from public.faturas where contrato_id = 'ct-fa1' and competencia = '2026-12-01'$s$, 2);
  end $x$$q$);

select harness.rodar('faturas_auto', 'FA5 adicional sem motivo é recusada', 'erro: new row for relation "faturas" violates check constraint "chk_fatura_origem_geracao"', :'admin', 'authenticated',
  $q$insert into public.faturas (contrato_id, competencia, valor, vencimento, origem_geracao) values ('ct-fa1', '2026-12-01', 45, '2026-12-15', 'adicional')$q$);

select harness.rodar('faturas_auto', 'FA6 segunda fatura "do mês" continua recusada', 'erro: duplicate key value violates unique constraint "uq_fatura_contrato_mes"', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.gerar_faturas_previstas('2026-12-05');
    insert into public.faturas (contrato_id, competencia, valor, vencimento) values ('ct-fa1', '2026-12-01', 300, '2026-12-10');
  end $x$$q$);

select harness.rodar('faturas_auto', 'FA7 colaborador não gera faturas', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
    if public.gerar_faturas_previstas('2026-12-05') <> 0 then raise exception 'gerou'; end if;
  end $x$$q$);
select harness.rodar('faturas_auto', 'FA7b nada foi gerado pelo colaborador', 'ok', :'admin', 'authenticated',
  $q$select harness.espera($s$select 1 from public.faturas where contrato_id = 'ct-fa1'$s$, 0)$q$);

select harness.rodar('faturas_auto', 'FA8 suporte gera (rotina do login)', 'ok', :'sup', 'authenticated',
  $q$select public.gerar_faturas_previstas('2026-12-05')$q$);

select harness.rodar('faturas_auto', 'FA9 encerrar contrato cancela só as automáticas futuras não pagas', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.gerar_faturas_previstas('2026-12-20');   -- dezembro e janeiro (vence 10/01)
    perform harness.espera($s$select 1 from public.faturas where contrato_id = 'ct-fa1' and status = 'a_pagar'$s$, 2);
    update public.contratos set status = 'encerrado', encerrado_em = '2026-12-20', encerramento_motivo = 'Teste' where id = 'ct-fa1';
    perform harness.espera($s$select 1 from public.faturas where contrato_id = 'ct-fa1' and competencia = '2027-01-01' and status = 'cancelada'$s$, 1);
    perform harness.espera($s$select 1 from public.faturas where contrato_id = 'ct-fa1' and competencia = '2026-12-01' and status = 'a_pagar'$s$, 1);
  end $x$$q$);

select harness.rodar('faturas_auto', 'FA10 automática cancelada de propósito não volta', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.gerar_faturas_previstas('2026-12-05');
    update public.faturas set status = 'cancelada' where linha_id = 'lin-fa1';
    perform public.gerar_faturas_previstas('2026-12-06');
    perform harness.espera($s$select 1 from public.faturas where linha_id = 'lin-fa1' and competencia = '2026-12-01' and status <> 'cancelada'$s$, 0);
  end $x$$q$);

select harness.rodar('faturas_auto', 'FA11 linha cancelada cancela as automáticas futuras', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.gerar_faturas_previstas('2026-12-30');   -- dezembro e janeiro (vence 05/01)
    update public.linhas_telefonicas set status = 'cancelada' where id = 'lin-fa1';
    perform harness.espera($s$select 1 from public.faturas where linha_id = 'lin-fa1' and competencia = '2027-01-01' and status = 'cancelada'$s$, 1);
  end $x$$q$);

-- limpeza
delete from public.faturas where contrato_id in ('ct-fa1', 'ct-fa2', 'ct-fa3') or licenca_id in ('lic-fa1', 'lic-fa2') or linha_id = 'lin-fa1';
delete from public.contrato_itens where contrato_id = 'ct-fa3';
delete from public.contratos where id in ('ct-fa1', 'ct-fa2', 'ct-fa3');
delete from public.licencas_software where id in ('lic-fa1', 'lic-fa2');
delete from public.linhas_telefonicas where id = 'lin-fa1';
delete from public.fornecedores where id = 'for-fa1';
