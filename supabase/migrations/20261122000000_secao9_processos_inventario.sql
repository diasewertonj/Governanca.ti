-- ==============================================================================
-- Seção 9 · Processos, inventário e cadastro de equipamentos (17/11/2026)
-- Pequena e sem DROP. Pode rodar mais de uma vez.
--  1. Anotações fixas do processo (admissão/desligamento), visíveis depois de concluir
--  2. Motivo de liberar um assento, no histórico de assentos
--  3. O que exige termo de responsabilidade (configurável em Configurações › Empresa)
--  4. liberar_assento: libera o assento e grava o motivo numa transação
-- Especificações, Service Tag, IMEI e MAC usam os campos atuais do ativo (custom_fields).
-- ==============================================================================

-- 1. Anotações do processo -----------------------------------------------------------
alter table public.chamados add column if not exists anotacoes_processo text;
comment on column public.chamados.anotacoes_processo is
  'Seção 9.2: anotações fixas da T.I. no processo (admissão/desligamento). A RLS de chamados já limita quem grava.';

-- 2. Motivo da liberação do assento ------------------------------------------------------
alter table public.licenca_atribuicoes add column if not exists motivo_remocao text;
comment on column public.licenca_atribuicoes.motivo_remocao is
  'Seção 9.1: motivo informado ao liberar o assento (desligamento, troca de licença, não usa mais, outro).';

-- 3. Itens que exigem termo ----------------------------------------------------------------
alter table public.configuracoes_empresa add column if not exists termo_exige jsonb;
comment on column public.configuracoes_empresa.termo_exige is
  'Seção 9.5: {"computador":true,"celular":true,"monitor":true}. Vazio = os três.';

-- 4. Liberar assento com motivo --------------------------------------------------------
-- revogar_licenca (Fase 2) continua igual; esta função a chama e grava o motivo
-- na linha do histórico que o gatilho acabou de fechar. SECURITY DEFINER só para
-- gravar o motivo (o histórico não aceita UPDATE de quem está logado).
create or replace function public.liberar_assento(p_licenca text, p_colaborador text, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids    jsonb;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') not in ('ti_admin', 'ti_suporte') then
    raise exception 'Apenas a T.I. gerencia assentos de licença' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'Informe o motivo para liberar o assento' using errcode = '23514';
  end if;

  v_ids := public.revogar_licenca(p_licenca, p_colaborador);

  update public.licenca_atribuicoes
     set motivo_remocao = v_motivo
   where id = (
     select a.id from public.licenca_atribuicoes a
      where a.licenca_id = p_licenca and a.colaborador_id = p_colaborador and a.fim is not null
      order by a.fim desc
      limit 1
   );
  return v_ids;
end;
$$;

revoke all on function public.liberar_assento(text, text, text) from public, anon;
grant execute on function public.liberar_assento(text, text, text) to authenticated;
