-- Chamado de suporte encerrado ou cancelado fica só para leitura (sem DROP).
-- Técnico, vínculos, título, categoria e prioridade não mudam depois de encerrar;
-- para mudar, a T.I. ou quem abriu reabre o chamado (reabrir_chamado muda a situação
-- na mesma gravação, por isso passa). A avaliação de quem abriu e as mensagens continuam.

create or replace function public.chamado_encerrado_somente_leitura()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and old.tipo = 'suporte'
     and old.status in ('resolvido', 'cancelado')
     and new.status is not distinct from old.status
     and (new.tecnico_responsavel_id is distinct from old.tecnico_responsavel_id
          or new.ativo_id is distinct from old.ativo_id
          or new.software_id is distinct from old.software_id
          or new.linha_id is distinct from old.linha_id
          or new.colaborador_id is distinct from old.colaborador_id
          or new.titulo is distinct from old.titulo
          or new.categoria is distinct from old.categoria
          or new.prioridade is distinct from old.prioridade) then
    raise exception 'Chamado encerrado não pode ser alterado. Reabra o chamado para mudar algo.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.chamado_encerrado_somente_leitura() from public, anon, authenticated;

create or replace trigger trg_chamado_encerrado_somente_leitura
  before update on public.chamados
  for each row execute function public.chamado_encerrado_somente_leitura();
