\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set rh '{"sub":"00000000-0000-0000-0000-000000000005","email":"rh@x.test","role":"authenticated"}'
\set semperfil '{"sub":"00000000-0000-0000-0000-000000000006","email":"semperfil@x.test","role":"authenticated"}'
\set anon '{"role":"anon"}'

-- Dados fixos da Fase 3 (como postgres)
insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id,
  solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome, offboarding) values
  ('tkt-off1', 'x', 'Offboarding Colab', 'd', 'offboarding', 'Offboarding', 'critica', 'aberto', 'emp-rh', 'RH', 'rh@x.test', 'RH', 'RH',
   '{"colaboradorId":"emp-colab","dataDesligamento":"2026-11-14","redirecionarEmail":false,"transferirDrive":false,"recolhimentoInstrucoes":"x","checklist":[{"id":"c1","texto":"a","concluido":false,"categoria":"geral"},{"id":"c2","texto":"b","concluido":false,"categoria":"acesso"}]}'),
  ('tkt-off2', 'x', 'Offboarding RH', 'd', 'offboarding', 'Offboarding', 'critica', 'aberto', 'emp-rh', 'RH', 'rh@x.test', 'RH', 'RH',
   '{"colaboradorId":"emp-rh","checklist":[]}');
insert into storage.objects (bucket_id, name) values
  ('documentos', 'usuarios/00000000-0000-0000-0000-000000000002/a.pdf'),
  ('documentos', 'usuarios/00000000-0000-0000-0000-000000000005/b.pdf'),
  ('documentos', 'termos/tr-1/assinado.pdf'),
  ('documentos', 'termos/tr-2/assinado.pdf');

select harness.rodar('fase3', 'S1 bucket privado, 10 MB, só PDF/imagem/texto', 'ok', null, null,
  $q$select harness.espera($s$select 1 from storage.buckets where id = 'documentos' and not public and file_size_limit = 10485760 and 'application/pdf' = any(allowed_mime_types) and not ('text/html' = any(allowed_mime_types))$s$, 1)$q$);
select harness.rodar('fase3', 'S2 colaborador envia anexo na própria pasta', 'ok', :'colab', 'authenticated',
  $q$insert into storage.objects (bucket_id, name) values ('documentos', 'usuarios/00000000-0000-0000-0000-000000000002/novo.png')$q$);
select harness.rodar('fase3', 'S3 colaborador envia na pasta de outra pessoa', 'bloqueado', :'colab', 'authenticated',
  $q$insert into storage.objects (bucket_id, name) values ('documentos', 'usuarios/00000000-0000-0000-0000-000000000005/x.png')$q$);
select harness.rodar('fase3', 'S4 colaborador envia termo assinado', 'bloqueado', :'colab', 'authenticated',
  $q$insert into storage.objects (bucket_id, name) values ('documentos', 'termos/tr-1/falso.pdf')$q$);
select harness.rodar('fase3', 'S5 suporte envia termo assinado', 'ok', :'sup', 'authenticated',
  $q$insert into storage.objects (bucket_id, name) values ('documentos', 'termos/tr-1/scan.pdf')$q$);
select harness.rodar('fase3', 'S6 colaborador lê só o próprio anexo e o próprio termo', 'ok', :'colab', 'authenticated',
  $q$select harness.espera($s$select 1 from storage.objects$s$, 2)$q$);
select harness.rodar('fase3', 'S7 RH lê o próprio anexo e todos os termos', 'ok', :'rh', 'authenticated',
  $q$select harness.espera($s$select 1 from storage.objects$s$, 3)$q$);
select harness.rodar('fase3', 'S8 suporte lê tudo', 'ok', :'sup', 'authenticated',
  $q$select harness.espera($s$select 1 from storage.objects$s$, 4)$q$);
select harness.rodar('fase3', 'S9 sem perfil e anônimo não leem nada', 'ok', :'semperfil', 'authenticated',
  $q$select harness.espera($s$select 1 from storage.objects$s$, 0)$q$);
select harness.rodar('fase3', 'S10 anônimo não lê nada', 'ok', :'anon', 'anon',
  $q$select harness.espera($s$select 1 from storage.objects$s$, 0)$q$);

select harness.rodar('fase3', 'O1 colaborador conclui offboarding', 'bloqueado', :'colab', 'authenticated',
  $q$select public.concluir_offboarding('tkt-off1')$q$);
select harness.rodar('fase3', 'O2 suporte conclui offboarding: devolve, libera, desliga, resolve', 'ok', :'sup', 'authenticated',
  $q$do $x$ declare r jsonb; begin
    update public.licencas_software set colaboradores_ids = '["emp-colab","emp-outro"]', assentos_totais = 5 where id = 'lic-1';
    r := public.concluir_offboarding('tkt-off1');
    if (r->>'ativosDevolvidos')::int <> 1 or (r->>'licencasLiberadas')::int <> 1 then raise exception 'resumo %', r; end if;
    perform harness.espera($s$select 1 from public.ativos where id = 'ast-1' and custodiante_id is null and status = 'disponivel'$s$, 1);
    perform harness.espera($s$select 1 from public.historico_custodia where id = 'h-1' and data_devolucao = current_date$s$, 1);
    perform harness.espera($s$select 1 from public.licencas_software where id = 'lic-1' and colaboradores_ids = '["emp-outro"]'$s$, 1);
    perform harness.espera($s$select 1 from public.colaboradores where id = 'emp-colab' and status = 'desligado'$s$, 1);
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-off1' and status = 'resolvido'
      and not exists (select 1 from jsonb_array_elements(offboarding->'checklist') i where not (i->>'concluido')::boolean)$s$, 1);
  end $x$$q$);
select harness.rodar('fase3', 'O3 concluir duas vezes', 'erro: Este desligamento já foi concluído', :'sup', 'authenticated',
  $q$do $x$ begin perform public.concluir_offboarding('tkt-off1'); perform public.concluir_offboarding('tkt-off1'); end $x$$q$);
select harness.rodar('fase3', 'O4 suporte desliga perfil de gestão (RH)', 'bloqueado', :'sup', 'authenticated',
  $q$select public.concluir_offboarding('tkt-off2')$q$);
select harness.rodar('fase3', 'O5 desligado perde acesso na hora', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin perform public.concluir_offboarding('tkt-off1');
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}', true);
    perform harness.espera($s$select 1 from public.colaboradores$s$, 0); end $x$$q$);

select harness.rodar('fase3', 'L1 suporte anonimiza', 'bloqueado', :'sup', 'authenticated',
  $q$select public.anonimizar_colaborador('emp-outro')$q$);
select harness.rodar('fase3', 'L2 anonimizar colaborador ativo', 'erro: Desligue o colaborador antes de anonimizar', :'admin', 'authenticated',
  $q$select public.anonimizar_colaborador('emp-outro')$q$);
select harness.rodar('fase3', 'L3 admin desliga e anonimiza, trilha preservada', 'ok', :'admin', 'authenticated',
  $q$do $x$ begin
    perform public.concluir_offboarding('tkt-off1');
    perform public.anonimizar_colaborador('emp-colab');
    perform harness.espera($s$select 1 from public.colaboradores where id = 'emp-colab' and nome like 'Titular anonimizado%'
      and email like '%@anonimizado.invalid' and auth_user_id is null and telefone is null$s$, 1);
    perform harness.espera($s$select 1 from public.historico_custodia where colaborador_id = 'emp-colab' and colaborador_nome not like 'Titular%'$s$, 0);
    perform harness.espera($s$select 1 from public.historico_custodia where colaborador_id = 'emp-colab'$s$, 1);
    perform harness.espera($s$select 1 from public.chamado_mensagens where autor_id = 'emp-colab' and autor_nome not like 'Titular%'$s$, 0);
    perform harness.espera($s$select 1 from public.termos_responsabilidade where colaborador_id = 'emp-colab' and colaborador_nome like 'Titular%'$s$, 1);
    perform harness.espera($s$select 1 from public.chamados where solicitante_id = 'emp-colab' and solicitante_email <> 'anonimizado@anonimizado.invalid'$s$, 0);
  end $x$$q$);
