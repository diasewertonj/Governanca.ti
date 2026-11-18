-- Segurança e integridade (revisão de 17/11/2026, seção 10.1/10.2 da documentação)
-- Sem DROP de tabela, coluna ou política: só ALTER POLICY, funções novas e gatilhos novos.
--
-- 1. licencas_software: a tabela completa (valores, pagamento, final do cartão, titular,
--    centro de custo) passa a ser lida só pela T.I. RH e colaborador leem por
--    licencas_visiveis(): nome, fabricante e fornecedor; o colaborador só as dele.
-- 2. ativos: a tabela completa (dados fiscais, valor de compra, fornecedor) passa a ser
--    lida só pela T.I. RH e colaborador leem por ativos_visiveis(), sem fiscal,
--    fornecedor e observações; o colaborador só os que estão com ele.
-- 3. estoque_movimentos: ninguém exclui (o saldo é calculado pelos movimentos).
-- 4. Linha telefônica e acessório com histórico não podem ser excluídos
--    (o "on delete cascade" apagaria o histórico junto).

-- 1 e 2. Leitura das tabelas completas só pela T.I. -------------------------------------
alter policy licenca_ler on public.licencas_software
  using (public.meu_papel() in ('ti_admin', 'ti_suporte'));

alter policy ativo_ler on public.ativos
  using (public.meu_papel() in ('ti_admin', 'ti_suporte'));

-- Leitura por perfil (mesmas colunas da tabela, com os campos sensíveis vazios) -----------
create or replace function public.licencas_visiveis()
returns setof public.licencas_software
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_papel text := public.meu_papel();
  v_eu    text := public.meu_colaborador_id();
  r       public.licencas_software;
begin
  if v_papel in ('ti_admin', 'ti_suporte') then
    return query select * from public.licencas_software order by nome;
    return;
  end if;
  if v_papel is null or v_papel not in ('rh', 'colaborador') then
    return;
  end if;
  for r in
    select * from public.licencas_software l
     where v_papel = 'rh' or coalesce(l.colaboradores_ids, '[]'::jsonb) ? v_eu
     order by l.nome
  loop
    -- fornecedor do cadastro (nome), sem os dados de cobrança
    r.fornecedor := coalesce((select f.nome from public.fornecedores f where f.id = r.fornecedor_id), r.fornecedor);
    r.valor_mensal := 0;
    r.valor_moeda := null;
    r.forma_pagamento := null;
    r.cartao_final := null;
    r.pagamento_titular := null;
    r.centro_custo := null;
    r.responsavel_id := null;
    r.url_painel := null;
    r.observacoes := null;
    r.aviso_cancelamento_dias := null;
    r.inativacao_motivo := null;
    if v_papel = 'colaborador' then
      r.colaboradores_ids := jsonb_build_array(v_eu);
    end if;
    return next r;
  end loop;
end;
$$;
revoke all on function public.licencas_visiveis() from public, anon;
grant execute on function public.licencas_visiveis() to authenticated;

create or replace function public.ativos_visiveis()
returns setof public.ativos
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_papel text := public.meu_papel();
  v_eu    text := public.meu_colaborador_id();
  r       public.ativos;
begin
  if v_papel in ('ti_admin', 'ti_suporte') then
    return query select * from public.ativos order by tag;
    return;
  end if;
  if v_papel is null or v_papel not in ('rh', 'colaborador') then
    return;
  end if;
  for r in
    select * from public.ativos a
     where v_papel = 'rh' or a.custodiante_id = v_eu
     order by a.tag
  loop
    r.fiscal := '{}'::jsonb;
    r.fornecedor_id := null;
    r.observacoes := null;
    return next r;
  end loop;
end;
$$;
revoke all on function public.ativos_visiveis() from public, anon;
grant execute on function public.ativos_visiveis() to authenticated;

-- 3. Movimento de estoque não se exclui -----------------------------------------------------
alter policy estoque_movimentos_excluir on public.estoque_movimentos using (false);

-- 4. Exclusão com histórico bloqueada no banco ----------------------------------------------
create or replace function public.proteger_exclusao_com_historico()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'linhas_telefonicas'
     and exists (select 1 from public.linha_atribuicoes where linha_id = old.id) then
    raise exception 'A linha tem histórico de uso: cancele em vez de excluir.';
  end if;
  if tg_table_name = 'estoque_itens'
     and exists (select 1 from public.estoque_movimentos where item_id = old.id) then
    raise exception 'O acessório tem movimentos no histórico: desative em vez de excluir.';
  end if;
  return old;
end;
$$;

create or replace trigger trg_linha_proteger_exclusao
  before delete on public.linhas_telefonicas
  for each row execute function public.proteger_exclusao_com_historico();
create or replace trigger trg_estoque_proteger_exclusao
  before delete on public.estoque_itens
  for each row execute function public.proteger_exclusao_com_historico();
