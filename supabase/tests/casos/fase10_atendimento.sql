\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set rh '{"sub":"00000000-0000-0000-0000-000000000005","email":"rh@x.test","role":"authenticated"}'
\set anon '{"role":"anon"}'

-- Dados fixos da Fase 10 (como postgres): um chamado de suporte do colaborador
insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id,
  solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome) values
  ('tkt-10', '#X', 'Impressora', 'Mastigando papel', 'suporte', 'Hardware', 'alta', 'aberto', 'emp-colab',
   'Colab', 'colab@x.test', 'A', 'TI');

select harness.rodar('fase10', 'E1 abrir o chamado grava o evento "aberto"', 'ok', null, null,
  $q$select harness.espera($s$select 1 from public.chamado_eventos where chamado_id = 'tkt-10' and tipo = 'aberto'$s$, 1)$q$);

-- Encerrar exige solução registrada
select harness.rodar('fase10', 'R1 resolver por update sem solução é recusado',
  'erro: Para encerrar o chamado, registre a causa e a solução.', :'sup', 'authenticated',
  $q$update public.chamados set status = 'resolvido' where id = 'tkt-10'$q$);
select harness.rodar('fase10', 'R2 colaborador não registra solução', 'bloqueado', :'colab', 'authenticated',
  $q$select public.resolver_chamado('tkt-10', 'hardware', 'Troquei o rolo de tração', 'definitiva')$q$);
select harness.rodar('fase10', 'R3 solução curta demais é recusada',
  'erro: Descreva a solução com pelo menos 10 caracteres.', :'sup', 'authenticated',
  $q$select public.resolver_chamado('tkt-10', 'hardware', 'ok', 'definitiva')$q$);
select harness.rodar('fase10', 'R4 paliativa sem próximo passo é recusada',
  'erro: Solução paliativa: informe o próximo passo.', :'sup', 'authenticated',
  $q$select public.resolver_chamado('tkt-10', 'hardware', 'Limpei o rolo, voltou a puxar', 'paliativa')$q$);
select harness.rodar('fase10', 'R5 causa fora da lista é recusada',
  'erro: new row for relation "chamados" violates check constraint "chk_chamado_resolucao_causa"', :'sup', 'authenticated',
  $q$select public.resolver_chamado('tkt-10', 'magia', 'Troquei o rolo de tração', 'definitiva')$q$);
select harness.rodar('fase10', 'R6 suporte registra a solução: encerra, carimba autor e grava o evento', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.resolver_chamado('tkt-10', 'hardware', 'Troquei o rolo de tração; 20 páginas de teste', 'definitiva', null, 40);
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-10' and status = 'resolvido'
      and resolvido_por = 'emp-sup' and resolvido_em is not null and resolucao_tempo_min = 40$s$, 1);
    perform harness.espera($s$select 1 from public.chamado_eventos where chamado_id = 'tkt-10' and tipo = 'resolvido'
      and detalhe like 'Troquei o rolo%' and autor_id = 'emp-sup'$s$, 1);
  end $x$$q$);
select harness.rodar('fase10', 'R7 admissão continua encerrando pelo processo, sem solução registrada', 'ok', :'sup', 'authenticated',
  $q$select harness.afeta($s$update public.chamados set status = 'resolvido' where id = 'tkt-3'$s$, 1)$q$);

-- Avaliar e reabrir (estado montado dentro de cada cenário; o harness desfaz tudo)
select harness.rodar('fase10', 'V1 quem abriu avalia o chamado encerrado', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
    perform public.resolver_chamado('tkt-10', 'uso', 'Orientei a carregar o papel do lado certo', 'definitiva');
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
    perform public.avaliar_chamado('tkt-10', 5, 'Rápido');
    perform harness.espera($s$select 1 from public.chamado_eventos where chamado_id = 'tkt-10' and tipo = 'avaliado' and para = '5'$s$, 1);
  end $x$$q$);
select harness.rodar('fase10', 'V2 outra pessoa não avalia', 'bloqueado', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.resolver_chamado('tkt-10', 'uso', 'Orientei a carregar o papel do lado certo', 'definitiva');
    perform public.avaliar_chamado('tkt-10', 1);
  end $x$$q$);
select harness.rodar('fase10', 'O1 quem abriu reabre: volta à fila, conta a reabertura, guarda o motivo e posta na conversa', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
    perform public.resolver_chamado('tkt-10', 'hardware', 'Troquei o rolo de tração', 'definitiva');
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
    perform public.reabrir_chamado('tkt-10', 'Voltou a mastigar hoje cedo');
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-10' and status = 'aberto'
      and reaberturas = 1 and resolucao_solucao is null$s$, 1);
    perform harness.espera($s$select 1 from public.chamado_eventos where chamado_id = 'tkt-10' and tipo = 'reaberto'
      and detalhe = 'Voltou a mastigar hoje cedo'$s$, 1);
    perform harness.espera($s$select 1 from public.chamado_mensagens where chamado_id = 'tkt-10' and texto like 'Reaberto:%'$s$, 1);
  end $x$$q$);
select harness.rodar('fase10', 'O2 não reabre chamado que não está encerrado', 'bloqueado', :'colab', 'authenticated',
  $q$select public.reabrir_chamado('tkt-10', 'Ainda com defeito')$q$);

-- Cancelar
select harness.rodar('fase10', 'C1 quem abriu cancela o próprio chamado ainda não atendido', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
    perform public.cancelar_chamado('tkt-10', 'engano');
    perform harness.espera($s$select 1 from public.chamado_eventos where chamado_id = 'tkt-10' and tipo = 'cancelado'$s$, 1);
  end $x$$q$);
select harness.rodar('fase10', 'C2 cancelar por update sem motivo é recusado',
  'erro: Para cancelar o chamado, informe o motivo.', :'sup', 'authenticated',
  $q$update public.chamados set status = 'cancelado' where id = 'tkt-10'$q$);
select harness.rodar('fase10', 'C3 motivo "outro" exige descrição',
  'erro: Motivo "outro": descreva o motivo do cancelamento.', :'sup', 'authenticated',
  $q$select public.cancelar_chamado('tkt-10', 'outro')$q$);
select harness.rodar('fase10', 'C4 colaborador não cancela chamado de outra pessoa', 'bloqueado', :'colab', 'authenticated',
  $q$select public.cancelar_chamado('tkt-2', 'engano')$q$);

-- Histórico automático e leitura
select harness.rodar('fase10', 'H1 trocar técnico, prioridade e "aguardando" gera eventos', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.chamados set tecnico_responsavel_id = 'emp-sup', tecnico_responsavel_nome = 'Sup', prioridade = 'critica',
      status = 'aguardando_terceiro', aguardando_motivo = 'peca' where id = 'tkt-10';
    perform harness.espera($s$select 1 from public.chamado_eventos where chamado_id = 'tkt-10'
      and tipo in ('tecnico', 'prioridade', 'status')$s$, 3);
  end $x$$q$);
select harness.rodar('fase10', 'H2 sair de "aguardando" limpa o motivo', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    update public.chamados set status = 'aguardando_terceiro', aguardando_motivo = 'fornecedor' where id = 'tkt-10';
    update public.chamados set status = 'em_andamento' where id = 'tkt-10';
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-10' and aguardando_motivo is null$s$, 1);
  end $x$$q$);
select harness.rodar('fase10', 'H3 colaborador lê o histórico do próprio chamado, não o de outros', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
    perform harness.espera($s$select 1 from public.chamado_eventos where chamado_id = 'tkt-10'$s$, 1);
    perform harness.espera($s$select 1 from public.chamado_eventos where chamado_id = 'tkt-2'$s$, 0);
  end $x$$q$);
select harness.rodar('fase10', 'H4 ninguém grava evento direto', 'bloqueado', :'sup', 'authenticated',
  $q$insert into public.chamado_eventos (chamado_id, tipo) values ('tkt-10', 'status')$q$);
select harness.rodar('fase10', 'H5 anônimo não lê o histórico', 'bloqueado', :'anon', 'anon',
  $q$select * from public.chamado_eventos$q$);

-- Limpeza: o chamado de teste não pode afetar a contagem dos outros cenários
delete from public.chamado_eventos where chamado_id = 'tkt-10';
delete from public.chamado_mensagens where chamado_id = 'tkt-10';
delete from public.chamados where id = 'tkt-10';
