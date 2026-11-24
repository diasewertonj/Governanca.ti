\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set rh '{"sub":"00000000-0000-0000-0000-000000000005","email":"rh@x.test","role":"authenticated"}'
\set compras '{"sub":"00000000-0000-0000-0000-000000000008","email":"compras@x.test","role":"authenticated"}'
\set outro '{"sub":"00000000-0000-0000-0000-000000000009","email":"outro@x.test","role":"authenticated"}'

-- Dados do arquivo (desfeitos no fim). emp-colab é gestor de emp-outro.
insert into public.colaboradores (id, matricula, nome, email, cargo, setor_id, status, role, data_admissao)
  values ('emp-compras', 'M9', 'Compras', 'compras@x.test', 'Comprador', 'dep-1', 'ativo', 'compras', '2026-01-01');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000008', 'compras@x.test'),
  ('00000000-0000-0000-0000-000000000009', 'outro@x.test');
update public.colaboradores set gestor_id = 'emp-colab' where id = 'emp-outro';
select set_config('app.operacao_pedido', 'sim', false);
insert into public.pedidos_compra (id, titulo, justificativa, categoria, area, status, tipo_pedido, solicitante_id, chamado_id) values
  ('pck-1', 'Monitor', 'Trabalho remoto', 'hardware', 'TI', 'em_cotacao', 'ti', 'emp-outro', null),
  ('pck-2', 'Rascunho', 'Ainda escrevendo', 'hardware', 'TI', 'rascunho', 'ti', 'emp-outro', null),
  ('pck-3', 'Pedido de Compras', 'Material', 'hardware', 'TI', 'em_cotacao', 'ti', 'emp-compras', null),
  ('pck-4', 'Kit admissao', 'Nova pessoa', 'hardware', 'TI', 'em_cotacao', 'ti', 'emp-colab', 'tkt-3'),
  ('pck-5', 'Pedido do RH', 'Cadeira', 'hardware', 'TI', 'rascunho', 'ti', 'emp-rh', null),
  ('pck-6', 'Aprovado', 'Para comprar', 'hardware', 'TI', 'em_cotacao', 'ti', 'emp-outro', null);
select set_config('app.operacao_pedido', '', false);
insert into public.pedido_itens (id, pedido_id, tipo, descricao, quantidade, ordem) values
  ('pki-1', 'pck-1', 'acessorio', 'Monitor', 1, 1),
  ('pki-2', 'pck-2', 'acessorio', 'Mouse', 1, 1),
  ('pki-3', 'pck-3', 'acessorio', 'Teclado', 1, 1),
  ('pki-6', 'pck-6', 'acessorio', 'Cabo', 1, 1);
select set_config('app.operacao_pedido', 'sim', false);
update public.pedidos_compra set status = 'aprovado' where id = 'pck-6';
select set_config('app.operacao_pedido', '', false);

-- Aprovação -----------------------------------------------------------------------------------
select harness.rodar('check_compras', 'K1 rascunho não é aprovado', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    begin
      perform public.aprovar_pedido('pck-2', 'emp-admin', 'pessoalmente');
      raise exception 'aprovou rascunho';
    exception when sqlstate '23514' then
      if sqlerrm not like '%não está aguardando aprovação%' then raise; end if;
    end;
  end $x$$q$);
select harness.rodar('check_compras', 'K2 suporte da T.I. não registra aprovação', 'bloqueado', :'sup', 'authenticated',
  $q$select public.aprovar_pedido('pck-1', 'emp-admin', 'pessoalmente')$q$);
select harness.rodar('check_compras', 'K3 quem pediu não registra a aprovação do próprio pedido', 'erro: Quem pediu não pode registrar a aprovação do próprio pedido', :'compras', 'authenticated',
  $q$select public.aprovar_pedido('pck-3', 'emp-admin', 'pessoalmente')$q$);
select harness.rodar('check_compras', 'K4 Compras aprova pedido em cotação; pedidos_visiveis devolve aprovação', 'ok', :'compras', 'authenticated',
  $q$do $x$ begin
    perform public.aprovar_pedido('pck-1', 'emp-colab', 'email', 'Confirmado');
    perform harness.espera($s$select 1 from public.pedidos_visiveis() where id = 'pck-1' and status = 'aprovado'
      and aprovador_id = 'emp-colab' and aprovacao_forma = 'email' and aprovacao_obs = 'Confirmado'
      and aprovado_por = 'emp-compras' and aprovado_em is not null$s$, 1);
  end $x$$q$);
select harness.rodar('check_compras', 'K5 suporte não devolve pedido aprovado', 'bloqueado', :'sup', 'authenticated',
  $q$select public.mudar_status_pedido('pck-6', 'devolver', 'Voltar para cotar')$q$);
select harness.rodar('check_compras', 'K6 Compras devolve o aprovado: zera toda a aprovação', 'ok', :'compras', 'authenticated',
  $q$do $x$ begin
    perform set_config('app.operacao_pedido', 'sim', true);
    update public.pedidos_compra set status = 'em_cotacao' where id = 'pck-1';
    perform set_config('app.operacao_pedido', '', true);
    perform public.aprovar_pedido('pck-1', 'emp-colab', 'email', 'Confirmado');
    perform public.mudar_status_pedido('pck-1', 'devolver', 'O preço mudou');
    perform harness.espera($s$select 1 from public.pedidos_compra where id = 'pck-1' and status = 'em_cotacao'
      and aprovado_por is null and aprovado_em is null and aprovador_id is null and aprovacao_forma is null
      and aprovacao_obs is null and aprovado_gestor_por is null and aprovado_gestor_em is null$s$, 1);
  end $x$$q$);
select harness.rodar('check_compras', 'K7 campos da aprovação não se gravam direto', 'erro: Esses dados do pedido são gravados pelas ações (aprovar, comprar, receber)', :'sup', 'authenticated',
  $q$update public.pedidos_compra set aprovacao_obs = 'forjado' where id = 'pck-1'$q$);
select harness.rodar('check_compras', 'K7b loja e link da compra não se gravam direto', 'erro: Esses dados do pedido são gravados pelas ações (aprovar, comprar, receber)', :'admin', 'authenticated',
  $q$update public.pedidos_compra set loja_compra = 'Falsa' where id = 'pck-1'$q$);

-- Compra --------------------------------------------------------------------------------------
select harness.rodar('check_compras', 'K8 compra exige valor maior que zero em cada item', 'erro: Informe o valor pago de cada item (maior que zero)', :'compras', 'authenticated',
  $q$select public.registrar_compra_pedido('pck-6', '{"loja":"Loja","data_compra":"2026-11-10","vencimento":"2026-12-10","itens":[{"id":"pki-6","valor_unitario":0}]}')$q$);
select harness.rodar('check_compras', 'K9 vencimento não pode ser antes da compra', 'erro: O vencimento não pode ser antes da data da compra', :'compras', 'authenticated',
  $q$select public.registrar_compra_pedido('pck-6', '{"loja":"Loja","data_compra":"2026-11-10","vencimento":"2026-11-01","itens":[{"id":"pki-6","valor_unitario":50}]}')$q$);
select harness.rodar('check_compras', 'K10 data da compra não pode ser futura', 'erro: A data da compra não pode ser futura', :'compras', 'authenticated',
  $q$select public.registrar_compra_pedido('pck-6', '{"loja":"Loja","data_compra":"2099-01-10","vencimento":"2099-02-10","itens":[{"id":"pki-6","valor_unitario":50}]}')$q$);
select harness.rodar('check_compras', 'K11 compra válida', 'ok', :'compras', 'authenticated',
  $q$do $x$ begin
    perform public.registrar_compra_pedido('pck-6', '{"loja":"Loja","data_compra":"2026-11-10","vencimento":"2026-12-10","itens":[{"id":"pki-6","valor_unitario":50}]}');
    perform harness.espera($s$select 1 from public.pedidos_compra where id = 'pck-6' and status = 'comprado' and valor_final = 50$s$, 1);
  end $x$$q$);

-- Visibilidade --------------------------------------------------------------------------------
select harness.rodar('check_compras', 'K12 RH vê só os próprios pedidos e os de admissão', 'ok', :'rh', 'authenticated',
  $q$do $x$ begin
    perform harness.espera($s$select 1 from public.pedidos_visiveis() where id in ('pck-4', 'pck-5')$s$, 2);
    perform harness.espera($s$select 1 from public.pedidos_visiveis() where id in ('pck-1', 'pck-2', 'pck-3', 'pck-6')$s$, 0);
  end $x$$q$);
select harness.rodar('check_compras', 'K13 gestor vê o pedido enviado, mas não o rascunho do subordinado', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
    perform harness.espera($s$select 1 from public.pedidos_visiveis() where id = 'pck-1'$s$, 1);
    perform harness.espera($s$select 1 from public.pedidos_visiveis() where id = 'pck-2'$s$, 0);
  end $x$$q$);
select harness.rodar('check_compras', 'K14 sou_gestor sem ler o cadastro de pessoas', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
    if not public.sou_gestor() then raise exception 'colab é gestor de emp-outro'; end if;
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000009","role":"authenticated"}', true);
    if public.sou_gestor() then raise exception 'outro não é gestor'; end if;
  end $x$$q$);

-- Limpeza
select set_config('app.operacao_pedido', 'sim', false);
delete from public.pedido_cotacoes where pedido_id like 'pck-%';
delete from public.pedido_itens where pedido_id like 'pck-%';
delete from public.pedido_eventos where pedido_id like 'pck-%';
delete from public.pedidos_compra where id like 'pck-%';
select set_config('app.operacao_pedido', '', false);
update public.colaboradores set gestor_id = null where id = 'emp-outro';
update public.colaboradores set auth_user_id = null where id = 'emp-outro';
delete from auth.users where id in ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000009');
delete from public.colaboradores where id = 'emp-compras';
