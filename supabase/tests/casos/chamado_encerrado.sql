\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'

-- tkt-2 (suporte) encerrado só durante cada teste
select harness.rodar('encerrado', 'E1 encerrado: técnico não muda',
  'erro: Chamado encerrado não pode ser alterado. Reabra o chamado para mudar algo.', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.chamados set status = 'cancelado', cancelamento_motivo = 'engano', cancelamento_detalhe = 'teste' where id = 'tkt-2';
    update public.chamados set tecnico_responsavel_id = 'emp-sup', tecnico_responsavel_nome = 'Sup' where id = 'tkt-2';
  end $x$$q$);
select harness.rodar('encerrado', 'E2 encerrado: vínculo de equipamento não muda',
  'erro: Chamado encerrado não pode ser alterado. Reabra o chamado para mudar algo.', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.chamados set status = 'cancelado', cancelamento_motivo = 'engano', cancelamento_detalhe = 'teste' where id = 'tkt-2';
    update public.chamados set ativo_id = 'ast-2' where id = 'tkt-2';
  end $x$$q$);
select harness.rodar('encerrado', 'E3 chamado aberto continua editável', 'ok', :'sup', 'authenticated',
  $q$select harness.afeta($s$update public.chamados set ativo_id = 'ast-2' where id = 'tkt-2'$s$, 1)$q$);
