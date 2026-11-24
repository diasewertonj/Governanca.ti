\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set rh '{"sub":"00000000-0000-0000-0000-000000000005","email":"rh@x.test","role":"authenticated"}'
\set compras '{"sub":"00000000-0000-0000-0000-000000000008","email":"compras@x.test","role":"authenticated"}'
\set gestor '{"sub":"00000000-0000-0000-0000-000000000021","email":"gestor-ckf@x.test","role":"authenticated"}'
\set anon '{"role":"anon"}'

-- Check geral · financeiro e seguranca (dados do arquivo, desfeitos no fim)
insert into public.colaboradores (id, matricula, nome, email, cargo, setor_id, status, role, data_admissao)
  values ('emp-ckf-compras', 'MCKF', 'Compras CKF', 'compras@x.test', 'Comprador', 'dep-1', 'ativo', 'compras', '2026-01-01');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000008', 'compras@x.test');
insert into public.fornecedores (id, nome) values ('for-ckf1', 'Fornecedor CKF');
insert into public.departamentos (id, codigo, nome) values ('dep-ckf1', 'CKF1', 'Area CKF'), ('dep-ckf2', 'CKF2', 'Area CKF 2') on conflict (id) do nothing;
insert into public.contratos (id, fornecedor_id, tipo, descricao, inicio, valor, periodicidade, forma_pagamento, cartao_final, pagamento_titular, departamento_id, categoria_despesa)
  values ('ct-ckf1', 'for-ckf1', 'licenciamento', 'Contrato CKF', '2026-01-01', 100, 'mensal', 'cartao', '4321', 'Financeiro', 'dep-ckf1', 'software');
update public.licencas_software set forma_pagamento = 'cartao', cartao_final = '1234', pagamento_titular = 'Financeiro' where id = 'lic-1';
insert into public.faturas (id, contrato_id, competencia, valor, vencimento) values ('fat-ckf1', 'ct-ckf1', '2026-11-01', 100, '2026-11-20');
insert into public.faturas (id, contrato_id, competencia, valor, vencimento, status, pago_em) values ('fat-ckf2', 'ct-ckf1', '2026-10-01', 100, '2026-10-20', 'paga', '2026-10-20');
insert into public.recebimentos (id, tipo, descricao, valor, previsto_para, fornecedor_id)
  values ('rec-ckf1', 'reembolso_fornecedor', 'Credito CKF', 50, '2026-12-05', 'for-ckf1');
insert into public.colaboradores (id, matricula, nome, email, cargo, setor_id, status, role, data_admissao)
  values ('emp-ckf-gestor', 'MCKG', 'Gestor CKF', 'gestor-ckf@x.test', 'Gerente', 'dep-ckf1', 'ativo', 'colaborador', '2026-01-01');
insert into public.colaboradores (id, matricula, nome, email, cargo, setor_id, status, role, data_admissao, gestor_id)
  values ('emp-ckf-sub', 'MCKS', 'Equipe CKF', 'equipe-ckf@x.test', 'Analista', 'dep-ckf1', 'ativo', 'colaborador', '2026-01-01', 'emp-ckf-gestor');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000021', 'gestor-ckf@x.test');
insert into public.orcamentos (id, ano, categoria, area, valor_anual, departamento_id) values ('orc-ckf1', 2026, 'software', 'Area CKF', 2000, 'dep-ckf1');

-- 1. configuracoes_empresa
select harness.rodar('check_financeiro', 'F1 sem login le so nome e logo da empresa', 'ok', :'anon', 'anon',
  $q$select razao_social, nome_fantasia, logo_url from public.configuracoes_empresa$q$);
select harness.rodar('check_financeiro', 'F2 sem login nao le CNPJ nem premissas', 'bloqueado', :'anon', 'anon',
  $q$select cnpj, premissas_financeiras from public.configuracoes_empresa$q$);
select harness.rodar('check_financeiro', 'F3 sem login nao le a vida util', 'bloqueado', :'anon', 'anon',
  $q$select vida_util from public.configuracoes_empresa$q$);
select harness.rodar('check_financeiro', 'F4 colaborador nao le premissas financeiras', 'bloqueado', :'colab', 'authenticated',
  $q$select premissas_financeiras from public.configuracoes_empresa$q$);
select harness.rodar('check_financeiro', 'F5 colaborador le os dados da empresa e nao as premissas pela funcao', 'ok', :'colab', 'authenticated',
  $q$select cnpj, email_ti, sla from public.configuracoes_empresa$q$);
select harness.rodar('check_financeiro', 'F6 colaborador e RH nao chamam premissas_financeiras_ler', 'bloqueado', :'rh', 'authenticated',
  $q$select * from public.premissas_financeiras_ler()$q$);
select harness.rodar('check_financeiro', 'F7 T.I. suporte e Compras leem as premissas pela funcao', 'ok', :'compras', 'authenticated',
  $q$select * from public.premissas_financeiras_ler()$q$);
select harness.rodar('check_financeiro', 'F8 admin grava empresa (upsert como o app) e premissas pela funcao', 'ok', :'admin', 'authenticated',
  $q$do $x$ declare v_id text := (select id from public.configuracoes_empresa limit 1); begin
    insert into public.configuracoes_empresa (id, razao_social, nome_fantasia, cnpj, endereco, cidade_uf, cep, email_ti, telefone_ti,
      texto_termo_entrega, texto_termo_devolucao, logo_url, sla, updated_at)
    values (v_id, 'Empresa Teste', 'Teste', '00', 'Rua', 'SP', '0', 'ti@x', '0', 'a', 'b', null, null, now())
    on conflict (id) do update set razao_social = excluded.razao_social, nome_fantasia = excluded.nome_fantasia, cnpj = excluded.cnpj,
      logo_url = excluded.logo_url, sla = excluded.sla, updated_at = excluded.updated_at;
    perform public.salvar_premissas_financeiras('{"limiteCapitalizacao": 900}'::jsonb, '{"notebook": 4}'::jsonb);
    perform harness.espera($s$select 1 from public.premissas_financeiras_ler() where premissas_financeiras ->> 'limiteCapitalizacao' = '900' and vida_util ->> 'notebook' = '4'$s$, 1);
  end $x$$q$);
select harness.rodar('check_financeiro', 'F8b suporte nao grava premissas', 'bloqueado', :'sup', 'authenticated',
  $q$select public.salvar_premissas_financeiras('{}'::jsonb, null)$q$);select harness.rodar('check_financeiro', 'F9 colaborador nao grava configuracoes', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
    perform harness.afeta($s$update public.configuracoes_empresa set cnpj = '11'$s$, 0);
  end $x$$q$);

-- 2. dados de pagamento so para o admin
select harness.rodar('check_financeiro', 'F10 suporte recebe licencas sem cartao nem titular', 'ok', :'sup', 'authenticated',
  $q$select harness.espera($s$select 1 from public.licencas_visiveis() where id = 'lic-1' and cartao_final is null and pagamento_titular is null and forma_pagamento is null$s$, 1)$q$);
select harness.rodar('check_financeiro', 'F11 admin recebe licencas com cartao e titular', 'ok', :'admin', 'authenticated',
  $q$select harness.espera($s$select 1 from public.licencas_visiveis() where id = 'lic-1' and cartao_final = '1234' and pagamento_titular = 'Financeiro'$s$, 1)$q$);
select harness.rodar('check_financeiro', 'F12 suporte nao le o cartao direto na tabela de licencas', 'bloqueado', :'sup', 'authenticated',
  $q$select cartao_final from public.licencas_software$q$);
select harness.rodar('check_financeiro', 'F13 suporte le o resto da licenca direto na tabela', 'ok', :'sup', 'authenticated',
  $q$select id, nome, valor_mensal, fornecedor_id from public.licencas_software$q$);
select harness.rodar('check_financeiro', 'F14 suporte recebe contratos sem pagamento', 'ok', :'sup', 'authenticated',
  $q$select harness.espera($s$select 1 from public.contratos_visiveis() where id = 'ct-ckf1' and cartao_final is null and pagamento_titular is null and forma_pagamento is null$s$, 1)$q$);
select harness.rodar('check_financeiro', 'F15 admin recebe contratos com pagamento', 'ok', :'admin', 'authenticated',
  $q$select harness.espera($s$select 1 from public.contratos_visiveis() where id = 'ct-ckf1' and cartao_final = '4321' and forma_pagamento = 'cartao'$s$, 1)$q$);
select harness.rodar('check_financeiro', 'F16 suporte nao le o cartao direto na tabela de contratos', 'bloqueado', :'sup', 'authenticated',
  $q$select cartao_final from public.contratos$q$);
select harness.rodar('check_financeiro', 'F17 colaborador nao recebe contratos', 'ok', :'colab', 'authenticated',
  $q$select harness.espera($s$select 1 from public.contratos_visiveis()$s$, 0)$q$);
select harness.rodar('check_financeiro', 'F18 admin ainda grava os dados de pagamento do contrato', 'ok', :'admin', 'authenticated',
  $q$update public.contratos set cartao_final = '9999', forma_pagamento = 'cartao' where id = 'ct-ckf1'$q$);

-- 3. Compras so paga a fatura
select harness.rodar('check_financeiro', 'F19 Compras nao altera valor da fatura', 'bloqueado', :'compras', 'authenticated',
  $q$update public.faturas set valor = 1 where id = 'fat-ckf1'$q$);
select harness.rodar('check_financeiro', 'F20 Compras nao muda vencimento nem contrato da fatura', 'bloqueado', :'compras', 'authenticated',
  $q$update public.faturas set vencimento = '2026-12-31' where id = 'fat-ckf1'$q$);
select harness.rodar('check_financeiro', 'F21 Compras paga a fatura (status, valor pago, data)', 'ok', :'compras', 'authenticated',
  $q$update public.faturas set status = 'paga', pago_em = '2026-11-19', valor_pago = 102 where id = 'fat-ckf1'$q$);
select harness.rodar('check_financeiro', 'F22 admin altera o valor de fatura a pagar', 'ok', :'admin', 'authenticated',
  $q$update public.faturas set valor = 110 where id = 'fat-ckf1'$q$);

-- 4. Recebimentos
select harness.rodar('check_financeiro', 'F23 Compras nao registra recebimento', 'bloqueado', :'compras', 'authenticated',
  $q$insert into public.recebimentos (tipo, descricao, valor) values ('outro', 'x', 10)$q$);
select harness.rodar('check_financeiro', 'F24 Compras nao muda descricao nem valor previsto', 'bloqueado', :'compras', 'authenticated',
  $q$update public.recebimentos set valor = 1 where id = 'rec-ckf1'$q$);
select harness.rodar('check_financeiro', 'F25 Compras nao cancela recebimento', 'bloqueado', :'compras', 'authenticated',
  $q$update public.recebimentos set status = 'cancelado' where id = 'rec-ckf1'$q$);
select harness.rodar('check_financeiro', 'F26 Compras confirma o recebido', 'ok', :'compras', 'authenticated',
  $q$do $x$ begin
    update public.recebimentos set status = 'recebido', recebido_em = '2026-12-05', valor_recebido = 50 where id = 'rec-ckf1';
    perform harness.espera($s$select 1 from public.recebimentos where id = 'rec-ckf1' and status = 'recebido'$s$, 1);
  end $x$$q$);
select harness.rodar('check_financeiro', 'F27 suporte registra recebimento', 'ok', :'sup', 'authenticated',
  $q$insert into public.recebimentos (tipo, descricao, valor) values ('outro', 'Registro do suporte', 10)$q$);

-- 5. Rateio transacional
select harness.rodar('check_financeiro', 'F28 suporte salva o rateio de uma origem', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.salvar_rateio('contrato', 'ct-ckf1', '[{"departamento_id":"dep-ckf1","percentual":60},{"departamento_id":"dep-ckf2","percentual":40}]'::jsonb);
    perform harness.espera($s$select 1 from public.rateios where origem_id = 'ct-ckf1'$s$, 2);
    perform public.salvar_rateio('contrato', 'ct-ckf1', '[{"departamento_id":"dep-ckf1","percentual":100}]'::jsonb);
    perform harness.espera($s$select 1 from public.rateios where origem_id = 'ct-ckf1'$s$, 1);
    perform public.salvar_rateio('contrato', 'ct-ckf1', '[]'::jsonb);
    perform harness.espera($s$select 1 from public.rateios where origem_id = 'ct-ckf1'$s$, 0);
  end $x$$q$);
select harness.rodar('check_financeiro', 'F29 rateio acima de 100% e recusado e o antigo continua', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.salvar_rateio('contrato', 'ct-ckf1', '[{"departamento_id":"dep-ckf1","percentual":70}]'::jsonb);
    begin
      perform public.salvar_rateio('contrato', 'ct-ckf1', '[{"departamento_id":"dep-ckf1","percentual":80},{"departamento_id":"dep-ckf2","percentual":40}]'::jsonb);
      raise exception 'aceitou mais de 100';
    exception when check_violation then null;
    end;
    perform harness.espera($s$select 1 from public.rateios where origem_id = 'ct-ckf1' and percentual = 70$s$, 1);
  end $x$$q$);
select harness.rodar('check_financeiro', 'F30 colaborador e Compras nao salvam rateio', 'bloqueado', :'compras', 'authenticated',
  $q$select public.salvar_rateio('contrato', 'ct-ckf1', '[]'::jsonb)$q$);
select harness.rodar('check_financeiro', 'F31 origem invalida no rateio e recusada', 'erro: Origem de rateio inválida', :'sup', 'authenticated',
  $q$select public.salvar_rateio('xis', 'ct-ckf1', '[]'::jsonb)$q$);

-- 6. Custos da minha area (rateio + a pagar)
select harness.rodar('check_financeiro', 'F32 gestor ve pago e a pagar da area, sem rateio', 'ok', :'gestor', 'authenticated',
  $q$select harness.espera($s$select 1 from public.custos_area_gestor(2026) where categoria = 'software' and previsto = 2000 and realizado = 100 and a_pagar = 100$s$, 1)$q$);
insert into public.rateios (origem_tipo, origem_id, departamento_id, percentual) values ('contrato', 'ct-ckf1', 'dep-ckf2', 60);
select harness.rodar('check_financeiro', 'F33 gestor ve so a parte que sobra para a area dele (rateio de 60% foi para outra)', 'ok', :'gestor', 'authenticated',
  $q$select harness.espera($s$select 1 from public.custos_area_gestor(2026) where categoria = 'software' and a_pagar = 40 and realizado = 40$s$, 1)$q$);
update public.faturas set status = 'cancelada' where id = 'fat-ckf1';
select harness.rodar('check_financeiro', 'F34 fatura cancelada nao entra nos custos da area', 'ok', :'gestor', 'authenticated',
  $q$select harness.espera($s$select 1 from public.custos_area_gestor(2026) where categoria = 'software' and a_pagar = 0 and realizado = 40$s$, 1)$q$);
-- 7. Resumo do recorrente para Compras
select harness.rodar('check_financeiro', 'F35 Compras recebe o resumo recorrente sem pagamento', 'ok', :'compras', 'authenticated',
  $q$do $x$ begin
    perform harness.espera($s$select 1 from public.recorrente_resumo() where origem = 'contrato' and id = 'ct-ckf1' and mensal = 100 and recorrente$s$, 1);
    perform harness.espera($s$select 1 from public.recorrente_resumo() where origem = 'licenca' and id = 'lic-1'$s$, 1);
    perform harness.espera($s$select 1 from public.contratos$s$, 0);
  end $x$$q$);
select harness.rodar('check_financeiro', 'F36 colaborador nao recebe o resumo recorrente', 'bloqueado', :'colab', 'authenticated',
  $q$select * from public.recorrente_resumo()$q$);

-- Limpeza
delete from public.rateios where origem_id in ('ct-ckf1', 'fat-ckf1', 'fat-ckf2');
delete from public.recebimentos where fornecedor_id = 'for-ckf1' or descricao in ('Registro do suporte');
delete from public.faturas where contrato_id = 'ct-ckf1';
delete from public.contratos where id = 'ct-ckf1';
update public.licencas_software set forma_pagamento = null, cartao_final = null, pagamento_titular = null where id = 'lic-1';
delete from public.orcamentos where id = 'orc-ckf1';
update public.colaboradores set auth_user_id = null where id in ('emp-ckf-gestor', 'emp-ckf-compras');
delete from auth.users where id in ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000008');
delete from public.colaboradores where id in ('emp-ckf-sub', 'emp-ckf-gestor', 'emp-ckf-compras');
delete from public.fornecedores where id = 'for-ckf1';
delete from public.departamentos where id in ('dep-ckf1', 'dep-ckf2');
update public.configuracoes_empresa set premissas_financeiras = '{}'::jsonb, vida_util = null;
