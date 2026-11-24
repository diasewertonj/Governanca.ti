-- ==============================================================================
-- Check geral · Financeiro e segurança
--
-- 1. configuracoes_empresa  anon lê só nome e logo; premissas e vida útil por função (T.I. e Compras)
-- 2. licencas / contratos   dados de pagamento só para o administrador (suporte vê nulo)
-- 3. faturas                Compras só paga (status, valor pago, data, comprovante)
-- 4. recebimentos           Compras só confirma o recebido; quem registra é a T.I.
-- 5. salvar_rateio          troca o rateio de uma origem numa transação só
-- 6. custos_area_gestor     (substitui custos_da_minha_area) aplica o rateio e inclui as faturas a pagar
-- 7. recorrente_resumo      custo recorrente sem dados de pagamento (para Compras)
--
-- ATENÇÃO: configuracoes_empresa, contratos e licencas_software passam a ter SELECT
-- por coluna. Coluna nova nessas tabelas precisa de GRANT SELECT (coluna) para
-- authenticated, ou "select *" deixa de funcionar.
-- Reexecutável: tudo é create or replace / do $$ com checagem.
-- ==============================================================================

-- 1) configuracoes_empresa ---------------------------------------------------------
do $$
declare v_cols text;
begin
  revoke select on public.configuracoes_empresa from anon, authenticated;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'configuracoes_empresa'
     and column_name not in ('premissas_financeiras', 'vida_util');
  execute format('grant select (%s) on public.configuracoes_empresa to authenticated', v_cols);
  -- Tela de login e de definir senha: só nome da empresa e logo
  grant select (id, razao_social, nome_fantasia, logo_url) on public.configuracoes_empresa to anon;
end $$;

create or replace function public.premissas_financeiras_ler()
returns table (premissas_financeiras jsonb, vida_util jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte', 'compras') then
    raise exception 'Sem acesso' using errcode = '42501';
  end if;
  return query select c.premissas_financeiras, c.vida_util from public.configuracoes_empresa c limit 1;
end;
$$;
revoke all on function public.premissas_financeiras_ler() from public, anon;
grant execute on function public.premissas_financeiras_ler() to authenticated;

-- 2) Dados de pagamento: só o administrador ------------------------------------------
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
  if v_papel = 'ti_admin' then
    return query select * from public.licencas_software order by nome;
    return;
  end if;
  if v_papel = 'ti_suporte' then
    -- O suporte vê o cadastro, mas não a forma de pagamento, o cartão nem o titular
    for r in select * from public.licencas_software order by nome loop
      r.forma_pagamento := null;
      r.cartao_final := null;
      r.pagamento_titular := null;
      return next r;
    end loop;
    return;
  end if;
  if v_papel is null or v_papel not in ('rh', 'colaborador', 'compras') then
    return;
  end if;
  for r in
    select * from public.licencas_software l
     where v_papel = 'rh' or coalesce(l.colaboradores_ids, '[]'::jsonb) ? v_eu
     order by l.nome
  loop
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
    if v_papel <> 'rh' then
      r.colaboradores_ids := jsonb_build_array(v_eu);
    end if;
    return next r;
  end loop;
end;
$$;
revoke all on function public.licencas_visiveis() from public, anon;
grant execute on function public.licencas_visiveis() to authenticated;

create or replace function public.contratos_visiveis()
returns setof public.contratos
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_papel text := public.meu_papel();
  r       public.contratos;
begin
  if v_papel = 'ti_admin' then
    return query select * from public.contratos order by inicio desc;
    return;
  end if;
  if v_papel = 'ti_suporte' then
    for r in select * from public.contratos order by inicio desc loop
      r.forma_pagamento := null;
      r.cartao_final := null;
      r.pagamento_titular := null;
      return next r;
    end loop;
  end if;
  return;
end;
$$;
revoke all on function public.contratos_visiveis() from public, anon;
grant execute on function public.contratos_visiveis() to authenticated;

-- A tabela direta não entrega as colunas de pagamento (a T.I. lê pelas funções acima)
do $$
declare
  t text;
  v_cols text;
begin
  foreach t in array array['licencas_software', 'contratos'] loop
    execute format('revoke select on public.%I from authenticated', t);
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
      from information_schema.columns
     where table_schema = 'public' and table_name = t
       and column_name not in ('forma_pagamento', 'cartao_final', 'pagamento_titular');
    execute format('grant select (%s) on public.%I to authenticated', v_cols, t);
  end loop;
end $$;

-- 3) Faturas: Compras só paga ---------------------------------------------------------
create or replace function public.faturas_compras_so_paga()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and public.meu_papel() = 'compras'
     and coalesce(current_setting('app.via_funcao', true), '') <> '1'
     and (new.valor is distinct from old.valor
          or new.vencimento is distinct from old.vencimento
          or new.competencia is distinct from old.competencia
          or new.contrato_id is distinct from old.contrato_id
          or new.licenca_id is distinct from old.licenca_id
          or new.fornecedor_id is distinct from old.fornecedor_id
          or new.pedido_id is distinct from old.pedido_id
          or new.descricao is distinct from old.descricao) then
    raise exception 'Compras registra o pagamento e anexa o comprovante; valor, vencimento e origem da fatura são da T.I.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.faturas_compras_so_paga() from public, anon, authenticated;
create or replace trigger trg_faturas_compras_so_paga
  before update on public.faturas
  for each row execute function public.faturas_compras_so_paga();

-- 4) Recebimentos: Compras só confirma o recebido ---------------------------------------
alter policy recebimentos_inserir on public.recebimentos
  with check (public.meu_papel() in ('ti_admin', 'ti_suporte'));

create or replace function public.recebimentos_compras_so_confirma()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.meu_papel() = 'compras' and coalesce(current_setting('app.via_funcao', true), '') <> '1' then
    if tg_op = 'INSERT' then
      raise exception 'Compras confirma o recebimento; o registro é feito pela T.I.' using errcode = '42501';
    end if;
    if (to_jsonb(new) - 'status' - 'recebido_em' - 'valor_recebido') is distinct from (to_jsonb(old) - 'status' - 'recebido_em' - 'valor_recebido')
       or new.status not in (old.status, 'recebido') then
      raise exception 'Compras só confirma o recebido (status, data e valor recebido)' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.recebimentos_compras_so_confirma() from public, anon, authenticated;
create or replace trigger trg_recebimentos_compras_so_confirma
  before insert or update on public.recebimentos
  for each row execute function public.recebimentos_compras_so_confirma();

-- 5) Rateio transacional ---------------------------------------------------------------
create or replace function public.salvar_rateio(p_origem_tipo text, p_origem_id text, p_linhas jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
begin
  if coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Sem permissão para ratear custos' using errcode = '42501';
  end if;
  if p_origem_tipo not in ('contrato', 'licenca', 'linha', 'fatura') then
    raise exception 'Origem de rateio inválida' using errcode = '23514';
  end if;
  if p_linhas is not null and jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'As áreas do rateio devem ser uma lista' using errcode = '23514';
  end if;
  -- Tudo numa transação: se uma área falhar (ex.: soma acima de 100%), o rateio antigo continua
  delete from public.rateios where origem_tipo = p_origem_tipo and origem_id = p_origem_id;
  for e in select * from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) loop
    insert into public.rateios (origem_tipo, origem_id, departamento_id, percentual, criado_por)
    values (p_origem_tipo, p_origem_id, e ->> 'departamento_id', (e ->> 'percentual')::numeric, public.meu_colaborador_id());
  end loop;
end;
$$;
revoke all on function public.salvar_rateio(text, text, jsonb) from public, anon;
grant execute on function public.salvar_rateio(text, text, jsonb) to authenticated;

-- 6) Custos da minha área: rateio + a pagar ----------------------------------------------
-- Função nova (o retorno ganha a_pagar; create or replace não troca o tipo de retorno e a migration
-- 20261201 precisa continuar reexecutável). A antiga fica sem uso.
create or replace function public.custos_area_gestor(p_ano integer)
returns table (area text, categoria text, previsto numeric, realizado numeric, a_pagar numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (
    select c.id, c.setor_id
      from public.colaboradores c
     where c.id = public.meu_colaborador_id()
       and c.setor_id is not null
       and exists (select 1 from public.colaboradores s
                    where s.gestor_id = c.id and s.id <> c.id and s.status <> 'desligado')
  ),
  dep as (
    select d.id, d.nome, lower(btrim(d.nome)) as chave
      from public.departamentos d join eu on eu.setor_id = d.id
  ),
  mapa as (
    select coalesce((select c.premissas_financeiras -> 'mapaAreas' from public.configuracoes_empresa c limit 1), '{}'::jsonb) as m
  ),
  orc as (
    select o.categoria::text as categoria, sum(o.valor_anual) as valor
      from public.orcamentos o, dep, mapa
     where o.ano = p_ano
       and (o.departamento_id = dep.id or lower(btrim(o.area)) = dep.chave
            or (o.departamento_id is null and mapa.m ->> lower(btrim(o.area)) = dep.id))
     group by 1
  ),
  -- Faturas do ano (não canceladas), com área de origem e o rateio que vale para cada uma
  fat as (
    select f.id,
           coalesce(f.categoria_despesa, ct.categoria_despesa, l.categoria_despesa, p.categoria, 'outros')::text as categoria,
           case when f.status = 'paga' then 'realizado' else 'a_pagar' end as situacao,
           case when f.status = 'paga' then coalesce(f.valor_pago, f.valor) else f.valor end as valor,
           coalesce(f.departamento_id, ct.departamento_id, l.departamento_id, p.departamento_id,
                    (select d2.id from public.departamentos d2
                      where lower(btrim(d2.nome)) = lower(btrim(coalesce(ct.centro_custo, l.centro_custo, p.area, ''))) limit 1),
                    (select mapa.m ->> lower(btrim(coalesce(ct.centro_custo, l.centro_custo, p.area, ''))) from mapa)) as dep_orig,
           case
             when exists (select 1 from public.rateios r where r.origem_tipo = 'fatura' and r.origem_id = f.id) then 'fatura'
             when f.contrato_id is not null and exists (select 1 from public.rateios r where r.origem_tipo = 'contrato' and r.origem_id = f.contrato_id) then 'contrato'
             when f.licenca_id is not null and exists (select 1 from public.rateios r where r.origem_tipo = 'licenca' and r.origem_id = f.licenca_id) then 'licenca'
           end as rt,
           case
             when exists (select 1 from public.rateios r where r.origem_tipo = 'fatura' and r.origem_id = f.id) then f.id
             when f.contrato_id is not null and exists (select 1 from public.rateios r where r.origem_tipo = 'contrato' and r.origem_id = f.contrato_id) then f.contrato_id
             when f.licenca_id is not null and exists (select 1 from public.rateios r where r.origem_tipo = 'licenca' and r.origem_id = f.licenca_id) then f.licenca_id
           end as rid
      from public.faturas f
      left join public.contratos ct on ct.id = f.contrato_id
      left join public.licencas_software l on l.id = f.licenca_id
      left join public.pedidos_compra p on p.id = f.pedido_id
     where f.status in ('a_pagar', 'paga')
       and extract(year from f.competencia) = p_ano
  ),
  aloc as (
    select s.categoria, s.situacao, r.departamento_id as dep_id, round(s.valor * r.percentual / 100, 2) as valor
      from fat s join public.rateios r on r.origem_tipo = s.rt and r.origem_id = s.rid
    union all
    -- O que o rateio não cobre fica na área de origem
    select s.categoria, s.situacao, s.dep_orig,
           s.valor - coalesce((select sum(round(s.valor * r.percentual / 100, 2)) from public.rateios r
                                where r.origem_tipo = s.rt and r.origem_id = s.rid), 0)
      from fat s
  ),
  minha as (
    select a.categoria, a.situacao, a.valor from aloc a join dep on dep.id = a.dep_id where a.valor > 0.004
  ),
  pago as (
    select m.categoria, sum(m.valor) filter (where m.situacao = 'realizado') as realizado,
           sum(m.valor) filter (where m.situacao = 'a_pagar') as a_pagar
      from minha m group by 1
  )
  select dep.nome, cats.categoria, coalesce(orc.valor, 0), coalesce(pago.realizado, 0), coalesce(pago.a_pagar, 0)
    from dep
    cross join (select categoria from orc union select categoria from pago) cats
    left join orc on orc.categoria = cats.categoria
    left join pago on pago.categoria = cats.categoria
$$;
revoke all on function public.custos_area_gestor(integer) from public, anon;
grant execute on function public.custos_area_gestor(integer) to authenticated;

-- 7) Custo recorrente sem dados de pagamento (Compras) ------------------------------------
-- "recorrente" = entra no custo mensal de hoje; as demais linhas servem para classificar faturas.
create or replace function public.recorrente_resumo()
returns table (
  origem text, id text, nome text, fornecedor_id text, tipo text, categoria_despesa text,
  centro_custo text, departamento_id text, mensal numeric, fim date, renova boolean,
  reajuste_mes integer, recorrente boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte', 'compras') then
    raise exception 'Sem acesso' using errcode = '42501';
  end if;
  return query
    select 'contrato'::text, c.id, coalesce(nullif(btrim(c.numero), ''), c.descricao)::text, c.fornecedor_id, c.tipo::text,
           c.categoria_despesa::text, c.centro_custo::text, c.departamento_id,
           (case c.periodicidade::text when 'anual' then c.valor::numeric / 12 when 'unico' then 0::numeric else c.valor::numeric end),
           c.fim::date, (c.fim is null or coalesce(c.renovacao_automatica, false)), c.reajuste_mes::integer,
           (c.status::text <> 'encerrado' and c.inicio <= current_date and (c.fim is null or c.fim >= current_date))
      from public.contratos c
    union all
    select 'licenca'::text, l.id, l.nome::text, l.fornecedor_id, null::text,
           l.categoria_despesa::text, l.centro_custo::text, l.departamento_id,
           (case when l.tipo_cobranca::text = 'anual' then l.valor_mensal::numeric / 12 else l.valor_mensal::numeric end),
           l.data_renovacao::date, coalesce(l.renovacao_automatica, true), null::integer,
           (l.status::text <> 'inativa' and l.forma_cobranca::text = 'propria')
      from public.licencas_software l
    union all
    select 'linha'::text, ln.id, ln.numero::text, null::text, null::text,
           'telefonia'::text, ln.centro_custo::text, ln.departamento_id,
           ln.valor_mensal::numeric, null::date, true, null::integer, true
      from public.linhas_telefonicas ln
     where ln.status::text = 'ativa' and ln.contrato_id is null and coalesce(ln.valor_mensal, 0) > 0;
end;
$$;
revoke all on function public.recorrente_resumo() from public, anon;
grant execute on function public.recorrente_resumo() to authenticated;

-- 8) Salvar premissas e vida útil (o upsert da tabela não alcança mais essas colunas) ------
create or replace function public.salvar_premissas_financeiras(p_premissas jsonb, p_vida_util jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.meu_papel(), '') <> 'ti_admin' then
    raise exception 'Só o administrador altera as premissas financeiras' using errcode = '42501';
  end if;
  update public.configuracoes_empresa
     set premissas_financeiras = coalesce(p_premissas, premissas_financeiras),
         vida_util = coalesce(p_vida_util, vida_util),
         updated_at = now()
   where id is not null;
end;
$$;
revoke all on function public.salvar_premissas_financeiras(jsonb, jsonb) from public, anon;
grant execute on function public.salvar_premissas_financeiras(jsonb, jsonb) to authenticated;

-- 9) salvar_contrato passa a rodar como dono: o upsert lê as colunas de pagamento, que a T.I. não
--    lê direto. O suporte salva o contrato sem apagar nem trocar o pagamento (ele não o vê).
create or replace function public.salvar_contrato(p_contrato jsonb, p_itens jsonb default '[]'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    text := nullif(p_contrato ->> 'id', '');
  v_itens jsonb := coalesce(p_itens, '[]'::jsonb);
  v_papel text := public.meu_papel();
begin
  if auth.uid() is not null and coalesce(v_papel, '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Apenas a T.I. cadastra contratos' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'Contrato sem identificador' using errcode = '23514';
  end if;

  insert into public.contratos (id, fornecedor_id, tipo, numero, descricao, inicio, fim, valor, periodicidade,
                                sla, contato_suporte, observacoes, detalhes, unidade_id, moeda, valor_moeda,
                                forma_pagamento, cartao_final, pagamento_titular, renovacao_automatica,
                                aviso_cancelamento_dias, reajuste_indice, reajuste_mes, multa_cancelamento,
                                responsavel_id, centro_custo, categoria_despesa)
  values (v_id, p_contrato ->> 'fornecedor_id', p_contrato ->> 'tipo', nullif(p_contrato ->> 'numero', ''),
          p_contrato ->> 'descricao', (p_contrato ->> 'inicio')::date, nullif(p_contrato ->> 'fim', '')::date,
          coalesce(nullif(p_contrato ->> 'valor', '')::numeric, 0),
          coalesce(nullif(p_contrato ->> 'periodicidade', ''), 'mensal'),
          nullif(p_contrato ->> 'sla', ''), nullif(p_contrato ->> 'contato_suporte', ''),
          nullif(p_contrato ->> 'observacoes', ''),
          coalesce(p_contrato -> 'detalhes', '{}'::jsonb), nullif(p_contrato ->> 'unidade_id', ''),
          coalesce(nullif(p_contrato ->> 'moeda', ''), 'BRL'), nullif(p_contrato ->> 'valor_moeda', '')::numeric,
          case when v_papel = 'ti_suporte' then null else nullif(p_contrato ->> 'forma_pagamento', '') end,
          case when v_papel = 'ti_suporte' then null else nullif(p_contrato ->> 'cartao_final', '') end,
          case when v_papel = 'ti_suporte' then null else nullif(p_contrato ->> 'pagamento_titular', '') end,
          coalesce(nullif(p_contrato ->> 'renovacao_automatica', '')::boolean, false),
          nullif(p_contrato ->> 'aviso_cancelamento_dias', '')::integer, nullif(p_contrato ->> 'reajuste_indice', ''),
          nullif(p_contrato ->> 'reajuste_mes', '')::integer, nullif(p_contrato ->> 'multa_cancelamento', ''),
          nullif(p_contrato ->> 'responsavel_id', ''), nullif(p_contrato ->> 'centro_custo', ''),
          nullif(p_contrato ->> 'categoria_despesa', ''))
  on conflict (id) do update
  set fornecedor_id = excluded.fornecedor_id, tipo = excluded.tipo, numero = excluded.numero,
      descricao = excluded.descricao, inicio = excluded.inicio, fim = excluded.fim, valor = excluded.valor,
      periodicidade = excluded.periodicidade, sla = excluded.sla, contato_suporte = excluded.contato_suporte,
      observacoes = excluded.observacoes, detalhes = excluded.detalhes, unidade_id = excluded.unidade_id,
      moeda = excluded.moeda, valor_moeda = excluded.valor_moeda,
      forma_pagamento = case when v_papel = 'ti_suporte' then public.contratos.forma_pagamento else excluded.forma_pagamento end,
      cartao_final = case when v_papel = 'ti_suporte' then public.contratos.cartao_final else excluded.cartao_final end,
      pagamento_titular = case when v_papel = 'ti_suporte' then public.contratos.pagamento_titular else excluded.pagamento_titular end,
      renovacao_automatica = excluded.renovacao_automatica, aviso_cancelamento_dias = excluded.aviso_cancelamento_dias,
      reajuste_indice = excluded.reajuste_indice, reajuste_mes = excluded.reajuste_mes,
      multa_cancelamento = excluded.multa_cancelamento, responsavel_id = excluded.responsavel_id,
      centro_custo = excluded.centro_custo, categoria_despesa = excluded.categoria_despesa;

  delete from public.contrato_itens ci
  where ci.contrato_id = v_id
    and not exists (select 1 from jsonb_array_elements(v_itens) e
                    where nullif(e ->> 'ativo_id', '') is not distinct from ci.ativo_id
                      and nullif(e ->> 'licenca_id', '') is not distinct from ci.licenca_id);

  insert into public.contrato_itens (contrato_id, ativo_id, licenca_id)
  select v_id, nullif(e ->> 'ativo_id', ''), nullif(e ->> 'licenca_id', '')
  from jsonb_array_elements(v_itens) e
  on conflict do nothing;
end;
$$;
revoke all on function public.salvar_contrato(jsonb, jsonb) from public, anon;
grant execute on function public.salvar_contrato(jsonb, jsonb) to authenticated;