\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set rh '{"sub":"00000000-0000-0000-0000-000000000005","email":"rh@x.test","role":"authenticated"}'
\set outro '{"sub":"00000000-0000-0000-0000-000000000009","email":"outro@x.test","role":"authenticated"}'

-- Dados do arquivo (desfeitos no fim)
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000009', 'outro@x.test');
insert into public.fornecedores (id, nome) values ('for-op1', 'Loja OP1');
select set_config('app.operacao_pedido', 'sim', false);
insert into public.pedidos_compra (id, titulo, justificativa, categoria, area, status, tipo_pedido, solicitante_id)
  values ('pop-1', 'Teclados e mouses', 'Reposição', 'hardware', 'TI', 'em_cotacao', 'ti', 'emp-outro');
select set_config('app.operacao_pedido', '', false);
insert into public.pedido_itens (id, pedido_id, tipo, descricao, quantidade, ordem, marca, link) values
  ('poi-1', 'pop-1', 'acessorio', 'Teclado sem fio', 2, 1, 'Logitech', 'https://loja.test/teclado'),
  ('poi-2', 'pop-1', 'servico', 'Instalação', 1, 2, null, null);

select harness.rodar('opcoes', 'O1 quem pede informa link, valor, marca e opções; vê os próprios valores', 'ok', :'outro', 'authenticated',
  $q$do $x$
  declare v text;
  begin
    v := public.solicitar_compra('{"titulo":"Monitor","justificativa":"Segunda tela","tipo_pedido":"ti"}',
      '[{"descricao":"Monitor 27","marca":"LG","modelo":"27UP","link":"https://loja.test/lg","valor_referencia":1800,
         "opcoes":[{"link":"https://outra.test/dell","loja":"Outra","marca":"Dell","valor":1700}]}]');
    perform harness.espera(format($s$select 1 from public.pedidos_visiveis() p, jsonb_array_elements(p.itens) i
      where p.id = %L and i ->> 'link' = 'https://loja.test/lg' and (i ->> 'valor_referencia')::numeric = 1800
        and jsonb_array_length(i -> 'opcoes') = 2 and (i -> 'opcoes' -> 0 ->> 'loja') = 'loja.test'$s$, v), 1);
  end $x$$q$);
select harness.rodar('opcoes', 'O2 RH vê o item e o link, mas não os valores de quem pediu', 'ok', :'rh', 'authenticated',
  $q$do $x$
  declare v text;
  begin
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000009","role":"authenticated"}', true);
    v := public.solicitar_compra('{"titulo":"Monitor","justificativa":"Segunda tela"}',
      '[{"descricao":"Monitor 27","link":"https://loja.test/lg","valor_referencia":1800,"opcoes":[{"loja":"Outra","valor":1700}]}]');
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
    perform harness.espera(format($s$select 1 from public.pedidos_visiveis() p, jsonb_array_elements(p.itens) i
      where p.id = %L and i ->> 'link' is not null and i ->> 'valor_referencia' is null
        and i -> 'opcoes' -> 0 ->> 'valor' is null$s$, v), 1);
  end $x$$q$);
select harness.rodar('opcoes', 'O3 T.I. inclui opções no item e muda a marca; o histórico registra', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.pedido_cotacoes (pedido_id, item_id, link, loja, marca, valor) values ('pop-1', 'poi-1', 'https://a.test/x', 'Loja A', 'Microsoft', 150);
    update public.pedido_itens set marca = 'Microsoft' where id = 'poi-1';
    perform harness.espera($s$select 1 from public.pedido_eventos where pedido_id = 'pop-1' and campo = 'item'
      and motivo like '%Marca: Logitech → Microsoft%'$s$, 1);
  end $x$$q$);
select harness.rodar('opcoes', 'O4 aprova sem opção recomendada; T.I. exclui e inclui item com histórico', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    insert into public.pedido_cotacoes (pedido_id, item_id, fornecedor_id, valor) values ('pop-1', 'poi-1', 'for-op1', 140);
    delete from public.pedido_itens where id = 'poi-2';
    insert into public.pedido_itens (pedido_id, tipo, descricao, quantidade, ordem) values ('pop-1', 'acessorio', 'Mouse', 2, 3);
    perform harness.espera($s$select 1 from public.pedido_eventos where pedido_id = 'pop-1' and campo = 'item'
      and (motivo like 'Item excluído: Instalação%' or motivo like 'Item incluído: Mouse%')$s$, 2);
    perform public.aprovar_pedido('pop-1', 'emp-admin', 'pessoalmente');
    perform harness.espera($s$select 1 from public.pedidos_compra where id = 'pop-1' and status = 'aprovado'$s$, 1);
  end $x$$q$);
select harness.rodar('opcoes', 'O5 aprovar copia marca, modelo, link e valor da escolhida para o item', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    insert into public.pedido_cotacoes (pedido_id, item_id, fornecedor_id, link, marca, modelo, valor, vencedora)
      values ('pop-1', 'poi-1', 'for-op1', 'https://op1.test/k', 'Logitech', 'K270', 140, true);
    perform public.aprovar_pedido('pop-1', 'emp-admin', 'pessoalmente');
    perform harness.espera($s$select 1 from public.pedido_itens where id = 'poi-1' and marca = 'Logitech' and modelo = 'K270'
      and link = 'https://op1.test/k' and valor_unitario = 140$s$, 1);
    perform harness.espera($s$select 1 from public.pedidos_compra where id = 'pop-1' and status = 'aprovado' and fornecedor_id = 'for-op1'$s$, 1);
  end $x$$q$);
select harness.rodar('opcoes', 'O6 até 10 opções por item', 'erro: Cada item tem no máximo 10 opções', :'sup', 'authenticated',
  $q$do $x$ begin
    for i in 1..11 loop
      insert into public.pedido_cotacoes (pedido_id, item_id, loja, valor) values ('pop-1', 'poi-2', 'Loja ' || i, i);
    end loop;
  end $x$$q$);
select harness.rodar('opcoes', 'O7 opção precisa de fornecedor, loja ou link', 'erro: new row for relation "pedido_cotacoes" violates check constraint "chk_pedido_opcao"', :'sup', 'authenticated',
  $q$insert into public.pedido_cotacoes (pedido_id, item_id, valor) values ('pop-1', 'poi-2', 10)$q$);
select harness.rodar('opcoes', 'O8 recebimento cria o acessório no estoque com marca e modelo aprovados', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform set_config('app.operacao_pedido', 'sim', true);
    update public.pedido_itens set marca = 'Logitech', modelo = 'K270', valor_unitario = 140 where id = 'poi-1';
    update public.pedido_itens set valor_unitario = 50 where id = 'poi-2';
    update public.pedidos_compra set status = 'comprado', fornecedor_id = 'for-op1' where id = 'pop-1';
    perform set_config('app.operacao_pedido', '', true);
    perform public.receber_pedido('pop-1', '{"criar_estoque":["poi-1"],"localizacao":"Almoxarifado"}');
    perform harness.espera($s$select 1 from public.estoque_itens where nome = 'Teclado sem fio' and marca = 'Logitech'
      and modelo = 'K270' and quantidade = 2 and valor_unitario = 140$s$, 1);
  end $x$$q$);

select harness.rodar('opcoes', 'O9 Compras compra fora do cadastro informando loja e link', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.aprovar_pedido('pop-1', 'emp-admin', 'pessoalmente');
    perform public.registrar_compra_pedido('pop-1', '{"loja":"Loja Online X","link":"https://x.test/pedido/1","data_compra":"2026-11-10","vencimento":"2026-12-10","itens":[{"id":"poi-1","valor_unitario":130},{"id":"poi-2","valor_unitario":20}]}');
    perform harness.espera($s$select 1 from public.pedidos_compra where id = 'pop-1' and status = 'comprado' and fornecedor_id is null and loja_compra = 'Loja Online X'$s$, 1);
  end $x$$q$);

-- Limpeza
delete from public.pedido_eventos where pedido_id = 'pop-1';
delete from public.pedido_cotacoes where pedido_id = 'pop-1';
delete from public.pedido_itens where pedido_id = 'pop-1';
delete from public.pedidos_compra where id = 'pop-1';
delete from public.fornecedores where id = 'for-op1';
update public.colaboradores set auth_user_id = null where id = 'emp-outro';
delete from auth.users where id = '00000000-0000-0000-0000-000000000009';
