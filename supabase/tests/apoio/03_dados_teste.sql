\set ON_ERROR_STOP 1
-- Função padrão do Supabase que existe em produção (para testar o revoke)
create or replace function public.rls_auto_enable() returns event_trigger language plpgsql security definer as $$ begin end $$;

insert into public.colaboradores (id, matricula, nome, email, cargo, setor_id, status, role, data_admissao) values
  ('emp-rh',    'M5', 'RH',    'rh@x.test',    'RH', 'dep-1', 'ativo', 'rh', '2026-01-01'),
  ('emp-outro', 'M6', 'Outro', 'outro@x.test', 'Analista', 'dep-1', 'ativo', 'colaborador', '2026-01-01');

-- Contas de Auth criadas ANTES da Fase 1 (testa o backfill). outro@x.test fica sem conta.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'ADMIN@x.test'),
  ('00000000-0000-0000-0000-000000000002', 'colab@x.test'),
  ('00000000-0000-0000-0000-000000000003', 'sup@x.test'),
  ('00000000-0000-0000-0000-000000000004', 'ex@x.test'),
  ('00000000-0000-0000-0000-000000000005', 'rh@x.test'),
  ('00000000-0000-0000-0000-000000000006', 'semperfil@x.test');

insert into public.ativos (id, tag, nome, categoria, marca, modelo, serial_number, status, localizacao_fisica, custodiante_id, bitlocker_key) values
  ('ast-1', '#P1', 'Notebook colab', 'hardware', 'M', 'X', 'SN1', 'em_uso', 'casa', 'emp-colab', 'BL-SECRETA-1'),
  ('ast-2', '#P2', 'Notebook outro', 'hardware', 'M', 'X', 'SN2', 'em_uso', 'casa', 'emp-outro', null);
insert into public.historico_custodia (id, ativo_id, colaborador_id, colaborador_nome, data_entrega) values
  ('h-1', 'ast-1', 'emp-colab', 'Colab', '2026-01-01'),
  ('h-2', 'ast-2', 'emp-outro', 'Outro', '2026-01-01');
insert into public.licencas_software (id, nome, fornecedor, chave_contrato, data_renovacao) values
  ('lic-1', 'Office', 'MS', 'CHAVE-SECRETA', '2027-01-01');
insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id,
  solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome, data_atualizacao) values
  ('tkt-2', '#CH-2', 't', 'd', 'suporte', 'c', 'media', 'aberto', 'emp-outro', 'Outro', 'outro@x.test', 'A', 'TI', '2026-01-01'),
  ('tkt-3', '#CH-3', 't', 'd', 'onboarding', 'c', 'alta', 'aberto', 'emp-rh', 'RH', 'rh@x.test', 'RH', 'RH', '2026-01-01');
update public.chamados set data_atualizacao = '2026-01-01' where id = 'tkt-1';
insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_papel, texto, eh_nota_interna) values
  ('m-1', 'tkt-1', 'emp-colab', 'Colab', 'colaborador', 'pública', false),
  ('m-2', 'tkt-1', 'emp-sup', 'Sup', 'ti_suporte', 'interna', true);
insert into public.termos_responsabilidade (id, codigo, tipo, colaborador_id, colaborador_nome, colaborador_matricula,
  colaborador_cargo, colaborador_setor_nome, status_assinatura, responsavel_ti_id, responsavel_ti_nome) values
  ('tr-1', '#TR-1', 'entrega', 'emp-colab', 'Colab', 'M2', 'A', 'TI', 'gerado', 'emp-sup', 'Sup'),
  ('tr-2', '#TR-2', 'entrega', 'emp-outro', 'Outro', 'M6', 'A', 'TI', 'gerado', 'emp-sup', 'Sup');

create function harness.espera(p_sql text, p_n bigint) returns void language plpgsql as $f$
declare v bigint;
begin
  execute 'select count(*) from (' || p_sql || ') s' into v;
  if v <> p_n then raise exception 'esperava % linha(s), obteve %', p_n, v; end if;
end $f$;
create function harness.afeta(p_sql text, p_n bigint) returns void language plpgsql as $f$
declare v bigint;
begin
  execute p_sql;
  get diagnostics v = row_count;
  if v <> p_n then raise exception 'esperava afetar % linha(s), afetou %', p_n, v; end if;
end $f$;
grant execute on all functions in schema harness to anon, authenticated, service_role;
