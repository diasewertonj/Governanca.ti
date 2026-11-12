\set ON_ERROR_STOP 1
-- Reproduz o banco real: policies "Leitura X"/"Gravacao X" sem TO (roles = {public})
-- e os grants padrão do Supabase para anon/authenticated.
do $$
declare p record; t text;
begin
  for p in select tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
  foreach t in array array['departamentos','colaboradores','ativos','historico_custodia','licencas_software',
                           'chamados','chamado_mensagens','termos_responsabilidade','configuracoes_empresa'] loop
    execute format('create policy %I on public.%I for select using (true)', 'Leitura ' || t, t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', 'Gravacao ' || t, t);
  end loop;
end $$;
grant select, insert, update, delete, truncate on all tables in schema public to anon, authenticated, service_role;

insert into public.departamentos (id, nome, codigo) values ('dep-1', 'TI', 'TI');
insert into public.colaboradores (id, matricula, nome, email, cargo, setor_id, status, role, data_admissao) values
  ('emp-admin', 'M1', 'Admin', 'admin@x.test', 'Admin', 'dep-1', 'ativo', 'ti_admin', '2026-01-01'),
  ('emp-colab', 'M2', 'Colab', 'colab@x.test', 'Analista', 'dep-1', 'ativo', 'colaborador', '2026-01-01'),
  ('emp-sup',   'M3', 'Sup',   'sup@x.test',   'Suporte', 'dep-1', 'ativo', 'ti_suporte', '2026-01-01'),
  ('emp-ex',    'M4', 'Ex',    'ex@x.test',    'Ex-admin', 'dep-1', 'desligado', 'ti_admin', '2026-01-01');
insert into public.configuracoes_empresa (razao_social, nome_fantasia, cnpj, endereco, cidade_uf, cep, email_ti, telefone_ti,
  texto_termo_entrega, texto_termo_devolucao) values ('Empresa Teste', 'Teste', '00', 'Rua', 'SP', '0', 'ti@x', '0', 'a', 'b');
insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id,
  solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome)
  values ('tkt-1', '#CH-1', 't', 'd', 'suporte', 'c', 'media', 'aberto', 'emp-colab', 'Colab', 'colab@x.test', 'Analista', 'TI');

create schema harness;
create table harness.resultado (ordem serial, fase text, teste text, esperado text, obtido text);
grant usage on schema harness to anon, authenticated, service_role;
grant all on harness.resultado to anon, authenticated, service_role;
grant usage on sequence harness.resultado_ordem_seq to anon, authenticated, service_role;

create function harness.rodar(p_fase text, p_teste text, p_esperado text, p_claims text, p_role text, p_sql text)
returns void language plpgsql as $f$
declare v_obtido text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  if p_role is not null then execute format('set local role %I', p_role); end if;
  begin
    execute p_sql;
    raise exception '__desfaz__';  -- desfaz os efeitos do teste, mantendo o banco igual para o próximo
  exception when insufficient_privilege then v_obtido := 'bloqueado';
            when others then
              v_obtido := case when sqlerrm = '__desfaz__' then 'ok' else 'erro: ' || sqlerrm end;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into harness.resultado (fase, teste, esperado, obtido) values (p_fase, p_teste, p_esperado, v_obtido);
end $f$;
