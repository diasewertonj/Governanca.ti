\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'

-- Seção 28 · Iniciar uso real (cada caso é desfeito no fim). Empresa de teste: "Empresa Teste" / "Teste".
select harness.rodar('uso_real', 'U1 admin vê a prévia', 'ok', :'admin', 'authenticated',
  $q$select harness.espera($s$select 1 from public.previa_uso_real() where item = 'Equipamentos'$s$, 1)$q$);
select harness.rodar('uso_real', 'U2 colaborador não vê a prévia', 'bloqueado', :'colab', 'authenticated',
  $q$select * from public.previa_uso_real()$q$);
select harness.rodar('uso_real', 'U3 suporte não inicia o uso real', 'bloqueado', :'sup', 'authenticated',
  $q$select public.iniciar_uso_real('Teste')$q$);
select harness.rodar('uso_real', 'U4 nome errado é recusado',
  'erro: Confirmação inválida: digite o nome da empresa como está em Configurações.', :'admin', 'authenticated',
  $q$select public.iniciar_uso_real('Outra empresa')$q$);

select harness.rodar('uso_real', 'U5 admin inicia: sai tudo, fica o admin, a configuração e a estrutura', 'ok', :'admin', 'authenticated',
  $q$do $x$ declare v jsonb; begin
    insert into public.fornecedores (id, nome) values ('for-ur1', 'Fornecedor UR');
    insert into public.recebimentos (id, tipo, descricao, valor, previsto_para, fornecedor_id)
      values ('rec-ur1', 'reembolso_fornecedor', 'Crédito UR', 10, '2026-12-05', 'for-ur1');
    perform set_config('app.operacao_baixa', 'sim', true);
    insert into public.ativo_baixas (id, ativo_id, motivo, destino, data_baixa, criado_por) values ('bx-ur2', 'ast-2', 'obsoleto', 'descarte', '2026-11-01', 'emp-admin');
    perform set_config('app.operacao_baixa', '', true);
    v := public.iniciar_uso_real('  empresa teste ');
    perform harness.espera($s$select 1 from public.colaboradores$s$, 1);
    perform harness.espera($s$select 1 from public.colaboradores where id = 'emp-admin'$s$, 1);
    perform harness.espera($s$select 1 from public.ativos$s$, 0);
    perform harness.espera($s$select 1 from public.licencas_software$s$, 0);
    perform harness.espera($s$select 1 from public.chamados$s$, 0);
    perform harness.espera($s$select 1 from public.recebimentos$s$, 0);
    perform harness.espera($s$select 1 from public.fornecedores$s$, 0);
    perform harness.espera($s$select 1 from public.configuracoes_empresa$s$, 1);
    perform harness.espera($s$select 1 from public.departamentos where id = 'dep-1'$s$, 1);
    perform harness.espera($s$select 1 from public.cadastro_eventos where entidade = 'sistema' and registro = 'uso_real'$s$, 1);
    if jsonb_typeof(v -> 'logins') <> 'array' then raise exception 'sem a lista de logins'; end if;
  end $x$$q$);

select harness.rodar('uso_real', 'U6 com a estrutura: departamentos e unidades também saem', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.iniciar_uso_real('Teste', true);
    perform harness.espera($s$select 1 from public.departamentos$s$, 0);
    perform harness.espera($s$select 1 from public.colaboradores where id = 'emp-admin' and setor_id is null$s$, 1);
  end $x$$q$);

select harness.rodar('uso_real', 'U7 fora da virada, a baixa continua protegida', 'erro: O registro de baixa faz parte do histórico e não pode ser apagado', :'admin', 'authenticated',
  $q$do $x$ begin
    perform set_config('app.operacao_baixa', 'sim', true);
    insert into public.ativo_baixas (id, ativo_id, motivo, destino, data_baixa, criado_por)
      values ('bx-ur1', 'ast-1', 'obsoleto', 'descarte', '2026-11-01', 'emp-admin');
    delete from public.ativo_baixas where id = 'bx-ur1';
  end $x$$q$);
