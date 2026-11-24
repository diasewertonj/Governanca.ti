-- ==============================================================================
-- COMPRAS COMO DEPARTAMENTO (seção 13 da documentação)
-- ------------------------------------------------------------------------------
-- Reexecutável e sem DROP de tabela ou coluna. Só troca regras (check) do papel do
-- colaborador (inclui 'compras') e da situação do pedido (inclui 'em_cotacao').
--
-- Fluxo: qualquer colaborador pede → T.I. cota (pedido "T.I.") → gestor de quem pediu
-- aprova (quando houver) → Compras ou admin da T.I. aprova → Compras compra (NF) →
-- T.I. recebe (Compras recebe pedido "Outros").
--
-- 1. Papel 'compras' em colaboradores; ativos_visiveis/licencas_visiveis tratam como colaborador
-- 2. pedidos_compra: tipo (ti/outros), gestor, aprovação do gestor, NF (chave e arquivo),
--    troca de fornecedor com motivo; situação 'em_cotacao'
-- 3. pedido_mensagens: conversa do pedido (nota interna só T.I./Compras)
-- 4. RLS do papel compras: pedidos, itens, cotações, eventos, orçamento (ler),
--    fornecedores (ler, cadastrar, editar), faturas de pedido (ler, pagar), Storage
-- 5. Funções: posso_ver_pedido, pedidos_visiveis (substitui pedidos_solicitados, que fica),
--    solicitar_compra, mudar_status_pedido, registrar_compra_pedido, receber_pedido
-- ==============================================================================

-- 1. Papel 'compras' --------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_colaborador_role') then
    alter table public.colaboradores drop constraint if exists colaboradores_role_check;
    alter table public.colaboradores add constraint chk_colaborador_role
      check (role in ('colaborador', 'rh', 'ti_suporte', 'ti_admin', 'compras'));
  end if;
end $$;

-- Compras lê como colaborador (só o que é dele, sem dados fiscais)
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
  if v_papel is null or v_papel not in ('rh', 'colaborador', 'compras') then
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

-- 2. Pedido -----------------------------------------------------------------------------------
alter table public.pedidos_compra
  add column if not exists tipo_pedido              text not null default 'ti',
  add column if not exists gestor_id                text references public.colaboradores (id) on delete set null,
  add column if not exists aprovado_gestor_por      text references public.colaboradores (id) on delete set null,
  add column if not exists aprovado_gestor_em       timestamptz,
  add column if not exists nf_chave                 text,
  add column if not exists nf_arquivo               text,
  add column if not exists fornecedor_troca_motivo  text;
create index if not exists idx_pedidos_gestor on public.pedidos_compra (gestor_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_pedido_tipo') then
    alter table public.pedidos_compra add constraint chk_pedido_tipo check (tipo_pedido in ('ti', 'outros'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_pedido_status') then
    alter table public.pedidos_compra drop constraint if exists pedidos_compra_status_check;
    alter table public.pedidos_compra add constraint chk_pedido_status check (status in (
      'rascunho', 'em_cotacao', 'aguardando', 'aprovado', 'recusado', 'comprado', 'recebido', 'cancelado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_pedido_nf_chave') then
    alter table public.pedidos_compra add constraint chk_pedido_nf_chave check (nf_chave is null or nf_chave ~ '^[0-9]{44}$');
  end if;
end $$;

-- Edição só nas situações em aberto (agora inclui "em cotação"); código e gestor pelo banco
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
    -- Gestor de quem pediu (ativo e diferente da própria pessoa) aprova antes de Compras
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
       or new.nf_chave is distinct from old.nf_chave then
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
  if tg_table_name = 'pedido_cotacoes' and tg_op = 'INSERT'
     and (select count(*) from public.pedido_cotacoes where pedido_id = new.pedido_id) >= 3 then
    raise exception 'Cada pedido tem no máximo 3 cotações' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.proteger_detalhe_pedido() from public, anon, authenticated;

-- 3. Conversa do pedido -----------------------------------------------------------------------
create table if not exists public.pedido_mensagens (
  id            text primary key default gen_random_uuid()::text,
  pedido_id     text not null references public.pedidos_compra (id) on delete cascade,
  autor_id      text references public.colaboradores (id) on delete set null,
  texto         text not null check (btrim(texto) <> ''),
  interna       boolean not null default false,
  anexo_caminho text,
  criado_em     timestamptz not null default now()
);
create index if not exists idx_pedido_mensagens_pedido on public.pedido_mensagens (pedido_id, criado_em);

-- Quem vê o pedido (sem valores): quem pediu, o gestor dele, RH (menos rascunho alheio), T.I. e Compras
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
            or p.gestor_id = public.meu_colaborador_id()
            or coalesce(public.meu_papel(), '') in ('ti_admin', 'ti_suporte', 'compras')
            or (public.meu_papel() = 'rh' and p.status <> 'rascunho')));
$$;
revoke all on function public.posso_ver_pedido(text) from public, anon;
grant execute on function public.posso_ver_pedido(text) to authenticated;

-- Autor e data pelo banco; mensagem não se altera
create or replace function public.carimbar_mensagem_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Mensagem enviada não se altera' using errcode = '23514';
  end if;
  new.autor_id := public.meu_colaborador_id();
  new.criado_em := now();
  return new;
end;
$$;
revoke all on function public.carimbar_mensagem_pedido() from public, anon, authenticated;
create or replace trigger trg_pedido_mensagens_carimbar
  before insert or update on public.pedido_mensagens
  for each row execute function public.carimbar_mensagem_pedido();

alter table public.pedido_mensagens enable row level security;
revoke all on public.pedido_mensagens from anon;
grant select, insert, delete on public.pedido_mensagens to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pedido_mensagens' and policyname = 'pedido_mensagens_ler') then
    create policy pedido_mensagens_ler on public.pedido_mensagens for select to authenticated
      using (public.meu_papel() in ('ti_admin', 'ti_suporte', 'compras')
             or (not interna and public.posso_ver_pedido(pedido_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pedido_mensagens' and policyname = 'pedido_mensagens_enviar') then
    create policy pedido_mensagens_enviar on public.pedido_mensagens for insert to authenticated
      with check (public.posso_ver_pedido(pedido_id)
                  and (not interna or public.meu_papel() in ('ti_admin', 'ti_suporte', 'compras'))
                  and (anexo_caminho is null or public.meu_papel() in ('ti_admin', 'ti_suporte', 'compras')));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pedido_mensagens' and policyname = 'pedido_mensagens_excluir') then
    create policy pedido_mensagens_excluir on public.pedido_mensagens for delete to authenticated
      using (public.meu_papel() = 'ti_admin');
  end if;
end $$;

-- 4. RLS do papel compras (políticas a mais; as da T.I. continuam) ---------------------------
do $$
declare
  r record;
  v_c constant text := 'public.meu_papel() = ''compras''';
begin
  for r in
    select * from (values
      ('pedidos_compra',  'select', 'compras_ler',     v_c, null),
      ('pedidos_compra',  'insert', 'compras_inserir', null, v_c),
      ('pedidos_compra',  'update', 'compras_alterar', v_c, v_c),
      ('pedido_itens',    'select', 'compras_ler',     v_c, null),
      ('pedido_itens',    'insert', 'compras_inserir', null, v_c),
      ('pedido_itens',    'update', 'compras_alterar', v_c, v_c),
      ('pedido_itens',    'delete', 'compras_excluir', v_c, null),
      ('pedido_cotacoes', 'select', 'compras_ler',     v_c, null),
      ('pedido_cotacoes', 'insert', 'compras_inserir', null, v_c),
      ('pedido_cotacoes', 'update', 'compras_alterar', v_c, v_c),
      ('pedido_cotacoes', 'delete', 'compras_excluir', v_c, null),
      ('pedido_eventos',  'select', 'compras_ler',     v_c, null),
      ('orcamentos',      'select', 'compras_ler',     v_c, null),
      ('fornecedores',    'select', 'compras_ler',     v_c, null),
      ('fornecedores',    'insert', 'compras_inserir', null, v_c),
      ('fornecedores',    'update', 'compras_alterar', v_c, v_c),
      ('faturas',         'select', 'compras_ler',     v_c || ' and pedido_id is not null', null),
      ('faturas',         'update', 'compras_alterar', v_c || ' and pedido_id is not null', v_c || ' and pedido_id is not null')
    ) as v(tabela, cmd, nome, usando, checando)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tabela and policyname = r.tabela || '_' || r.nome) then
      execute format('create policy %I on public.%I for %s to authenticated %s %s',
        r.tabela || '_' || r.nome, r.tabela, r.cmd,
        case when r.usando is not null then 'using (' || r.usando || ')' else '' end,
        case when r.checando is not null then 'with check (' || r.checando || ')' else '' end);
    end if;
  end loop;
end $$;

-- Arquivos: Compras envia e lê nas pastas pedidos/ (NF, cotação) e faturas/ (comprovante)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'documentos_enviar_compras') then
    create policy documentos_enviar_compras on storage.objects for insert to authenticated
      with check (bucket_id = 'documentos' and public.meu_papel() = 'compras'
                  and (storage.foldername(name))[1] in ('pedidos', 'faturas'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'documentos_ler_compras') then
    create policy documentos_ler_compras on storage.objects for select to authenticated
      using (bucket_id = 'documentos' and public.meu_papel() = 'compras'
             and (storage.foldername(name))[1] in ('pedidos', 'faturas'));
  end if;
end $$;

-- 5. Funções ----------------------------------------------------------------------------------

-- Qualquer colaborador ativo pede compra
create or replace function public.pode_pedir_compra()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.meu_colaborador_id() is not null and public.meu_papel() is not null;
$$;
revoke all on function public.pode_pedir_compra() from public, anon;
grant execute on function public.pode_pedir_compra() to authenticated;

-- Pedido de quem não é T.I./Compras: pedido "T.I." vai para cotação da T.I.;
-- "Outros" vai direto para aprovação (Compras cota)
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
    insert into public.pedido_itens (pedido_id, tipo, descricao, categoria_ativo, especificacao, quantidade, ordem)
    values (v_id, case when v_tipo = 'ti' then coalesce(nullif(v_item ->> 'tipo', ''), 'equipamento') else 'servico' end,
            btrim(coalesce(v_item ->> 'descricao', '')),
            case when v_tipo = 'ti' then nullif(v_item ->> 'categoria_ativo', '') end,
            nullif(btrim(coalesce(v_item ->> 'especificacao', '')), ''),
            coalesce(nullif(v_item ->> 'quantidade', '')::integer, 1), v_n);
  end loop;
  perform set_config('app.operacao_pedido', '', true);
  return v_id;
end;
$$;
revoke all on function public.solicitar_compra(jsonb, jsonb) from public, anon;
grant execute on function public.solicitar_compra(jsonb, jsonb) to authenticated;

-- O que cada um vê dos pedidos, com nomes; valores só para T.I. e Compras
drop function if exists public.pedidos_visiveis(); -- reexecução depois de migrations que mudam as colunas
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
         coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'tipo', i.tipo, 'descricao', i.descricao,
                                                       'categoria_ativo', i.categoria_ativo, 'especificacao', i.especificacao,
                                                       'quantidade', i.quantidade) order by i.ordem)
                     from public.pedido_itens i where i.pedido_id = p.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('de', e.de, 'para', e.para, 'motivo', e.motivo, 'por', e.por,
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

-- Enviar, devolver, aprovar (gestor → Compras/admin), recusar, cancelar
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
  v_venc    public.pedido_cotacoes%rowtype;
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
    -- Quem pede (fora da equipe) manda o pedido "T.I." para a cotação da T.I.
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
      -- Gestor aprova: o pedido segue aguardando Compras; fica no histórico
      perform set_config('app.operacao_pedido', 'sim', true);
      update public.pedidos_compra set aprovado_gestor_por = v_eu, aprovado_gestor_em = now() where id = p_pedido;
      insert into public.pedido_eventos (pedido_id, de, para, motivo, por)
      values (p_pedido, 'aguardando', 'aguardando', coalesce(nullif(btrim(p_motivo), ''), 'Aprovado pelo gestor'), v_eu);
      perform set_config('app.operacao_pedido', '', true);
      return;
    else
      if exists (select 1 from public.pedido_cotacoes where pedido_id = p_pedido) then
        select * into v_venc from public.pedido_cotacoes where pedido_id = p_pedido and vencedora;
        if not found then
          raise exception 'Escolha a cotação vencedora antes de aprovar' using errcode = '23514';
        end if;
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
  update public.pedidos_compra
     set status = v_para,
         motivo = case when v_para in ('recusado', 'cancelado') then btrim(p_motivo)
                       when v_para in ('aguardando', 'em_cotacao') then null else motivo end,
         aprovado_por = case when v_para = 'aprovado' then v_eu when v_para in ('aguardando', 'em_cotacao') then null else aprovado_por end,
         aprovado_em = case when v_para = 'aprovado' then now() when v_para in ('aguardando', 'em_cotacao') then null else aprovado_em end,
         -- Nova rodada de aprovação: o gestor aprova de novo
         aprovado_gestor_por = case when v_para in ('aguardando', 'em_cotacao') then null else aprovado_gestor_por end,
         aprovado_gestor_em = case when v_para in ('aguardando', 'em_cotacao') then null else aprovado_gestor_em end,
         fornecedor_id = case when v_para = 'aprovado' and v_venc.id is not null then v_venc.fornecedor_id else fornecedor_id end
   where id = p_pedido;
  perform set_config('app.operacao_pedido', '', true);
  perform set_config('app.motivo_pedido', '', true);
end;
$$;
revoke all on function public.mudar_status_pedido(text, text, text) from public, anon;
grant execute on function public.mudar_status_pedido(text, text, text) to authenticated;

-- Comprado (Compras ou admin): NF com chave e arquivo; outro fornecedor exige motivo
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
  v_sugerido   text;
  v_motivo     text := nullif(btrim(coalesce(p_dados ->> 'motivo_troca', '')), '');
  v_chave      text := nullif(regexp_replace(coalesce(p_dados ->> 'nf_chave', ''), '\D', '', 'g'), '');
  v_arquivo    text := nullif(p_dados ->> 'nf_arquivo', '');
  v_fatura     text := gen_random_uuid()::text;
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
  select fornecedor_id into v_sugerido from public.pedido_cotacoes where pedido_id = p_pedido and vencedora;
  if v_sugerido is not null and v_sugerido <> v_fornecedor and coalesce(length(v_motivo), 0) < 5 then
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
         fornecedor_troca_motivo = case when v_sugerido is not null and v_sugerido <> v_fornecedor then v_motivo end,
         forma_pagamento = nullif(p_dados ->> 'forma_pagamento', ''), valor_final = v_total, fatura_id = v_fatura
   where id = p_pedido;
  perform set_config('app.operacao_pedido', '', true);
  return v_fatura;
end;
$$;
revoke all on function public.registrar_compra_pedido(text, jsonb) from public, anon;
grant execute on function public.registrar_compra_pedido(text, jsonb) to authenticated;

-- Recebido: T.I. sempre; Compras só o pedido "Outros" (nada entra no inventário da T.I.)
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
  v_a      jsonb;
  v_n      integer;
  v_criados integer := 0;
  v_local  text := coalesce(nullif(btrim(coalesce(p_dados ->> 'localizacao', '')), ''), 'Almoxarifado T.I.');
  v_forn   text;
  v_papel  text := coalesce(public.meu_papel(), '');
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
        values ('ast-' || gen_random_uuid()::text, btrim(v_a ->> 'tag'), v_i.descricao,
                coalesce(v_i.categoria_ativo, 'hardware'),
                coalesce(nullif(btrim(coalesce(v_i.marca, '')), ''), 'A definir'),
                coalesce(nullif(btrim(coalesce(v_i.modelo, '')), ''), 'A definir'),
                coalesce(nullif(btrim(coalesce(v_a ->> 'serial_number', '')), ''), 'A-PREENCHER-' || v_p.codigo || '-' || v_i.ordem || '-' || v_n),
                'disponivel', v_local,
                jsonb_build_object('numeroNF', coalesce(v_p.numero_nf, ''), 'chaveAcesso44', coalesce(v_p.nf_chave, ''),
                                   'valorCompra', coalesce(v_i.valor_unitario, 0), 'fornecedor', coalesce(v_forn, ''),
                                   'dataAquisicao', coalesce(v_p.data_compra::text, ''), 'dataGarantia', ''),
                v_p.fornecedor_id, p_pedido,
                case when v_i.especificacao is not null then 'Especificação do pedido: ' || v_i.especificacao end);
        v_criados := v_criados + 1;
      end loop;
    elsif v_i.tipo = 'acessorio' and v_i.estoque_item_id is not null then
      insert into public.estoque_movimentos (item_id, tipo, quantidade, motivo, criado_por)
      values (v_i.estoque_item_id, 'entrada', v_i.quantidade, 'Recebido do pedido ' || v_p.codigo, public.meu_colaborador_id());
      if v_i.valor_unitario is not null then
        update public.estoque_itens set valor_unitario = v_i.valor_unitario where id = v_i.estoque_item_id;
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
