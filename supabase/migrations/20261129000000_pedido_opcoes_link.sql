-- ==============================================================================
-- PEDIDO DE COMPRA: LINK, VALOR E MARCA; OPÇÕES POR ITEM (seção 14 da documentação)
-- ------------------------------------------------------------------------------
-- Reexecutável e sem DROP de tabela ou coluna. Troca o índice de "uma vencedora por
-- pedido" por "uma escolhida por item" e libera o fornecedor da opção (loja sem cadastro).
--
-- 1. pedido_itens: link, valor de referência (de quem pediu), imagem
-- 2. pedido_cotacoes vira "opções": por item (item_id), link, loja, marca, modelo,
--    descrição, imagem; sem limite de 3 (até 10 por item); nenhuma é obrigatória
-- 3. Histórico de alteração dos campos do item (pedido_eventos.campo)
-- 4. solicitar_compra aceita link/valor/marca/modelo e opções por item
-- 5. pedidos_visiveis devolve link/marca/modelo e as opções de quem pediu
--    (valor só para quem pediu); valor de referência só para quem pediu
-- 6. Aprovar exige a opção escolhida em cada item que tem opções e copia
--    marca/modelo/link/valor da escolhida para o item
-- 7. Compra: motivo só se o fornecedor não for o de nenhuma opção escolhida
-- 8. Recebimento: cria o acessório no estoque quando o item não estava ligado a um
-- ==============================================================================

-- 1 -------------------------------------------------------------------------------------------
alter table public.pedido_itens
  add column if not exists link             text,
  add column if not exists valor_referencia numeric(14,2),
  add column if not exists imagem_url       text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_pedido_item_link') then
    alter table public.pedido_itens add constraint chk_pedido_item_link
      check ((link is null or link ~* '^https?://') and (imagem_url is null or imagem_url ~* '^https://')
             and (valor_referencia is null or valor_referencia >= 0));
  end if;
end $$;

-- 2 -------------------------------------------------------------------------------------------
alter table public.pedido_cotacoes
  add column if not exists item_id    text references public.pedido_itens (id) on delete cascade,
  add column if not exists link       text,
  add column if not exists loja       text,
  add column if not exists marca      text,
  add column if not exists modelo     text,
  add column if not exists descricao  text,
  add column if not exists imagem_url text;
alter table public.pedido_cotacoes alter column fornecedor_id drop not null;
create index if not exists idx_pedido_cotacoes_item on public.pedido_cotacoes (item_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_pedido_opcao') then
    alter table public.pedido_cotacoes add constraint chk_pedido_opcao
      check ((fornecedor_id is not null or nullif(btrim(coalesce(loja, '')), '') is not null or link is not null)
             and (link is null or link ~* '^https?://') and (imagem_url is null or imagem_url ~* '^https://'));
  end if;
end $$;
drop index if exists public.uq_pedido_cotacao_vencedora;
create unique index if not exists uq_pedido_opcao_escolhida on public.pedido_cotacoes (pedido_id, coalesce(item_id, '')) where vencedora;

-- Itens e opções só mudam com o pedido em aberto; até 10 opções por item
create or replace function public.proteger_detalhe_pedido()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pedido text := case when tg_op = 'DELETE' then old.pedido_id else new.pedido_id end;
  v_status text;
begin
  if coalesce(current_setting('app.operacao_pedido', true), '') = 'sim' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select status into v_status from public.pedidos_compra where id = v_pedido;
  if v_status is not null and v_status not in ('rascunho', 'em_cotacao', 'aguardando', 'recusado') then
    raise exception 'O pedido não pode mais ser alterado (situação: %)', v_status using errcode = '23514';
  end if;
  -- (if separado: em pedido_itens o registro não tem item_id)
  if tg_table_name = 'pedido_cotacoes' and tg_op = 'INSERT' then
    if (select count(*) from public.pedido_cotacoes
         where pedido_id = new.pedido_id and coalesce(item_id, '') = coalesce(to_jsonb(new) ->> 'item_id', '')) >= 10 then
      raise exception 'Cada item tem no máximo 10 opções' using errcode = '23514';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.proteger_detalhe_pedido() from public, anon, authenticated;

-- 3 -------------------------------------------------------------------------------------------
alter table public.pedido_eventos add column if not exists campo text;

create or replace function public.registrar_alteracao_item_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_mud    text[] := '{}';
begin
  if coalesce(current_setting('app.operacao_pedido', true), '') = 'sim' then
    return new;
  end if;
  if new.descricao is distinct from old.descricao then v_mud := v_mud || ('Descrição: ' || coalesce(old.descricao, '—') || ' → ' || coalesce(new.descricao, '—')); end if;
  if new.marca is distinct from old.marca then v_mud := v_mud || ('Marca: ' || coalesce(old.marca, '—') || ' → ' || coalesce(new.marca, '—')); end if;
  if new.modelo is distinct from old.modelo then v_mud := v_mud || ('Modelo: ' || coalesce(old.modelo, '—') || ' → ' || coalesce(new.modelo, '—')); end if;
  if new.link is distinct from old.link then v_mud := v_mud || 'Link alterado'::text; end if;
  if new.quantidade is distinct from old.quantidade then v_mud := v_mud || ('Quantidade: ' || old.quantidade || ' → ' || new.quantidade); end if;
  if array_length(v_mud, 1) is null then
    return new;
  end if;
  select status into v_status from public.pedidos_compra where id = new.pedido_id;
  insert into public.pedido_eventos (pedido_id, de, para, motivo, por, campo)
  values (new.pedido_id, v_status, v_status, new.descricao || ': ' || array_to_string(v_mud, '; '), public.meu_colaborador_id(), 'item');
  return new;
end;
$$;
revoke all on function public.registrar_alteracao_item_pedido() from public, anon, authenticated;
create or replace trigger trg_pedido_itens_historico
  after update on public.pedido_itens
  for each row execute function public.registrar_alteracao_item_pedido();

-- 4 -------------------------------------------------------------------------------------------
create or replace function public.solicitar_compra(p_pedido jsonb, p_itens jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   text := gen_random_uuid()::text;
  v_tipo text := coalesce(nullif(p_pedido ->> 'tipo_pedido', ''), 'ti');
  v_item jsonb;
  v_op   jsonb;
  v_item_id text;
  v_n    integer := 0;
begin
  if not public.pode_pedir_compra() then
    raise exception 'Você não pode pedir compras.' using errcode = '42501';
  end if;
  if v_tipo not in ('ti', 'outros') then
    raise exception 'Tipo de pedido inválido' using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_pedido ->> 'titulo', ''))) < 3 then
    raise exception 'Diga o que precisa ser comprado' using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_pedido ->> 'justificativa', ''))) < 5 then
    raise exception 'Explique para que é a compra' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_itens, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Inclua pelo menos um item' using errcode = '23514';
  end if;

  perform set_config('app.operacao_pedido', 'sim', true);
  insert into public.pedidos_compra (id, titulo, justificativa, categoria, area, status, tipo_pedido, solicitante_id,
                                     colaborador_destino_id, chamado_id, processo_item_id, necessario_em)
  values (v_id, btrim(p_pedido ->> 'titulo'), btrim(p_pedido ->> 'justificativa'),
          coalesce(nullif(p_pedido ->> 'categoria', ''), case when v_tipo = 'ti' then 'hardware' else 'outros' end),
          btrim(coalesce(p_pedido ->> 'area', '')),
          case when v_tipo = 'ti' then 'em_cotacao' else 'aguardando' end, v_tipo, public.meu_colaborador_id(),
          nullif(p_pedido ->> 'colaborador_destino_id', ''), nullif(p_pedido ->> 'chamado_id', ''),
          nullif(p_pedido ->> 'processo_item_id', ''), nullif(p_pedido ->> 'necessario_em', '')::date);
  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_n := v_n + 1;
    insert into public.pedido_itens (pedido_id, tipo, descricao, categoria_ativo, especificacao, quantidade, ordem,
                                     marca, modelo, link, valor_referencia, imagem_url)
    values (v_id, case when v_tipo = 'ti' then coalesce(nullif(v_item ->> 'tipo', ''), 'equipamento') else 'servico' end,
            btrim(coalesce(v_item ->> 'descricao', '')),
            case when v_tipo = 'ti' then nullif(v_item ->> 'categoria_ativo', '') end,
            nullif(btrim(coalesce(v_item ->> 'especificacao', '')), ''),
            coalesce(nullif(v_item ->> 'quantidade', '')::integer, 1), v_n,
            nullif(btrim(coalesce(v_item ->> 'marca', '')), ''), nullif(btrim(coalesce(v_item ->> 'modelo', '')), ''),
            nullif(btrim(coalesce(v_item ->> 'link', '')), ''), nullif(v_item ->> 'valor_referencia', '')::numeric,
            nullif(btrim(coalesce(v_item ->> 'imagem_url', '')), ''))
    returning id into v_item_id;
    -- Opções (links) que quem pede já encontrou
    for v_op in select value from jsonb_array_elements(coalesce(v_item -> 'opcoes', '[]'::jsonb)) loop
      insert into public.pedido_cotacoes (pedido_id, item_id, link, loja, marca, modelo, descricao, valor, observacoes, imagem_url)
      values (v_id, v_item_id, nullif(btrim(coalesce(v_op ->> 'link', '')), ''), nullif(btrim(coalesce(v_op ->> 'loja', '')), ''),
              nullif(btrim(coalesce(v_op ->> 'marca', '')), ''), nullif(btrim(coalesce(v_op ->> 'modelo', '')), ''),
              nullif(btrim(coalesce(v_op ->> 'descricao', '')), ''), coalesce(nullif(v_op ->> 'valor', '')::numeric, 0),
              nullif(btrim(coalesce(v_op ->> 'observacoes', '')), ''), nullif(btrim(coalesce(v_op ->> 'imagem_url', '')), ''));
    end loop;
  end loop;
  perform set_config('app.operacao_pedido', '', true);
  return v_id;
end;
$$;
revoke all on function public.solicitar_compra(jsonb, jsonb) from public, anon;
grant execute on function public.solicitar_compra(jsonb, jsonb) to authenticated;

-- 5 -------------------------------------------------------------------------------------------
create or replace function public.pedidos_visiveis()
returns table (
  id text, codigo text, titulo text, justificativa text, categoria text, area text, status text, tipo_pedido text,
  solicitante_id text, solicitante_nome text, gestor_id text, gestor_nome text, aprovado_gestor_por text, aprovado_gestor_em timestamptz,
  colaborador_destino_id text, destino_nome text, chamado_id text, processo_item_id text,
  necessario_em date, motivo text, criado_em timestamptz, atualizado_em timestamptz, itens jsonb, eventos jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.codigo, p.titulo, p.justificativa, p.categoria, p.area, p.status, p.tipo_pedido,
         p.solicitante_id, s.nome, p.gestor_id, g.nome, p.aprovado_gestor_por, p.aprovado_gestor_em,
         p.colaborador_destino_id, d.nome, p.chamado_id, p.processo_item_id,
         p.necessario_em, p.motivo, p.criado_em, p.atualizado_em,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', i.id, 'tipo', i.tipo, 'descricao', i.descricao, 'categoria_ativo', i.categoria_ativo,
                     'especificacao', i.especificacao, 'quantidade', i.quantidade, 'marca', i.marca, 'modelo', i.modelo,
                     'link', i.link, 'imagem_url', i.imagem_url,
                     -- Valor: só o que a própria pessoa informou
                     'valor_referencia', case when p.solicitante_id = public.meu_colaborador_id() then i.valor_referencia end,
                     'opcoes', coalesce((select jsonb_agg(jsonb_build_object(
                                 'id', o.id, 'item_id', o.item_id, 'link', o.link, 'loja', o.loja, 'marca', o.marca,
                                 'modelo', o.modelo, 'descricao', o.descricao, 'imagem_url', o.imagem_url, 'vencedora', o.vencedora,
                                 'valor', case when o.criado_por = public.meu_colaborador_id() then o.valor end) order by o.criado_em)
                                from public.pedido_cotacoes o
                               where o.item_id = i.id and (o.criado_por = p.solicitante_id or o.vencedora)), '[]'::jsonb))
                     order by i.ordem)
                     from public.pedido_itens i where i.pedido_id = p.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('de', e.de, 'para', e.para, 'motivo', e.motivo, 'por', e.por, 'campo', e.campo,
                                                       'por_nome', (select c.nome from public.colaboradores c where c.id = e.por), 'em', e.em) order by e.em)
                     from public.pedido_eventos e where e.pedido_id = p.id), '[]'::jsonb)
    from public.pedidos_compra p
    left join public.colaboradores s on s.id = p.solicitante_id
    left join public.colaboradores g on g.id = p.gestor_id
    left join public.colaboradores d on d.id = p.colaborador_destino_id
   where public.posso_ver_pedido(p.id)
   order by p.criado_em desc;
$$;
revoke all on function public.pedidos_visiveis() from public, anon;
grant execute on function public.pedidos_visiveis() to authenticated;

-- 6 -------------------------------------------------------------------------------------------
create or replace function public.mudar_status_pedido(p_pedido text, p_acao text, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p       public.pedidos_compra%rowtype;
  v_papel   text := coalesce(public.meu_papel(), '');
  v_eu      text := public.meu_colaborador_id();
  v_ti      boolean := v_papel in ('ti_admin', 'ti_suporte');
  v_compras boolean := v_papel = 'compras';
  v_aprova  boolean := v_papel in ('ti_admin', 'compras');
  v_para    text;
  v_forn    text;
  v_sem     text;
  v_vez_gestor boolean;
begin
  select * into v_p from public.pedidos_compra where id = p_pedido for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = '23514';
  end if;
  v_vez_gestor := v_p.status = 'aguardando' and v_p.gestor_id is not null and v_p.aprovado_gestor_em is null;
  if not (v_ti or v_compras or v_p.solicitante_id = v_eu or (v_p.gestor_id = v_eu and v_eu is not null)) then
    raise exception 'Você não pode mexer neste pedido' using errcode = '42501';
  end if;

  if p_acao = 'enviar' then
    if v_p.status not in ('rascunho', 'em_cotacao', 'recusado') then
      raise exception 'Este pedido não está em rascunho, cotação ou recusado' using errcode = '23514';
    end if;
    if v_p.status = 'em_cotacao' and not (v_ti or v_compras) then
      raise exception 'A T.I. está cotando este pedido' using errcode = '42501';
    end if;
    if not exists (select 1 from public.pedido_itens where pedido_id = p_pedido) then
      raise exception 'Inclua pelo menos um item antes de enviar' using errcode = '23514';
    end if;
    v_para := case when not (v_ti or v_compras) and v_p.tipo_pedido = 'ti' then 'em_cotacao' else 'aguardando' end;
  elsif p_acao = 'devolver' then
    if not (v_ti or v_compras) or v_p.status <> 'em_cotacao' then
      raise exception 'Só a T.I. devolve um pedido em cotação' using errcode = '42501';
    end if;
    if length(btrim(coalesce(p_motivo, ''))) < 5 then
      raise exception 'Explique por que o pedido foi devolvido' using errcode = '23514';
    end if;
    v_para := 'recusado';
  elsif p_acao in ('aprovar', 'recusar') then
    if v_p.status <> 'aguardando' then
      raise exception 'O pedido % não está aguardando aprovação', v_p.codigo using errcode = '23514';
    end if;
    if v_vez_gestor and v_p.gestor_id is distinct from v_eu then
      raise exception 'Falta a aprovação do gestor de quem pediu' using errcode = '42501';
    end if;
    if not v_vez_gestor and not v_aprova then
      raise exception 'Só Compras ou o administrador da T.I. aprova ou recusa pedidos de compra' using errcode = '42501';
    end if;
    if p_acao = 'recusar' then
      if length(btrim(coalesce(p_motivo, ''))) < 5 then
        raise exception 'Explique por que o pedido foi recusado' using errcode = '23514';
      end if;
      v_para := 'recusado';
    elsif v_vez_gestor then
      perform set_config('app.operacao_pedido', 'sim', true);
      update public.pedidos_compra set aprovado_gestor_por = v_eu, aprovado_gestor_em = now() where id = p_pedido;
      insert into public.pedido_eventos (pedido_id, de, para, motivo, por)
      values (p_pedido, 'aguardando', 'aguardando', coalesce(nullif(btrim(p_motivo), ''), 'Aprovado pelo gestor'), v_eu);
      perform set_config('app.operacao_pedido', '', true);
      return;
    else
      -- Item com opções precisa da escolhida; cotação antiga (do pedido inteiro) também
      select string_agg(i.descricao, ', ') into v_sem
        from public.pedido_itens i
       where i.pedido_id = p_pedido
         and exists (select 1 from public.pedido_cotacoes o where o.item_id = i.id)
         and not exists (select 1 from public.pedido_cotacoes o where o.item_id = i.id and o.vencedora);
      if v_sem is not null then
        raise exception 'Escolha a opção de: %', v_sem using errcode = '23514';
      end if;
      if exists (select 1 from public.pedido_cotacoes where pedido_id = p_pedido and item_id is null)
         and not exists (select 1 from public.pedido_cotacoes where pedido_id = p_pedido and item_id is null and vencedora) then
        raise exception 'Escolha a cotação vencedora antes de aprovar' using errcode = '23514';
      end if;
      v_para := 'aprovado';
    end if;
  elsif p_acao = 'cancelar' then
    if v_p.status not in ('rascunho', 'em_cotacao', 'aguardando', 'aprovado', 'recusado') then
      raise exception 'O pedido % não pode mais ser cancelado (situação: %)', v_p.codigo, v_p.status using errcode = '23514';
    end if;
    if not (v_ti or v_compras) and (v_p.solicitante_id is distinct from v_eu or v_p.status not in ('rascunho', 'em_cotacao', 'aguardando')) then
      raise exception 'Depois de aprovado, só a T.I. ou Compras cancelam o pedido' using errcode = '42501';
    end if;
    if length(btrim(coalesce(p_motivo, ''))) < 5 then
      raise exception 'Explique por que o pedido foi cancelado' using errcode = '23514';
    end if;
    v_para := 'cancelado';
  else
    raise exception 'Ação inválida: %', p_acao using errcode = '23514';
  end if;

  perform set_config('app.operacao_pedido', 'sim', true);
  perform set_config('app.motivo_pedido', coalesce(btrim(p_motivo), ''), true);
  if v_para = 'aprovado' then
    -- A opção escolhida define o produto do item (tudo continua editável depois, no recebimento)
    update public.pedido_itens i
       set marca = coalesce(o.marca, i.marca), modelo = coalesce(o.modelo, i.modelo), link = coalesce(o.link, i.link),
           imagem_url = coalesce(o.imagem_url, i.imagem_url),
           valor_unitario = case when o.valor > 0 then o.valor else i.valor_unitario end
      from public.pedido_cotacoes o
     where o.item_id = i.id and o.vencedora and i.pedido_id = p_pedido;
    select coalesce((select fornecedor_id from public.pedido_cotacoes where pedido_id = p_pedido and item_id is null and vencedora),
                    (select o.fornecedor_id from public.pedido_cotacoes o join public.pedido_itens i on i.id = o.item_id
                      where o.pedido_id = p_pedido and o.vencedora and o.fornecedor_id is not null order by i.ordem limit 1))
      into v_forn;
  end if;
  update public.pedidos_compra
     set status = v_para,
         motivo = case when v_para in ('recusado', 'cancelado') then btrim(p_motivo)
                       when v_para in ('aguardando', 'em_cotacao') then null else motivo end,
         aprovado_por = case when v_para = 'aprovado' then v_eu when v_para in ('aguardando', 'em_cotacao') then null else aprovado_por end,
         aprovado_em = case when v_para = 'aprovado' then now() when v_para in ('aguardando', 'em_cotacao') then null else aprovado_em end,
         aprovado_gestor_por = case when v_para in ('aguardando', 'em_cotacao') then null else aprovado_gestor_por end,
         aprovado_gestor_em = case when v_para in ('aguardando', 'em_cotacao') then null else aprovado_gestor_em end,
         fornecedor_id = case when v_para = 'aprovado' and v_forn is not null then v_forn else fornecedor_id end
   where id = p_pedido;
  perform set_config('app.operacao_pedido', '', true);
  perform set_config('app.motivo_pedido', '', true);
end;
$$;
revoke all on function public.mudar_status_pedido(text, text, text) from public, anon;
grant execute on function public.mudar_status_pedido(text, text, text) to authenticated;

-- 7 -------------------------------------------------------------------------------------------
create or replace function public.registrar_compra_pedido(p_pedido text, p_dados jsonb)
returns text
language plpgsql
security definer  -- Compras não grava faturas direto; a função confere o papel
set search_path = ''
as $$
declare
  v_p          public.pedidos_compra%rowtype;
  v_item       jsonb;
  v_total      numeric;
  v_data       date := nullif(p_dados ->> 'data_compra', '')::date;
  v_venc       date := nullif(p_dados ->> 'vencimento', '')::date;
  v_fornecedor text;
  v_tem_sug    boolean;
  v_motivo     text := nullif(btrim(coalesce(p_dados ->> 'motivo_troca', '')), '');
  v_chave      text := nullif(regexp_replace(coalesce(p_dados ->> 'nf_chave', ''), '\D', '', 'g'), '');
  v_arquivo    text := nullif(p_dados ->> 'nf_arquivo', '');
  v_fatura     text := gen_random_uuid()::text;
  v_trocou     boolean;
begin
  if coalesce(public.meu_papel(), '') not in ('ti_admin', 'compras') then
    raise exception 'Só Compras (ou o administrador da T.I.) registra a compra' using errcode = '42501';
  end if;
  select * into v_p from public.pedidos_compra where id = p_pedido for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = '23514';
  end if;
  if v_p.status <> 'aprovado' then
    raise exception 'Só um pedido aprovado pode ser registrado como comprado' using errcode = '23514';
  end if;
  if v_data is null or v_venc is null then
    raise exception 'Informe a data da compra e o vencimento' using errcode = '23514';
  end if;
  v_fornecedor := coalesce(nullif(p_dados ->> 'fornecedor_id', ''), v_p.fornecedor_id);
  if v_fornecedor is null then
    raise exception 'Informe o fornecedor da compra' using errcode = '23514';
  end if;
  -- Fornecedor diferente do de todas as opções escolhidas (com fornecedor cadastrado) pede motivo
  v_tem_sug := exists (select 1 from public.pedido_cotacoes where pedido_id = p_pedido and vencedora and fornecedor_id is not null);
  v_trocou := v_tem_sug and not exists (select 1 from public.pedido_cotacoes where pedido_id = p_pedido and vencedora and fornecedor_id = v_fornecedor);
  if v_trocou and coalesce(length(v_motivo), 0) < 5 then
    raise exception 'Explique por que a compra foi feita em outro fornecedor' using errcode = '23514';
  end if;
  if v_chave is not null and v_chave !~ '^[0-9]{44}$' then
    raise exception 'A chave da NF-e tem 44 dígitos' using errcode = '23514';
  end if;
  if v_arquivo is not null and v_arquivo not like 'pedidos/' || p_pedido || '/%' then
    raise exception 'Arquivo da NF inválido' using errcode = '23514';
  end if;

  perform set_config('app.operacao_pedido', 'sim', true);
  for v_item in select value from jsonb_array_elements(coalesce(p_dados -> 'itens', '[]'::jsonb)) loop
    update public.pedido_itens
       set valor_unitario = nullif(v_item ->> 'valor_unitario', '')::numeric
     where id = v_item ->> 'id' and pedido_id = p_pedido;
  end loop;
  select coalesce(sum(quantidade * coalesce(valor_unitario, 0)), 0) into v_total from public.pedido_itens where pedido_id = p_pedido;
  if v_total <= 0 then
    raise exception 'Informe o valor pago de cada item' using errcode = '23514';
  end if;

  insert into public.faturas (id, pedido_id, competencia, valor, vencimento, status, numero_documento, forma_pagamento,
                              arquivo_caminho, observacoes)
  values (v_fatura, p_pedido, date_trunc('month', v_data)::date, v_total, v_venc, 'a_pagar',
          nullif(btrim(coalesce(p_dados ->> 'numero_nf', '')), ''), nullif(p_dados ->> 'forma_pagamento', ''),
          v_arquivo, 'Pedido de compra ' || v_p.codigo);

  update public.pedidos_compra
     set status = 'comprado', fornecedor_id = v_fornecedor, data_compra = v_data, vencimento = v_venc,
         numero_nf = nullif(btrim(coalesce(p_dados ->> 'numero_nf', '')), ''), nf_chave = v_chave, nf_arquivo = v_arquivo,
         fornecedor_troca_motivo = case when v_trocou then v_motivo end,
         forma_pagamento = nullif(p_dados ->> 'forma_pagamento', ''), valor_final = v_total, fatura_id = v_fatura
   where id = p_pedido;
  perform set_config('app.operacao_pedido', '', true);
  return v_fatura;
end;
$$;
revoke all on function public.registrar_compra_pedido(text, jsonb) from public, anon;
grant execute on function public.registrar_compra_pedido(text, jsonb) to authenticated;

-- 8 -------------------------------------------------------------------------------------------
create or replace function public.receber_pedido(p_pedido text, p_dados jsonb default '{}'::jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p      public.pedidos_compra%rowtype;
  v_i      public.pedido_itens%rowtype;
  v_ativos jsonb := coalesce(p_dados -> 'ativos', '[]'::jsonb);
  v_criar  jsonb := coalesce(p_dados -> 'criar_estoque', '[]'::jsonb);
  v_a      jsonb;
  v_n      integer;
  v_criados integer := 0;
  v_local  text := coalesce(nullif(btrim(coalesce(p_dados ->> 'localizacao', '')), ''), 'Almoxarifado T.I.');
  v_forn   text;
  v_papel  text := coalesce(public.meu_papel(), '');
  v_est    text;
begin
  select * into v_p from public.pedidos_compra where id = p_pedido for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = '23514';
  end if;
  if not (v_papel in ('ti_admin', 'ti_suporte') or (v_papel = 'compras' and v_p.tipo_pedido = 'outros')) then
    raise exception 'Só a T.I. registra o recebimento' using errcode = '42501';
  end if;
  if v_p.status <> 'comprado' then
    raise exception 'Só um pedido comprado pode ser recebido' using errcode = '23514';
  end if;
  select nome into v_forn from public.fornecedores where id = v_p.fornecedor_id;

  for v_i in select * from public.pedido_itens where pedido_id = p_pedido order by ordem loop
    if v_i.tipo = 'equipamento' then
      if (select count(*) from jsonb_array_elements(v_ativos) e where e ->> 'item_id' = v_i.id) <> v_i.quantidade then
        raise exception 'Informe o patrimônio de cada unidade de "%" (% unidade(s))', v_i.descricao, v_i.quantidade using errcode = '23514';
      end if;
      v_n := 0;
      for v_a in select value from jsonb_array_elements(v_ativos) where value ->> 'item_id' = v_i.id loop
        v_n := v_n + 1;
        if length(btrim(coalesce(v_a ->> 'tag', ''))) = 0 then
          raise exception 'Informe o patrimônio de "%"', v_i.descricao using errcode = '23514';
        end if;
        insert into public.ativos (id, tag, nome, categoria, marca, modelo, serial_number, status, localizacao_fisica,
                                   fiscal, fornecedor_id, pedido_id, observacoes)
        values ('ast-' || gen_random_uuid()::text, btrim(v_a ->> 'tag'),
                coalesce(nullif(btrim(coalesce(v_a ->> 'nome', '')), ''), v_i.descricao),
                coalesce(v_i.categoria_ativo, 'hardware'),
                coalesce(nullif(btrim(coalesce(v_a ->> 'marca', '')), ''), nullif(btrim(coalesce(v_i.marca, '')), ''), 'A definir'),
                coalesce(nullif(btrim(coalesce(v_a ->> 'modelo', '')), ''), nullif(btrim(coalesce(v_i.modelo, '')), ''), 'A definir'),
                coalesce(nullif(btrim(coalesce(v_a ->> 'serial_number', '')), ''), 'A-PREENCHER-' || v_p.codigo || '-' || v_i.ordem || '-' || v_n),
                'disponivel', v_local,
                jsonb_build_object('numeroNF', coalesce(v_p.numero_nf, ''), 'chaveAcesso44', coalesce(v_p.nf_chave, ''),
                                   'valorCompra', coalesce(v_i.valor_unitario, 0), 'fornecedor', coalesce(v_forn, ''),
                                   'dataAquisicao', coalesce(v_p.data_compra::text, ''), 'dataGarantia', ''),
                v_p.fornecedor_id, p_pedido,
                nullif(concat_ws(E'\n',
                  case when v_i.especificacao is not null then 'Especificação do pedido: ' || v_i.especificacao end,
                  case when v_i.link is not null then 'Produto: ' || v_i.link end), ''));
        v_criados := v_criados + 1;
      end loop;
    elsif v_i.tipo = 'acessorio' then
      v_est := v_i.estoque_item_id;
      -- Sem item de estoque ligado: cria com os dados da opção aprovada (quando pedido)
      if v_est is null and exists (select 1 from jsonb_array_elements_text(v_criar) x where x = v_i.id) then
        insert into public.estoque_itens (nome, tipo, marca, modelo, valor_unitario, localizacao, fornecedor_id)
        values (v_i.descricao, 'outro', v_i.marca, v_i.modelo, v_i.valor_unitario, v_local, v_p.fornecedor_id)
        returning id into v_est;
        perform set_config('app.operacao_pedido', 'sim', true);
        update public.pedido_itens set estoque_item_id = v_est where id = v_i.id;
        perform set_config('app.operacao_pedido', '', true);
      end if;
      if v_est is not null then
        insert into public.estoque_movimentos (item_id, tipo, quantidade, motivo, criado_por)
        values (v_est, 'entrada', v_i.quantidade, 'Recebido do pedido ' || v_p.codigo, public.meu_colaborador_id());
        if v_i.valor_unitario is not null then
          update public.estoque_itens set valor_unitario = v_i.valor_unitario where id = v_est;
        end if;
      end if;
    elsif v_i.tipo = 'licenca' and v_i.licenca_id is not null then
      update public.licencas_software set assentos_totais = assentos_totais + v_i.quantidade where id = v_i.licenca_id;
    end if;
  end loop;

  perform set_config('app.operacao_pedido', 'sim', true);
  update public.pedidos_compra
     set status = 'recebido', recebido_por = public.meu_colaborador_id(), recebido_em = now()
   where id = p_pedido;
  perform set_config('app.operacao_pedido', '', true);
  return v_criados;
end;
$$;
revoke all on function public.receber_pedido(text, jsonb) from public, anon;
grant execute on function public.receber_pedido(text, jsonb) to authenticated;
