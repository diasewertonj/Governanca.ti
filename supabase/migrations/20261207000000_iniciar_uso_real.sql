-- Seção 28 · Iniciar uso real (sem DROP de tabela ou coluna).
-- Substitui, em produção, a antiga "zerar base": prévia do que sai, confirmação pelo nome
-- da empresa e limpeza completa (inclui o que a limpeza antiga deixava: baixas patrimoniais
-- de teste, recebimentos, rateios e fechamentos de imobilizado). Os logins e os arquivos
-- de teste saem pela função do servidor "iniciar-uso-real" (a chave de serviço fica lá).
-- Fica: o admin que executa, dados da empresa, prazos, premissas, catálogo de processos,
-- departamentos e unidades (estes podem sair também, se pedido) e o histórico de alterações.

-- 1. A baixa patrimonial continua intocável, menos na virada para uso real ------------------
create or replace function public.proteger_registro_baixa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('app.uso_real', true), '') = 'sim' then
      return old;
    end if;
    raise exception 'O registro de baixa faz parte do histórico e não pode ser apagado' using errcode = '23514';
  end if;
  if coalesce(current_setting('app.operacao_baixa', true), '') <> 'sim' then
    raise exception 'A baixa só pode ser alterada pelo estorno' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_registro_baixa() from public, anon, authenticated;

-- 2. Prévia: o que sai e o que fica (só o administrador) -------------------------------------
create or replace function public.previa_uso_real()
returns table(grupo text, item text, quantidade bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.meu_papel(), '') <> 'ti_admin' then
    raise exception 'Apenas o administrador da T.I. inicia o uso real.' using errcode = '42501';
  end if;
  return query
    select 'sai', 'Colaboradores (menos você)', (select count(*) from public.colaboradores where id is distinct from public.meu_colaborador_id())
    union all select 'sai', 'Logins de acesso (menos o seu)', (select count(*) from public.colaboradores where auth_user_id is not null and id is distinct from public.meu_colaborador_id())
    union all select 'sai', 'Equipamentos', (select count(*) from public.ativos)
    union all select 'sai', 'Baixas patrimoniais', (select count(*) from public.ativo_baixas)
    union all select 'sai', 'Softwares e licenças', (select count(*) from public.licencas_software)
    union all select 'sai', 'Linhas telefônicas', (select count(*) from public.linhas_telefonicas)
    union all select 'sai', 'Acessórios em estoque', (select count(*) from public.estoque_itens)
    union all select 'sai', 'Fornecedores', (select count(*) from public.fornecedores)
    union all select 'sai', 'Contratos', (select count(*) from public.contratos)
    union all select 'sai', 'Faturas', (select count(*) from public.faturas)
    union all select 'sai', 'Recebimentos', (select count(*) from public.recebimentos)
    union all select 'sai', 'Rateios entre áreas', (select count(*) from public.rateios)
    union all select 'sai', 'Fechamentos de imobilizado', (select count(*) from public.imobilizado_fechamentos)
    union all select 'sai', 'Orçamento (linhas)', (select count(*) from public.orcamentos)
    union all select 'sai', 'Pedidos de compra', (select count(*) from public.pedidos_compra)
    union all select 'sai', 'Chamados e processos', (select count(*) from public.chamados)
    union all select 'sai', 'Termos de responsabilidade', (select count(*) from public.termos_responsabilidade)
    union all select 'sai', 'Conferências de inventário', (select count(*) from public.inventarios_fisicos)
    union all select 'sai', 'Lembretes', (select count(*) from public.lembretes)
    union all select 'opcional', 'Departamentos', (select count(*) from public.departamentos)
    union all select 'opcional', 'Unidades', (select count(*) from public.unidades)
    union all select 'fica', 'Catálogo de processos (admissão e desligamento)', (select count(*) from public.catalogo_itens)
    union all select 'fica', 'Histórico de alterações', (select count(*) from public.cadastro_eventos);
end;
$$;
revoke all on function public.previa_uso_real() from public, anon;
grant execute on function public.previa_uso_real() to authenticated;

-- 3. A virada --------------------------------------------------------------------------------
-- Confirmação: o nome da empresa (fantasia ou razão social, sem diferença de maiúsculas).
-- Devolve os logins (auth.users) das pessoas que saíram, para a função do servidor remover.
create or replace function public.iniciar_uso_real(p_confirmacao text, p_apagar_estrutura boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eu     text := public.meu_colaborador_id();
  v_nomes  text[];
  v_logins text[];
  v_antes  jsonb;
begin
  if coalesce(public.meu_papel(), '') <> 'ti_admin' or v_eu is null then
    raise exception 'Apenas o administrador da T.I. inicia o uso real.' using errcode = '42501';
  end if;
  select array_remove(array[lower(btrim(coalesce(e.nome_fantasia, ''))), lower(btrim(coalesce(e.razao_social, '')))], '')
    into v_nomes from public.configuracoes_empresa e limit 1;
  if coalesce(array_length(v_nomes, 1), 0) = 0 then
    raise exception 'Preencha o nome da empresa em Configurações antes de iniciar o uso real.' using errcode = '23514';
  end if;
  if lower(btrim(coalesce(p_confirmacao, ''))) <> all (v_nomes) then
    raise exception 'Confirmação inválida: digite o nome da empresa como está em Configurações.' using errcode = '23514';
  end if;

  select coalesce(jsonb_object_agg(x.item, x.quantidade), '{}'::jsonb) into v_antes from public.previa_uso_real() x where x.grupo <> 'fica';
  select coalesce(array_agg(c.auth_user_id::text), '{}') into v_logins
    from public.colaboradores c where c.auth_user_id is not null and c.id is distinct from v_eu;

  -- O que a limpeza antiga deixava para trás
  perform set_config('app.uso_real', 'sim', true);
  delete from public.ativo_baixas where true;
  delete from public.recebimentos where true;
  delete from public.rateios where true;
  delete from public.imobilizado_fechamentos where true;
  perform set_config('app.uso_real', '', true);

  -- O resto, pela limpeza já testada (mantém o admin que executa)
  perform public.limpar_base('APAGAR TUDO', null);

  if p_apagar_estrutura then
    update public.colaboradores set setor_id = null where id = v_eu;
    delete from public.departamentos where true;
    delete from public.unidades where true;
  end if;

  insert into public.cadastro_eventos (entidade, registro, acao, antes, depois, por)
  values ('sistema', 'uso_real', 'alterado', v_antes,
          jsonb_build_object('iniciado_em', now(), 'estrutura_apagada', p_apagar_estrutura), v_eu);

  return jsonb_build_object('logins', to_jsonb(v_logins));
end;
$$;
revoke all on function public.iniciar_uso_real(text, boolean) from public, anon;
grant execute on function public.iniciar_uso_real(text, boolean) to authenticated;
