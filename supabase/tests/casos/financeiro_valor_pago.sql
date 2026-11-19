\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'

insert into public.fornecedores (id, nome) values ('forn-vp', 'Fornecedor VP');
insert into public.contratos (id, fornecedor_id, tipo, descricao, inicio, fim, valor, periodicidade) values
  ('ct-vp', 'forn-vp', 'internet', 'Link', '2026-01-01', '2026-12-31', 100, 'mensal');
insert into public.faturas (id, contrato_id, competencia, valor, vencimento) values
  ('fat-vp', 'ct-vp', '2026-10-01', 100, '2026-10-10');

select harness.rodar('financeiro', 'V1 pagar com multa guarda o pago e mantém o valor da fatura', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    update public.faturas set status = 'paga', pago_em = '2026-10-15', valor_pago = 112 where id = 'fat-vp';
    perform harness.espera($s$select 1 from public.faturas where id = 'fat-vp' and valor = 100 and valor_pago = 112$s$, 1);
  end $x$$q$);
select harness.rodar('financeiro', 'V2 valor pago só em fatura paga', 'erro: erro', :'sup', 'authenticated',
  $q$do $x$ begin update public.faturas set valor_pago = 112 where id = 'fat-vp';
    exception when check_violation then raise exception 'erro'; end $x$$q$);
select harness.rodar('financeiro', 'V3 desfazer pagamento volta ao valor original', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    update public.faturas set status = 'paga', pago_em = '2026-10-15', valor_pago = 112 where id = 'fat-vp';
    perform public.desfazer_pagamento('fat-vp', 'Pago por engano');
    perform harness.espera($s$select 1 from public.faturas where id = 'fat-vp' and status = 'a_pagar'
      and valor = 100 and valor_pago is null and pago_em is null$s$, 1);
  end $x$$q$);
select harness.rodar('financeiro', 'V4 suporte não desfaz pagamento', 'bloqueado', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.faturas set status = 'paga', pago_em = '2026-10-15' where id = 'fat-vp';
    perform public.desfazer_pagamento('fat-vp', 'Pago por engano');
  end $x$$q$);

delete from public.faturas where id = 'fat-vp';
delete from public.contratos where id = 'ct-vp';
delete from public.fornecedores where id = 'forn-vp';
