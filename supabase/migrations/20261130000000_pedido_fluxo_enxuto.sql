-- ==============================================================================
-- PEDIDO DE COMPRA: FLUXO ENXUTO (seção 15 da documentação)
-- ------------------------------------------------------------------------------
-- Reexecutável e sem DROP de tabela ou coluna.
-- Pedido → cotação (T.I.; "Outros": Compras) → aprovação REGISTRADA ("Aprovado por",
-- forma e data; quem pediu não aprova o próprio pedido) → Compras compra → recebimento.
-- Sai a aprovação obrigatória do gestor e de Compras pelo sistema; o gestor ainda pode
-- dar o "ok" ele mesmo. Compras pode devolver um pedido aprovado para a cotação.
-- ==============================================================================

alter table public.pedidos_compra
  add column if not exists aprovador_id    text references public.colaboradores (id) on delete set null,
  add column if not exists aprovacao_forma text,
  add column if not exists aprovacao_obs   text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_pedido_aprovacao_forma') then
    alter table public.pedidos_compra add constraint chk_pedido_aprovacao_forma
      check (aprovacao_forma is null or aprovacao_forma in ('pessoalmente', 'email', 'mensagem', 'sistema', 'outro'));
  end if;
end $$;

-- Nomes para escolher "Aprovado por" (Compras não lê o cadastro de pessoas)
create or replace function public.pessoas_para_aprovacao()
returns table (id text, nome text, cargo text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.nome, c.cargo from public.colaboradores c
   where c.status <> 'desligado' and coalesce(public.meu_papel(), '') in ('ti_admin', 'ti_suporte', 'compras')
   order by c.nome;
$$;
revoke all on function public.pessoas_para_aprovacao() from public, anon;
grant execute on function public.pessoas_para_aprovacao() to authenticated;

-- Registrar a aprovação: T.I./Compras registram quem aprovou; o gestor de quem pediu pode
-- aprovar ele mesmo. Quem pediu nunca é o aprovador.
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
  v_equipe boolean := v_papel in ('ti_admin', 'ti_suporte', 'compras');
  v_nome  text;
  v_sem   text;
  v_forn  text;
begin
  select * into v_p from public.pedidos_compra where id = p_pedido for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = '23514';
  end if;
  if not v_equipe and not (v_eu is not null and v_p.gestor_id = v_eu and p_aprovador = v_eu) then
    raise exception 'Só a T.I., Compras ou o gestor de quem pediu registram a aprovação' using errcode = '42501';
  end if;
  if v_p.status not in ('rascunho', 'em_cotacao', 'aguardando', 'recusado') then
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

  perform set_config('app.operacao_pedido', 'sim', true);
  perform set_config('app.motivo_pedido', 'Aprovado por ' || v_nome || ' (' || p_forma || ')' ||
                     coalesce(' — ' || nullif(btrim(coalesce(p_obs, '')), ''), ''), true);
  -- A opção escolhida define o produto do item
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

-- Pedido novo (de qualquer tipo) vai para cotação: T.I. cota o de T.I.; Compras, "Outros"
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
          btrim(coalesce(p_pedido ->> 'area', '')), 'em_cotacao', v_tipo, public.meu_colaborador_id(),
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

-- Enviar (→ cotação), devolver (T.I.: a quem pediu; Compras: aprovado volta à cotação),
-- cancelar. "Aprovar" agora é aprovar_pedido (com quem aprovou).
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
    if length(btrim(coalesce(p_motivo, ''))) < 5 then
      raise exception 'Explique por que o pedido foi devolvido' using errcode = '23514';
    end if;
    -- Em cotação: volta para quem pediu; aprovado: volta para a cotação (nova aprovação)
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
         aprovacao_forma = case when v_para = 'em_cotacao' then null else aprovacao_forma end
   where id = p_pedido;
  perform set_config('app.operacao_pedido', '', true);
  perform set_config('app.motivo_pedido', '', true);
end;
$$;
revoke all on function public.mudar_status_pedido(text, text, text) from public, anon;
grant execute on function public.mudar_status_pedido(text, text, text) to authenticated;
