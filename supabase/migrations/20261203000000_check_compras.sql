-- ==============================================================================
-- CHECK GERAL — COMPRAS
-- ------------------------------------------------------------------------------
-- Reexecutável e sem DROP de tabela ou coluna.
--  1. aprovar_pedido: só com o pedido em cotação; suporte não aprova; quem pediu não registra
--  2. mudar_status_pedido: suporte não devolve pedido aprovado; devolver zera toda a aprovação
--  3. registrar_compra_pedido: valor > 0 em cada item, vencimento >= compra, compra não futura
--  4. pedidos_visiveis devolve os dados da aprovação e da compra
--  5. proteger_pedido protege também os campos da aprovação e da compra
--  6. posso_ver_pedido: RH só os próprios e os de admissão; gestor não vê rascunho
--  7. sou_gestor(): o menu "Custos da minha área" não depende do cadastro de pessoas
-- ==============================================================================

-- 1 -------------------------------------------------------------------------------------------
create or replace function public.aprovar_pedido(p_pedido text, p_aprovador text, p_forma text, p_obs text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p     public.pedidos_compra%rowtype;
  v_eu    text := public.meu_colaborador_id();
  v_papel text := coalesce(public.meu_papel(), '');
  v_equipe boolean := v_papel in ('ti_admin', 'compras');
  v_nome  text;
  v_forn  text;
begin
  select * into v_p from public.pedidos_compra where id = p_pedido for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = '23514';
  end if;
  if not v_equipe and not (v_eu is not null and v_p.gestor_id = v_eu and p_aprovador = v_eu) then
    raise exception 'Só Compras, o administrador da T.I. ou o gestor de quem pediu registram a aprovação' using errcode = '42501';
  end if;
  if v_eu is not null and v_eu = v_p.solicitante_id then
    raise exception 'Quem pediu não pode registrar a aprovação do próprio pedido' using errcode = '23514';
  end if;
  -- Só depois da cotação (enviado e cotado); rascunho e devolvido ainda não chegaram lá
  if v_p.status not in ('em_cotacao', 'aguardando') then
    raise exception 'O pedido % não está aguardando aprovação (situação: %)', v_p.codigo, v_p.status using errcode = '23514';
  end if;
  select nome into v_nome from public.colaboradores where id = p_aprovador and status <> 'desligado';
  if v_nome is null then
    raise exception 'Escolha quem aprovou' using errcode = '23514';
  end if;
  if p_aprovador = v_p.solicitante_id then
    raise exception 'Quem pediu não pode aprovar o próprio pedido' using errcode = '23514';
  end if;
  if coalesce(p_forma, '') not in ('pessoalmente', 'email', 'mensagem', 'sistema', 'outro') then
    raise exception 'Diga como foi a aprovação' using errcode = '23514';
  end if;
  if not exists (select 1 from public.pedido_itens where pedido_id = p_pedido) then
    raise exception 'Inclua pelo menos um item' using errcode = '23514';
  end if;
  perform set_config('app.operacao_pedido', 'sim', true);
  perform set_config('app.motivo_pedido', 'Aprovado por ' || v_nome || ' (' || p_forma || ')' ||
                     coalesce(' — ' || nullif(btrim(coalesce(p_obs, '')), ''), ''), true);
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
  update public.pedidos_compra
     set status = 'aprovado', aprovado_por = v_eu, aprovado_em = now(), aprovador_id = p_aprovador,
         aprovacao_forma = p_forma, aprovacao_obs = nullif(btrim(coalesce(p_obs, '')), ''), motivo = null,
         aprovado_gestor_por = case when p_aprovador = v_p.gestor_id then p_aprovador else aprovado_gestor_por end,
         aprovado_gestor_em = case when p_aprovador = v_p.gestor_id then now() else aprovado_gestor_em end,
         fornecedor_id = coalesce(v_forn, fornecedor_id)
   where id = p_pedido;
  perform set_config('app.operacao_pedido', '', true);
  perform set_config('app.motivo_pedido', '', true);
end;
$$;
revoke all on function public.aprovar_pedido(text, text, text, text) from public, anon;
grant execute on function public.aprovar_pedido(text, text, text, text) to authenticated;

-- 2 -------------------------------------------------------------------------------------------
create or replace function public.mudar_status_pedido(p_pedido text, p_acao text, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p      public.pedidos_compra%rowtype;
  v_papel  text := coalesce(public.meu_papel(), '');
  v_eu     text := public.meu_colaborador_id();
  v_equipe boolean := v_papel in ('ti_admin', 'ti_suporte', 'compras');
  v_para   text;
begin
  select * into v_p from public.pedidos_compra where id = p_pedido for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = '23514';
  end if;
  if not (v_equipe or v_p.solicitante_id = v_eu) then
    raise exception 'Você não pode mexer neste pedido' using errcode = '42501';
  end if;

  if p_acao = 'enviar' then
    if v_p.status not in ('rascunho', 'recusado') then
      raise exception 'Só um rascunho ou um pedido devolvido vai para cotação' using errcode = '23514';
    end if;
    if not exists (select 1 from public.pedido_itens where pedido_id = p_pedido) then
      raise exception 'Inclua pelo menos um item antes de enviar' using errcode = '23514';
    end if;
    v_para := 'em_cotacao';
  elsif p_acao = 'devolver' then
    if not v_equipe or v_p.status not in ('em_cotacao', 'aguardando', 'aprovado') then
      raise exception 'Só a T.I. ou Compras devolvem um pedido em cotação ou aprovado' using errcode = '42501';
    end if;
    -- Pedido aprovado só volta para a cotação por Compras (ou pelo administrador)
    if v_p.status = 'aprovado' and v_papel not in ('ti_admin', 'compras') then
      raise exception 'Só Compras ou o administrador da T.I. devolvem um pedido aprovado' using errcode = '42501';
    end if;
    if length(btrim(coalesce(p_motivo, ''))) < 5 then
      raise exception 'Explique por que o pedido foi devolvido' using errcode = '23514';
    end if;
    v_para := case when v_p.status = 'aprovado' then 'em_cotacao' else 'recusado' end;
  elsif p_acao in ('aprovar', 'recusar') then
    raise exception 'Use "Registrar aprovação" (com quem aprovou) ou "Devolver"' using errcode = '23514';
  elsif p_acao = 'cancelar' then
    if v_p.status not in ('rascunho', 'em_cotacao', 'aguardando', 'aprovado', 'recusado') then
      raise exception 'O pedido % não pode mais ser cancelado (situação: %)', v_p.codigo, v_p.status using errcode = '23514';
    end if;
    if not v_equipe and v_p.status not in ('rascunho', 'em_cotacao', 'aguardando') then
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
  update public.pedidos_compra
     set status = v_para,
         motivo = case when v_para in ('recusado', 'cancelado') or (p_acao = 'devolver') then btrim(p_motivo) else null end,
         aprovado_por = case when v_para = 'em_cotacao' then null else aprovado_por end,
         aprovado_em = case when v_para = 'em_cotacao' then null else aprovado_em end,
         aprovador_id = case when v_para = 'em_cotacao' then null else aprovador_id end,
         aprovacao_forma = case when v_para = 'em_cotacao' then null else aprovacao_forma end,
         aprovacao_obs = case when v_para = 'em_cotacao' then null else aprovacao_obs end,
         aprovado_gestor_por = case when v_para = 'em_cotacao' then null else aprovado_gestor_por end,
         aprovado_gestor_em = case when v_para = 'em_cotacao' then null else aprovado_gestor_em end
   where id = p_pedido;
  perform set_config('app.operacao_pedido', '', true);
  perform set_config('app.motivo_pedido', '', true);
end;
$$;
revoke all on function public.mudar_status_pedido(text, text, text) from public, anon;
grant execute on function public.mudar_status_pedido(text, text, text) to authenticated;

-- 3 -------------------------------------------------------------------------------------------
create or replace function public.registrar_compra_pedido(p_pedido text, p_dados jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p          public.pedidos_compra%rowtype;
  v_item       jsonb;
  v_total      numeric;
  v_data       date := nullif(p_dados ->> 'data_compra', '')::date;
  v_venc       date := nullif(p_dados ->> 'vencimento', '')::date;
  v_fornecedor text;
  v_loja       text := nullif(btrim(coalesce(p_dados ->> 'loja', '')), '');
  v_link       text := nullif(btrim(coalesce(p_dados ->> 'link', '')), '');
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
  if v_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data da compra não pode ser futura' using errcode = '23514';
  end if;
  if v_venc < v_data then
    raise exception 'O vencimento não pode ser antes da data da compra' using errcode = '23514';
  end if;
  v_fornecedor := coalesce(nullif(p_dados ->> 'fornecedor_id', ''), case when v_loja is null then v_p.fornecedor_id end);
  if v_fornecedor is null and v_loja is null then
    raise exception 'Informe o fornecedor ou a loja da compra' using errcode = '23514';
  end if;
  if v_link is not null and v_link !~* '^https?://' then
    raise exception 'O link da compra precisa começar com https://' using errcode = '23514';
  end if;
  v_trocou := exists (select 1 from public.pedido_cotacoes where pedido_id = p_pedido and vencedora and fornecedor_id is not null)
              and not exists (select 1 from public.pedido_cotacoes where pedido_id = p_pedido and vencedora and fornecedor_id = v_fornecedor);
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
  if exists (select 1 from public.pedido_itens where pedido_id = p_pedido and coalesce(valor_unitario, 0) <= 0) then
    raise exception 'Informe o valor pago de cada item (maior que zero)' using errcode = '23514';
  end if;
  select coalesce(sum(quantidade * valor_unitario), 0) into v_total from public.pedido_itens where pedido_id = p_pedido;
  if v_total <= 0 then
    raise exception 'Informe o valor pago de cada item' using errcode = '23514';
  end if;

  insert into public.faturas (id, pedido_id, competencia, valor, vencimento, status, numero_documento, forma_pagamento,
                              arquivo_caminho, observacoes)
  values (v_fatura, p_pedido, date_trunc('month', v_data)::date, v_total, v_venc, 'a_pagar',
          nullif(btrim(coalesce(p_dados ->> 'numero_nf', '')), ''), nullif(p_dados ->> 'forma_pagamento', ''),
          v_arquivo, 'Pedido de compra ' || v_p.codigo || coalesce(' · ' || v_loja, ''));

  update public.pedidos_compra
     set status = 'comprado', fornecedor_id = v_fornecedor, loja_compra = v_loja, link_compra = v_link,
         data_compra = v_data, vencimento = v_venc,
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

-- 4 -------------------------------------------------------------------------------------------
-- (muda as colunas de retorno: é preciso recriar a função)
drop function if exists public.pedidos_visiveis();
create function public.pedidos_visiveis()
returns table (
  id text, codigo text, titulo text, justificativa text, categoria text, area text, status text, tipo_pedido text,
  solicitante_id text, solicitante_nome text, gestor_id text, gestor_nome text, aprovado_gestor_por text, aprovado_gestor_em timestamptz,
  aprovador_id text, aprovacao_forma text, aprovacao_obs text, aprovado_por text, aprovado_em timestamptz,
  loja_compra text, link_compra text,
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
         p.aprovador_id, p.aprovacao_forma, p.aprovacao_obs, p.aprovado_por, p.aprovado_em,
         p.loja_compra, p.link_compra,
         p.colaborador_destino_id, d.nome, p.chamado_id, p.processo_item_id,
         p.necessario_em, p.motivo, p.criado_em, p.atualizado_em,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', i.id, 'tipo', i.tipo, 'descricao', i.descricao, 'categoria_ativo', i.categoria_ativo,
                     'especificacao', i.especificacao, 'quantidade', i.quantidade, 'marca', i.marca, 'modelo', i.modelo,
                     'link', i.link, 'imagem_url', i.imagem_url,
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

-- 5 -------------------------------------------------------------------------------------------
-- As funções do pedido marcam a transação com app.operacao_pedido = 'sim' e passam direto.
-- fornecedor_id e aprovador_id podem virar nulo pelo próprio banco (exclusão do cadastro).
create or replace function public.proteger_pedido()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_op boolean := coalesce(current_setting('app.operacao_pedido', true), '') = 'sim';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'rascunho' and not v_op then
      raise exception 'Pedido novo começa como rascunho' using errcode = '23514';
    end if;
    new.codigo := 'PC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.pedidos_compra_seq')::text, 4, '0');
    new.area := btrim(coalesce(new.area, ''));
    if new.solicitante_id is null then
      new.solicitante_id := public.meu_colaborador_id();
    end if;
    new.gestor_id := (select c.gestor_id from public.colaboradores c
                       join public.colaboradores g on g.id = c.gestor_id and g.status <> 'desligado'
                      where c.id = new.solicitante_id and c.gestor_id <> c.id);
    new.aprovado_gestor_por := null;
    new.aprovado_gestor_em := null;
    return new;
  end if;

  new.codigo := old.codigo;
  new.atualizado_em := now();
  if not v_op then
    if new.status is distinct from old.status then
      raise exception 'Use as ações do pedido para mudar a situação' using errcode = '23514';
    end if;
    if new.aprovado_por is distinct from old.aprovado_por or new.aprovado_em is distinct from old.aprovado_em
       or new.fatura_id is distinct from old.fatura_id or new.valor_final is distinct from old.valor_final
       or new.recebido_em is distinct from old.recebido_em or new.solicitante_id is distinct from old.solicitante_id
       or new.gestor_id is distinct from old.gestor_id or new.aprovado_gestor_em is distinct from old.aprovado_gestor_em
       or new.aprovado_gestor_por is distinct from old.aprovado_gestor_por or new.nf_arquivo is distinct from old.nf_arquivo
       or new.nf_chave is distinct from old.nf_chave
       or (new.aprovador_id is distinct from old.aprovador_id and new.aprovador_id is not null)
       or new.aprovacao_forma is distinct from old.aprovacao_forma or new.aprovacao_obs is distinct from old.aprovacao_obs
       or new.loja_compra is distinct from old.loja_compra or new.link_compra is distinct from old.link_compra
       or (new.fornecedor_id is distinct from old.fornecedor_id and new.fornecedor_id is not null)
       or new.vencimento is distinct from old.vencimento then
      raise exception 'Esses dados do pedido são gravados pelas ações (aprovar, comprar, receber)' using errcode = '23514';
    end if;
    if old.status not in ('rascunho', 'em_cotacao', 'aguardando', 'recusado') then
      raise exception 'O pedido % não pode mais ser editado (situação: %)', old.codigo, old.status using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_pedido() from public, anon, authenticated;

-- 6 -------------------------------------------------------------------------------------------
-- Quem vê o pedido (sem valores): quem pediu; o gestor dele (menos rascunho); RH só os seus e os de
-- admissão (chamado do tipo onboarding); T.I. e Compras
create or replace function public.posso_ver_pedido(p_pedido text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pedidos_compra p
     where p.id = p_pedido
       and public.meu_colaborador_id() is not null
       and (p.solicitante_id = public.meu_colaborador_id()
            or (p.gestor_id = public.meu_colaborador_id() and p.status <> 'rascunho')
            or coalesce(public.meu_papel(), '') in ('ti_admin', 'ti_suporte', 'compras')
            or (public.meu_papel() = 'rh' and p.status <> 'rascunho'
                and exists (select 1 from public.chamados c where c.id = p.chamado_id and c.tipo = 'onboarding'))));
$$;
revoke all on function public.posso_ver_pedido(text) from public, anon;
grant execute on function public.posso_ver_pedido(text) to authenticated;

-- 7 -------------------------------------------------------------------------------------------
create or replace function public.sou_gestor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.meu_colaborador_id() is not null
     and exists (select 1 from public.colaboradores c
                  where c.gestor_id = public.meu_colaborador_id() and c.id <> c.gestor_id and c.status <> 'desligado');
$$;
revoke all on function public.sou_gestor() from public, anon;
grant execute on function public.sou_gestor() to authenticated;

-- 8 -------------------------------------------------------------------------------------------
-- Função antiga (sem uso na tela): mesma regra do RH de posso_ver_pedido
create or replace function public.pedidos_solicitados()
returns table (
  id text, codigo text, titulo text, justificativa text, categoria text, area text, status text,
  solicitante_id text, colaborador_destino_id text, chamado_id text, processo_item_id text,
  necessario_em date, motivo text, criado_em timestamptz, atualizado_em timestamptz, itens jsonb, eventos jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.codigo, p.titulo, p.justificativa, p.categoria, p.area, p.status,
         p.solicitante_id, p.colaborador_destino_id, p.chamado_id, p.processo_item_id,
         p.necessario_em, p.motivo, p.criado_em, p.atualizado_em,
         coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'tipo', i.tipo, 'descricao', i.descricao,
                                                       'categoria_ativo', i.categoria_ativo, 'especificacao', i.especificacao,
                                                       'quantidade', i.quantidade) order by i.ordem)
                     from public.pedido_itens i where i.pedido_id = p.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('de', e.de, 'para', e.para, 'motivo', e.motivo, 'por', e.por, 'em', e.em) order by e.em)
                     from public.pedido_eventos e where e.pedido_id = p.id), '[]'::jsonb)
    from public.pedidos_compra p
   where public.pode_pedir_compra()
     and (p.solicitante_id = public.meu_colaborador_id()
          or coalesce(public.meu_papel(), '') in ('ti_admin', 'ti_suporte')
          or (public.meu_papel() = 'rh' and p.status <> 'rascunho'
               and exists (select 1 from public.chamados c where c.id = p.chamado_id and c.tipo = 'onboarding')))
   order by p.criado_em desc;
$$;
revoke all on function public.pedidos_solicitados() from public, anon;
grant execute on function public.pedidos_solicitados() to authenticated;
