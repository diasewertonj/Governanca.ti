\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set rh '{"sub":"00000000-0000-0000-0000-000000000005","email":"rh@x.test","role":"authenticated"}'
\set compras '{"sub":"00000000-0000-0000-0000-000000000008","email":"compras@x.test","role":"authenticated"}'

-- Seção 17 · Financeiro de T.I. (dados do arquivo, desfeitos no fim)
insert into public.fornecedores (id, nome) values ('for-fg1', 'Fornecedor FG');
insert into public.departamentos (id, nome) values ('dep-fg1', 'Área FG') on conflict (id) do nothing;

select harness.rodar('financeiro', 'G1 T.I. lança fatura avulsa (fornecedor + descrição) com natureza e área', 'ok', :'sup', 'authenticated',
  $q$insert into public.faturas (id, competencia, valor, vencimento, fornecedor_id, descricao, natureza, departamento_id)
     values ('fat-fg1', '2026-11-01', 350, '2026-11-20', 'for-fg1', 'Conserto de impressora', 'opex', 'dep-fg1')$q$);
select harness.rodar('financeiro', 'G2 fatura sem alvo e sem descrição é recusada', 'erro: chk_fatura_alvo', :'sup', 'authenticated',
  $q$insert into public.faturas (competencia, valor, vencimento, fornecedor_id) values ('2026-11-01', 10, '2026-11-20', 'for-fg1')$q$);
select harness.rodar('financeiro', 'G3 Compras lê e paga a fatura avulsa', 'ok', :'compras', 'authenticated',
  $q$do $x$ begin
    perform harness.espera($s$select 1 from public.faturas where id = 'fat-fg1'$s$, 1);
    update public.faturas set status = 'paga', pago_em = '2026-11-19' where id = 'fat-fg1';
  end $x$$q$);
select harness.rodar('financeiro', 'G4 Compras vê o resumo de contratos e licenças, não as tabelas', 'ok', :'compras', 'authenticated',
  $q$do $x$ begin
    perform public.contratos_resumo();
    perform public.licencas_resumo();
    perform harness.espera($s$select 1 from public.contratos$s$, 0);
  end $x$$q$);
select harness.rodar('financeiro', 'G5 RH não vê o resumo de contratos', 'erro: Sem acesso', :'rh', 'authenticated',
  $q$select public.contratos_resumo()$q$);
select harness.rodar('financeiro', 'G6 colaborador não vê faturas nem recebimentos', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
    perform harness.espera($s$select 1 from public.faturas$s$, 0);
    perform harness.espera($s$select 1 from public.recebimentos$s$, 0);
  end $x$$q$);
select harness.rodar('financeiro', 'G7 T.I. registra recebimento e Compras confirma', 'ok', :'sup', 'authenticated',
  $q$insert into public.recebimentos (id, tipo, descricao, valor, previsto_para, fornecedor_id) values ('rec-fg1', 'reembolso_fornecedor', 'Crédito por falha no link', 120, '2026-12-05', 'for-fg1')$q$);
select harness.rodar('financeiro', 'G8 Compras marca recebido', 'ok', :'compras', 'authenticated',
  $q$update public.recebimentos set status = 'recebido', recebido_em = '2026-12-05', valor_recebido = 120 where id = 'rec-fg1'$q$);
select harness.rodar('financeiro', 'G9 recebido sem data é recusado', 'erro: chk_recebido', :'sup', 'authenticated',
  $q$insert into public.recebimentos (tipo, descricao, valor, status) values ('outro', 'x', 1, 'recebido')$q$);
select harness.rodar('financeiro', 'G10 rateio passa de 100% é recusado', 'erro: O rateio passa de 100%', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.rateios (origem_tipo, origem_id, departamento_id, percentual) values ('fatura', 'fat-fg1', 'dep-fg1', 60);
    insert into public.rateios (origem_tipo, origem_id, departamento_id, percentual) values ('fatura', 'fat-fg1', 'dep-1', 50);
  end $x$$q$);
select harness.rodar('financeiro', 'G11 suporte não fecha o imobilizado', 'erro: Só o administrador fecha o imobilizado', :'sup', 'authenticated',
  $q$select public.fechar_imobilizado(2025, '{}'::jsonb)$q$);
select harness.rodar('financeiro', 'G12 admin fecha, não fecha de novo, reabre com motivo e fecha outra vez', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.fechar_imobilizado(2025, '{"liquidoFinal": 0}'::jsonb);
    begin
      perform public.fechar_imobilizado(2025, '{}'::jsonb);
      raise exception 'fechou duas vezes';
    exception when unique_violation then null;
    end;
    perform public.reabrir_imobilizado(2025, 'Ajuste de NF');
    perform public.fechar_imobilizado(2025, '{"liquidoFinal": 1}'::jsonb);
    perform harness.espera($s$select 1 from public.imobilizado_fechamentos where ano = 2025$s$, 2);
  end $x$$q$);
select harness.rodar('financeiro', 'G13 ninguém altera a foto fechada direto na tabela', 'bloqueado', :'admin', 'authenticated',
  $q$update public.imobilizado_fechamentos set foto = '{}'::jsonb where ano = 2025$q$);

-- Limpeza
delete from public.imobilizado_fechamentos where ano = 2025;
delete from public.rateios where origem_id = 'fat-fg1';
delete from public.recebimentos where fornecedor_id = 'for-fg1';
delete from public.faturas where fornecedor_id = 'for-fg1';
delete from public.fornecedores where id = 'for-fg1';
delete from public.departamentos where id = 'dep-fg1';
