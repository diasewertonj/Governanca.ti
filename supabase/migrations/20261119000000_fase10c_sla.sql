-- Fase 10 · Parte C1 · Prazos de atendimento (SLA)
-- O banco carimba a 1ª resposta da T.I.; os prazos por prioridade ficam na
-- configuração da empresa. O cálculo em horário comercial (e as pausas de
-- "aguardando", vindas do histórico) é feito na tela.
-- Reexecutável e sem DROP.

alter table public.chamados
  add column if not exists primeira_resposta_em timestamptz;

-- Prazos em minutos úteis por prioridade; null = padrão do sistema
alter table public.configuracoes_empresa
  add column if not exists sla jsonb;

-- 1ª resposta: a T.I. assume (técnico), muda a situação ou encerra
create or replace function public.carimbar_primeira_resposta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.primeira_resposta_em is null
     and coalesce(public.meu_papel(), '') in ('ti_admin', 'ti_suporte')
     and (new.status is distinct from old.status
          or new.tecnico_responsavel_id is distinct from old.tecnico_responsavel_id) then
    new.primeira_resposta_em := now();
  end if;
  return new;
end;
$$;

revoke all on function public.carimbar_primeira_resposta() from public, anon, authenticated;

create or replace trigger trg_primeira_resposta_chamado
  before update on public.chamados
  for each row execute function public.carimbar_primeira_resposta();

-- 1ª resposta também quando a T.I. responde na conversa (nota interna não conta)
create or replace function public.carimbar_resposta_mensagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.eh_nota_interna and new.autor_papel in ('ti_admin', 'ti_suporte') then
    update public.chamados
       set primeira_resposta_em = now()
     where id = new.chamado_id and primeira_resposta_em is null;
  end if;
  return new;
end;
$$;

revoke all on function public.carimbar_resposta_mensagem() from public, anon, authenticated;

create or replace trigger trg_resposta_mensagem_chamado
  after insert on public.chamado_mensagens
  for each row execute function public.carimbar_resposta_mensagem();
