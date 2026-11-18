-- Números do Financeiro (seção 10.3 da documentação). Sem DROP.
-- A fatura guarda o valor lançado (valor) e, à parte, o valor efetivamente pago quando
-- difere (juros, multa, desconto). Desfazer o pagamento limpa o valor pago e a fatura
-- volta a "a pagar" com o valor original.

alter table public.faturas
  add column if not exists valor_pago numeric(12,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_fatura_valor_pago') then
    alter table public.faturas add constraint chk_fatura_valor_pago
      check (valor_pago is null or (valor_pago >= 0 and status = 'paga'));
  end if;
end $$;

create or replace function public.desfazer_pagamento(p_fatura text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') <> 'ti_admin' then
    raise exception 'Só o administrador desfaz um pagamento' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo (mínimo 5 caracteres)' using errcode = '23514';
  end if;
  perform set_config('app.desfazer_pagamento', 'sim', true);
  update public.faturas set status = 'a_pagar', pago_em = null, valor_pago = null, estorno_motivo = btrim(p_motivo)
   where id = p_fatura and status = 'paga';
  if not found then
    raise exception 'Fatura não está paga' using errcode = 'P0002';
  end if;
  perform set_config('app.desfazer_pagamento', '', true);
end;
$$;
revoke all on function public.desfazer_pagamento(text, text) from public, anon;
grant execute on function public.desfazer_pagamento(text, text) to authenticated;
