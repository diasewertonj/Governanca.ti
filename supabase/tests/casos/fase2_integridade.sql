\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set novo_chamado 'insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id, solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome) values '

select harness.rodar('fase2', 'P1 código do chamado vem do banco, ignora o do cliente', 'ok', :'colab', 'authenticated',
  $q$do $x$ declare c1 text; c2 text; begin
    insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id, solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome)
      values ('tkt-a','#CH-CLIENTE','t','d','suporte','c','critica','aberto','emp-colab','C','colab@x.test','A','TI') returning codigo into c1;
    insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id, solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome)
      values ('tkt-b','#CH-CLIENTE','t','d','suporte','c','media','aguardando_terceiro','emp-colab','C','colab@x.test','A','TI') returning codigo into c2;
    if c1 !~ '^#CH-[0-9]{4}-[0-9]{4}$' or c1 = c2 then raise exception 'códigos % %', c1, c2; end if; end $x$$q$);
select harness.rodar('fase2', 'P2 código do termo vem do banco', 'ok', :'sup', 'authenticated',
  $q$do $x$ declare c text; begin
    insert into public.termos_responsabilidade (id, codigo, tipo, colaborador_id, colaborador_nome, colaborador_matricula, colaborador_cargo, colaborador_setor_nome, status_assinatura, responsavel_ti_id, responsavel_ti_nome)
      values ('tr-a', 'x', 'entrega', 'emp-colab', 'C', 'M2', 'A', 'TI', 'gerado', 'emp-sup', 'S') returning codigo into c;
    if c !~ '^#TR-[0-9]{4}-[0-9]{4}$' then raise exception 'código %', c; end if; end $x$$q$);
select harness.rodar('fase2', 'P3 data_atualizacao mantida pelo banco no UPDATE', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin update public.chamados set status = 'em_andamento', data_atualizacao = '2000-01-01' where id = 'tkt-2';
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-2' and data_atualizacao = now()$s$, 1); end $x$$q$);
select harness.rodar('fase2', 'P4 suporte aloca assento', 'ok', :'sup', 'authenticated',
  $q$do $x$ declare v jsonb; begin v := public.alocar_licenca('lic-1', 'emp-colab');
    if not v ? 'emp-colab' then raise exception 'não alocou'; end if; end $x$$q$);
select harness.rodar('fase2', 'P5 alocar além do limite de assentos', 'erro: Não há assentos livres nesta licença', :'sup', 'authenticated',
  $q$do $x$ begin perform public.alocar_licenca('lic-1', 'emp-colab'); perform public.alocar_licenca('lic-1', 'emp-outro'); end $x$$q$);
select harness.rodar('fase2', 'P6 alocar duas vezes a mesma pessoa', 'erro: Colaborador já possui assento nesta licença', :'sup', 'authenticated',
  $q$do $x$ begin update public.licencas_software set assentos_totais = 5 where id = 'lic-1';
    perform public.alocar_licenca('lic-1', 'emp-colab'); perform public.alocar_licenca('lic-1', 'emp-colab'); end $x$$q$);
select harness.rodar('fase2', 'P7 colaborador tenta alocar', 'bloqueado', :'colab', 'authenticated',
  $q$select public.alocar_licenca('lic-1', 'emp-colab')$q$);
select harness.rodar('fase2', 'P8 suporte revoga assento', 'ok', :'sup', 'authenticated',
  $q$do $x$ declare v jsonb; begin perform public.alocar_licenca('lic-1', 'emp-colab'); v := public.revogar_licenca('lic-1', 'emp-colab');
    if v ? 'emp-colab' then raise exception 'não revogou'; end if; end $x$$q$);
select harness.rodar('fase2', 'P9 excluir colaborador com histórico é bloqueado', 'erro: restrito', :'admin', 'authenticated',
  $q$do $x$ begin delete from public.colaboradores where id = 'emp-colab';
    exception when foreign_key_violation then raise exception 'restrito'; end $x$$q$);
select harness.rodar('fase2', 'P10 excluir ativo com histórico é bloqueado', 'erro: restrito', :'admin', 'authenticated',
  $q$do $x$ begin delete from public.ativos where id = 'ast-1';
    exception when foreign_key_violation then raise exception 'restrito'; end $x$$q$);
select harness.rodar('fase2', 'P11 setor do ativo gravado', 'ok', :'sup', 'authenticated',
  $q$select harness.afeta($s$update public.ativos set setor_id = 'dep-1' where id = 'ast-1'$s$, 1)$q$);
select harness.rodar('fase2', 'P12 índices e FKs RESTRICT presentes', 'ok', null, null,
  $q$do $x$ begin
    perform harness.espera($s$select 1 from pg_indexes where schemaname = 'public' and indexname in ('idx_colaboradores_setor','idx_colaboradores_gestor','idx_ativos_custodiante','idx_ativos_setor','idx_custodia_ativo','idx_custodia_colaborador','idx_chamados_solicitante','idx_chamados_tecnico','idx_chamados_ativo','idx_chamados_software','idx_chamados_status_data','idx_mensagens_chamado','idx_mensagens_autor','idx_termos_colaborador')$s$, 14);
    perform harness.espera($s$select 1 from pg_constraint where contype = 'f' and confdeltype = 'r' and conrelid in
      ('public.historico_custodia'::regclass, 'public.chamados'::regclass, 'public.chamado_mensagens'::regclass, 'public.termos_responsabilidade'::regclass)
      and conname not like 'chamados_colaborador_id%'$s$, 5); end $x$$q$);
select harness.rodar('fase2', 'P13 valor negativo de licença recusado', 'erro: restrito', :'sup', 'authenticated',
  $q$do $x$ begin update public.licencas_software set valor_mensal = -1 where id = 'lic-1';
    exception when check_violation then raise exception 'restrito'; end $x$$q$);
