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
insert into public.fornecedores (id, nome) values ('for-cd1', 'Fornecedor CD1'), ('for-cd2', 'Fornecedor CD2');
select set_config('app.operacao_pedido', 'sim', false);
insert into public.pedidos_compra (id, titulo, justificativa, categoria, area, status, tipo_pedido, solicitante_id)
  values ('pcd-1', 'Monitor', 'Trabalho remoto', 'hardware', 'TI', 'em_cotacao', 'ti', 'emp-outro');
select set_config('app.operacao_pedido', '', false);
insert into public.pedido_itens (id, pedido_id, tipo, descricao, categoria_ativo, quantidade, valor_unitario, ordem)
  values ('pdi-1', 'pcd-1', 'equipamento', 'Monitor 24', 'periferico', 1, 900, 1);
insert into public.pedido_cotacoes (id, pedido_id, fornecedor_id, valor, vencedora) values ('pdc-1', 'pcd-1', 'for-cd1', 900, true);
insert into public.faturas (id, licenca_id, competencia, valor, vencimento) values ('fat-cd-lic', 'lic-1', '2026-10-01', 50, '2026-10-10');

-- Papel e leitura -----------------------------------------------------------------------------
select harness.rodar('compras', 'D1 papel compras existe e o pedido já tem o gestor de quem pediu', 'ok', :'compras', 'authenticated',
  $q$do $x$ begin
    if public.meu_papel() <> 'compras' then raise exception 'papel %', public.meu_papel(); end if;
    perform harness.espera($s$select 1 from public.pedidos_compra where id = 'pcd-1' and gestor_id = 'emp-colab'$s$, 1);
  end $x$$q$);
select harness.rodar('compras', 'D2 Compras lê fatura de pedido, não a de licença; lê orçamento e não grava', 'bloqueado', :'compras', 'authenticated',
  $q$do $x$ begin
    perform harness.espera($s$select 1 from public.faturas where id = 'fat-cd-lic'$s$, 0);
    perform harness.espera($s$select 1 from public.chamados$s$, 0);
    perform public.ativos_visiveis();
    insert into public.orcamentos (ano, categoria, valor_anual) values (2027, 'hardware', 10);
  end $x$$q$);
select harness.rodar('compras', 'D3 Compras cadastra fornecedor', 'ok', :'compras', 'authenticated',
  $q$insert into public.fornecedores (nome) values ('Papelaria Central')$q$);

-- Fluxo: qualquer colaborador pede, T.I. cota, gestor e Compras aprovam --------------------------
select harness.rodar('compras', 'F1 colaborador pede (T.I.): vai para cotação, com o gestor dele', 'ok', :'outro', 'authenticated',
  $q$do $x$
  declare v text;
  begin
    v := public.solicitar_compra('{"titulo":"Headset","justificativa":"Reuniões","tipo_pedido":"ti"}', '[{"descricao":"Headset USB"}]');
    perform harness.espera(format($s$select 1 from public.pedidos_visiveis() where id = %L and status = 'em_cotacao'
      and gestor_id = 'emp-colab' and gestor_nome = 'Colab' and solicitante_nome = 'Outro'$s$, v), 1);
  end $x$$q$);
select harness.rodar('compras', 'F2 pedido "Outros" vai direto para aprovação, itens como material/serviço', 'ok', :'rh', 'authenticated',
  $q$do $x$
  declare v text;
  begin
    v := public.solicitar_compra('{"titulo":"Cadeiras","justificativa":"Sala nova","tipo_pedido":"outros"}', '[{"descricao":"Cadeira","quantidade":4}]');
    perform harness.espera(format($s$select 1 from public.pedidos_visiveis() p, jsonb_array_elements(p.itens) i
      where p.id = %L and p.status = 'aguardando' and p.tipo_pedido = 'outros' and i ->> 'tipo' = 'servico'$s$, v), 1);
  end $x$$q$);
select harness.rodar('compras', 'F3 quem pediu não tira o pedido da cotação da T.I.', 'bloqueado', :'outro', 'authenticated',
  $q$select public.mudar_status_pedido('pcd-1', 'enviar')$q$);
select harness.rodar('compras', 'F4 T.I. devolve com motivo', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.mudar_status_pedido('pcd-1', 'devolver', 'Já temos monitor no estoque');
    perform harness.espera($s$select 1 from public.pedidos_compra where id = 'pcd-1' and status = 'recusado'$s$, 1);
  end $x$$q$);
select harness.rodar('compras', 'F5 Compras não aprova antes do gestor', 'bloqueado', :'compras', 'authenticated',
  $q$do $x$ begin
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
    perform public.mudar_status_pedido('pcd-1', 'enviar');
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000008","role":"authenticated"}', true);
    perform public.mudar_status_pedido('pcd-1', 'aprovar');
  end $x$$q$);
select harness.rodar('compras', 'F6 gestor aprova (segue aguardando Compras) e Compras aprova', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
    perform public.mudar_status_pedido('pcd-1', 'enviar');
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
    perform public.mudar_status_pedido('pcd-1', 'aprovar');
    perform harness.espera($s$select 1 from public.pedidos_visiveis() where id = 'pcd-1' and status = 'aguardando'
      and aprovado_gestor_por = 'emp-colab'$s$, 1);
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000008","role":"authenticated"}', true);
    perform public.mudar_status_pedido('pcd-1', 'aprovar');
    perform harness.espera($s$select 1 from public.pedidos_compra where id = 'pcd-1' and status = 'aprovado' and aprovado_por = 'emp-compras'$s$, 1);
  end $x$$q$);
select harness.rodar('compras', 'F7 outro colaborador (não gestor) não aprova', 'bloqueado', :'rh', 'authenticated',
  $q$do $x$ begin
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
    perform public.mudar_status_pedido('pcd-1', 'enviar');
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
    perform public.mudar_status_pedido('pcd-1', 'aprovar');
  end $x$$q$);

-- Compra por Compras -------------------------------------------------------------------------
select harness.rodar('compras', 'C1 comprar em outro fornecedor exige motivo', 'erro: Explique por que a compra foi feita em outro fornecedor', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.mudar_status_pedido('pcd-1', 'enviar');
    perform set_config('app.operacao_pedido', 'sim', true);
    update public.pedidos_compra set aprovado_gestor_em = now() where id = 'pcd-1';
    perform set_config('app.operacao_pedido', '', true);
    perform public.mudar_status_pedido('pcd-1', 'aprovar');
    perform public.registrar_compra_pedido('pcd-1', '{"fornecedor_id":"for-cd2","data_compra":"2026-11-10","vencimento":"2026-12-10"}');
  end $x$$q$);
select harness.rodar('compras', 'C2 Compras registra a compra com NF (chave e arquivo) e a fatura leva o arquivo', 'ok', :'compras', 'authenticated',
  $q$do $x$ begin
    perform set_config('app.operacao_pedido', 'sim', true);
    update public.pedidos_compra set status = 'aprovado', fornecedor_id = 'for-cd1' where id = 'pcd-1';
    perform set_config('app.operacao_pedido', '', true);
    perform public.registrar_compra_pedido('pcd-1', '{"fornecedor_id":"for-cd2","motivo_troca":"Entrega no mesmo dia","numero_nf":"123",
      "nf_chave":"35261112345678000199550010000001231000001234","nf_arquivo":"pedidos/pcd-1/nf.pdf","data_compra":"2026-11-10","vencimento":"2026-12-10"}');
    perform harness.espera($s$select 1 from public.faturas where pedido_id = 'pcd-1' and arquivo_caminho = 'pedidos/pcd-1/nf.pdf' and valor = 900$s$, 1);
    perform harness.espera($s$select 1 from public.pedidos_compra where id = 'pcd-1' and status = 'comprado'
      and fornecedor_troca_motivo = 'Entrega no mesmo dia' and nf_chave like '3526%'$s$, 1);
  end $x$$q$);
select harness.rodar('compras', 'C3 suporte da T.I. não registra compra', 'bloqueado', :'sup', 'authenticated',
  $q$select public.registrar_compra_pedido('pcd-1', '{"data_compra":"2026-11-10","vencimento":"2026-12-10"}')$q$);
select harness.rodar('compras', 'C4 chave da NF-e com 44 dígitos', 'erro: A chave da NF-e tem 44 dígitos', :'compras', 'authenticated',
  $q$do $x$ begin
    perform set_config('app.operacao_pedido', 'sim', true);
    update public.pedidos_compra set status = 'aprovado', fornecedor_id = 'for-cd1' where id = 'pcd-1';
    perform set_config('app.operacao_pedido', '', true);
    perform public.registrar_compra_pedido('pcd-1', '{"nf_chave":"123","data_compra":"2026-11-10","vencimento":"2026-12-10"}');
  end $x$$q$);
select harness.rodar('compras', 'C5 Compras paga a fatura do pedido', 'ok', :'compras', 'authenticated',
  $q$do $x$ begin
    perform set_config('app.operacao_pedido', 'sim', true);
    update public.pedidos_compra set status = 'aprovado', fornecedor_id = 'for-cd1' where id = 'pcd-1';
    perform set_config('app.operacao_pedido', '', true);
    perform public.registrar_compra_pedido('pcd-1', '{"data_compra":"2026-11-10","vencimento":"2026-12-10"}');
    perform harness.afeta($s$update public.faturas set status = 'paga', pago_em = '2026-11-20' where pedido_id = 'pcd-1'$s$, 1);
  end $x$$q$);
select harness.rodar('compras', 'C6 Compras não recebe pedido de T.I. (a T.I. recebe)', 'bloqueado', :'compras', 'authenticated',
  $q$do $x$ begin
    perform set_config('app.operacao_pedido', 'sim', true);
    update public.pedidos_compra set status = 'comprado' where id = 'pcd-1';
    perform set_config('app.operacao_pedido', '', true);
    perform public.receber_pedido('pcd-1', '{"ativos":[{"item_id":"pdi-1","tag":"#PAT-7001"}]}');
  end $x$$q$);
select harness.rodar('compras', 'C7 T.I. recebe e o equipamento entra com a chave da NF', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform set_config('app.operacao_pedido', 'sim', true);
    update public.pedidos_compra set status = 'comprado', fornecedor_id = 'for-cd1', nf_chave = '35261112345678000199550010000001231000001234' where id = 'pcd-1';
    perform set_config('app.operacao_pedido', '', true);
    perform public.receber_pedido('pcd-1', '{"ativos":[{"item_id":"pdi-1","tag":"#PAT-7001"}]}');
    perform harness.espera($s$select 1 from public.ativos where tag = '#PAT-7001' and fiscal ->> 'chaveAcesso44' like '3526%'$s$, 1);
  end $x$$q$);

-- Conversa ------------------------------------------------------------------------------------
select harness.rodar('compras', 'M1 quem pediu conversa; não vê nota interna de Compras', 'ok', :'outro', 'authenticated',
  $q$do $x$ begin
    insert into public.pedido_mensagens (pedido_id, texto) values ('pcd-1', 'Precisa ser USB-C?');
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000008","role":"authenticated"}', true);
    insert into public.pedido_mensagens (pedido_id, texto, interna) values ('pcd-1', 'Fornecedor 2 mais barato', true);
    insert into public.pedido_mensagens (pedido_id, texto) values ('pcd-1', 'Sim, USB-C');
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000009","role":"authenticated"}', true);
    perform harness.espera($s$select 1 from public.pedido_mensagens where pedido_id = 'pcd-1'$s$, 2);
    perform harness.espera($s$select 1 from public.pedido_mensagens where autor_id = 'emp-outro'$s$, 1);
  end $x$$q$);
select harness.rodar('compras', 'M2 quem pediu não grava nota interna', 'bloqueado', :'outro', 'authenticated',
  $q$insert into public.pedido_mensagens (pedido_id, texto, interna) values ('pcd-1', 'segredo', true)$q$);
select harness.rodar('compras', 'M3 RH (vê o pedido) conversa, mas não grava nota interna', 'bloqueado', :'rh', 'authenticated',
  $q$insert into public.pedido_mensagens (pedido_id, texto, interna) values ('pcd-1', 'Interna do RH', true)$q$);

-- Limpeza
delete from public.faturas where id = 'fat-cd-lic';
delete from public.pedido_mensagens where pedido_id = 'pcd-1';
delete from public.pedido_cotacoes where pedido_id = 'pcd-1';
delete from public.pedido_itens where pedido_id = 'pcd-1';
delete from public.pedido_eventos where pedido_id = 'pcd-1';
delete from public.pedidos_compra where id = 'pcd-1';
delete from public.fornecedores where id in ('for-cd1', 'for-cd2');
update public.colaboradores set gestor_id = null where id = 'emp-outro';
update public.colaboradores set auth_user_id = null where id = 'emp-outro';
delete from auth.users where id in ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000009');
delete from public.colaboradores where id = 'emp-compras';
