-- Seção 27 · "Custos da minha área" (gestor) no mesmo critério oficial de área do sistema:
-- rateio quando existe; senão, o departamento da fatura ou da origem (contrato, licença,
-- pedido e, agora, a linha telefônica das faturas automáticas da seção 26). Sem DROP.
create or replace function public.custos_area_gestor(p_ano integer)
returns table(area text, categoria text, previsto numeric, realizado numeric, a_pagar numeric)
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
           coalesce(f.categoria_despesa, ct.categoria_despesa, l.categoria_despesa, p.categoria,
                    case when f.linha_id is not null then 'telefonia' end, 'outros')::text as categoria,
           case when f.status = 'paga' then 'realizado' else 'a_pagar' end as situacao,
           case when f.status = 'paga' then coalesce(f.valor_pago, f.valor) else f.valor end as valor,
           coalesce(f.departamento_id, ct.departamento_id, l.departamento_id, p.departamento_id, li.departamento_id,
                    (select d2.id from public.departamentos d2
                      where lower(btrim(d2.nome)) = lower(btrim(coalesce(ct.centro_custo, l.centro_custo, p.area, li.centro_custo, ''))) limit 1),
                    (select mapa.m ->> lower(btrim(coalesce(ct.centro_custo, l.centro_custo, p.area, li.centro_custo, ''))) from mapa)) as dep_orig,
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
      left join public.linhas_telefonicas li on li.id = f.linha_id
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
