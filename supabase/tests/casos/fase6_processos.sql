\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set rh '{"sub":"00000000-0000-0000-0000-000000000005","email":"rh@x.test","role":"authenticated"}'
\set anon '{"role":"anon"}'

-- Dados fixos da Fase 6 (como postgres)
insert into public.ativos (id, tag, nome, categoria, marca, modelo, serial_number, status, localizacao_fisica) values
  ('ast-9', '#P9', 'Notebook estoque', 'hardware', 'M', 'X', 'SN9', 'disponivel', 'estoque');
insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id,
  solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome) values
  ('tkt-onb', 'x', 'Admissão Nova', 'd', 'onboarding', 'Onboarding', 'alta', 'aberto', 'emp-rh', 'RH', 'rh@x.test', 'RH', 'RH');
insert into public.chamados (id, codigo, titulo, descricao, tipo, categoria, prioridade, status, solicitante_id,
  solicitante_nome, solicitante_email, solicitante_cargo, solicitante_setor_nome, colaborador_id, offboarding) values
  ('tkt-off6', 'x', 'Desligamento Outro', 'd', 'offboarding', 'Offboarding', 'critica', 'aberto', 'emp-rh', 'RH', 'rh@x.test', 'RH', 'RH',
   'emp-outro', '{"colaboradorId":"emp-outro","checklist":[]}');
insert into public.colaborador_recursos (id, colaborador_id, tipo, nome, identificador) values
  ('rec-1', 'emp-outro', 'conta', 'Google Workspace', 'outro@x.test'),
  ('rec-2', 'emp-outro', 'acessorio', 'Fone de ouvido', null);
insert into public.processo_itens (id, chamado_id, tipo, titulo, ordem) values
  ('i-cad', 'tkt-onb', 'cadastro', 'Cadastrar colaborador', 1),
  ('i-conta', 'tkt-onb', 'conta', 'Google Workspace', 2),
  ('i-equip', 'tkt-onb', 'equipamento', 'Notebook', 3),
  ('i-tarefa', 'tkt-onb', 'tarefa', 'Configurar impressora', 4),
  ('i-termo', 'tkt-onb', 'termo', 'Termo de entrega', 5);
insert into public.processo_itens (id, chamado_id, tipo, titulo, recurso_id, ativo_id, licenca_id, ordem) values
  ('o-conta', 'tkt-off6', 'encerrar_recurso', 'Google Workspace', 'rec-1', null, null, 1),
  ('o-fone', 'tkt-off6', 'encerrar_recurso', 'Fone de ouvido', 'rec-2', null, null, 2),
  ('o-equip', 'tkt-off6', 'devolver_equipamento', 'Notebook outro', null, 'ast-2', null, 3),
  ('o-drive', 'tkt-off6', 'dados_drive', 'Dados do Meu Drive', null, null, null, 4);

-- Catálogo e leitura
select harness.rodar('fase6', 'K1 catálogo inicial com sugestões (M365, Google, Slack, kit)', 'ok', null, null,
  $q$do $x$ begin perform harness.espera($s$select 1 from public.catalogo_itens where sugerido_onboarding$s$, 7);
    perform harness.espera($s$select 1 from public.catalogo_itens where nome in ('Microsoft 365','Google Workspace','Slack')$s$, 3); end $x$$q$);
select harness.rodar('fase6', 'K2 colaborador lê catálogo mas não altera', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin perform harness.espera($s$select 1 from public.catalogo_itens$s$, 10);
    perform harness.afeta($s$update public.catalogo_itens set nome = 'x'$s$, 0); end $x$$q$);
select harness.rodar('fase6', 'K3 RH acompanha o checklist, colaborador não vê', 'ok', :'rh', 'authenticated',
  $q$do $x$ begin perform harness.espera($s$select 1 from public.processo_itens$s$, 9);
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}', true);
    perform harness.espera($s$select 1 from public.processo_itens$s$, 0); end $x$$q$);
select harness.rodar('fase6', 'K4 RH não marca item', 'bloqueado', :'rh', 'authenticated',
  $q$select public.registrar_item_processo('i-tarefa', 'feito', 'x')$q$);
select harness.rodar('fase6', 'K5 anônimo não lê nada', 'bloqueado', :'anon', 'anon',
  $q$select * from public.processo_itens$q$);

-- Onboarding
select harness.rodar('fase6', 'N1 passo antes do cadastro é recusado', 'erro: Faça primeiro o passo "Cadastrar colaborador"', :'sup', 'authenticated',
  $q$select public.registrar_item_processo('i-conta', 'feito', null, '{"identificador":"nova@x.test"}')$q$);
select harness.rodar('fase6', 'N2 onboarding completo: cadastro, conta, notebook, tarefa, quem/quando, auditoria', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.registrar_item_processo('i-cad', 'feito', null, '{"colaborador_id":"emp-outro"}');
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-onb' and colaborador_id = 'emp-outro'$s$, 1);
    perform public.registrar_item_processo('i-conta', 'feito', 'criada', '{"identificador":"outro@x.test"}');
    perform harness.espera($s$select 1 from public.colaborador_recursos r join public.processo_itens i on i.recurso_id = r.id
      where i.id = 'i-conta' and r.identificador = 'outro@x.test' and r.status = 'ativo'$s$, 1);
    perform public.registrar_item_processo('i-equip', 'feito', null, '{"ativo_id":"ast-9"}');
    perform harness.espera($s$select 1 from public.ativos where id = 'ast-9' and custodiante_id = 'emp-outro' and status = 'em_uso'$s$, 1);
    perform harness.espera($s$select 1 from public.historico_custodia where ativo_id = 'ast-9' and data_devolucao is null$s$, 1);
    perform public.registrar_item_processo('i-tarefa', 'feito', 'ok', '{"lembrete_em":"2026-12-01"}');
    perform harness.espera($s$select 1 from public.processo_itens where id = 'i-tarefa' and concluido_por = 'emp-sup' and concluido_em is not null$s$, 1);
    perform harness.espera($s$select 1 from public.lembretes where item_id = 'i-tarefa' and vence_em = '2026-12-01' and criado_por = 'emp-sup'$s$, 1);
    perform harness.espera($s$select 1 from public.processo_eventos where chamado_id = 'tkt-onb' and acao = 'status_feito'$s$, 4);
  end $x$$q$);
select harness.rodar('fase6', 'N3 conta sem login informado é recusada', 'erro: Informe o login, e-mail ou nome do grupo criado', :'sup', 'authenticated',
  $q$do $x$ begin perform public.registrar_item_processo('i-cad', 'feito', null, '{"colaborador_id":"emp-outro"}');
    perform public.registrar_item_processo('i-conta', 'feito', null, '{}'); end $x$$q$);
select harness.rodar('fase6', 'N4 notebook já em uso não pode ser entregue', 'erro: O ativo #P1 não está disponível no estoque', :'sup', 'authenticated',
  $q$do $x$ begin perform public.registrar_item_processo('i-cad', 'feito', null, '{"colaborador_id":"emp-outro"}');
    perform public.registrar_item_processo('i-equip', 'feito', null, '{"ativo_id":"ast-1"}'); end $x$$q$);
select harness.rodar('fase6', 'N5 "não se aplica" exige motivo', 'erro: Informe o motivo para marcar como "não se aplica"', :'sup', 'authenticated',
  $q$select public.registrar_item_processo('i-tarefa', 'nao_se_aplica', null)$q$);
select harness.rodar('fase6', 'N6 passo com efeito no inventário não reabre', 'erro: Este passo já alterou o inventário e não pode ser reaberto. Ajuste pela ficha do colaborador ou do ativo.', :'sup', 'authenticated',
  $q$do $x$ begin perform public.registrar_item_processo('i-cad', 'feito', null, '{"colaborador_id":"emp-outro"}');
    perform public.registrar_item_processo('i-cad', 'pendente', null); end $x$$q$);
select harness.rodar('fase6', 'N7 concluir com pendências é recusado', 'erro: Ainda há 4 passo(s) pendente(s). Conclua ou marque como "não se aplica" com o motivo.', :'sup', 'authenticated',
  $q$select public.concluir_processo('tkt-onb')$q$);
select harness.rodar('fase6', 'N8 concluir onboarding com termo pendente gera lembrete', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.registrar_item_processo('i-cad', 'feito', null, '{"colaborador_id":"emp-outro"}');
    perform public.registrar_item_processo('i-conta', 'feito', null, '{"identificador":"outro@x.test"}');
    perform public.registrar_item_processo('i-equip', 'nao_se_aplica', 'usará equipamento próprio');
    perform public.registrar_item_processo('i-tarefa', 'feito', null);
    perform public.concluir_processo('tkt-onb');
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-onb' and status = 'resolvido'$s$, 1);
    perform harness.espera($s$select 1 from public.lembretes where chamado_id = 'tkt-onb' and titulo like 'Coletar assinatura do termo%'$s$, 1);
  end $x$$q$);

-- Offboarding
select harness.rodar('fase6', 'F1 conta sem destino é recusada', 'erro: Escolha o destino da conta (suspender, excluir, manter, transferir ou outro)', :'sup', 'authenticated',
  $q$select public.registrar_item_processo('o-conta', 'feito', null, '{}')$q$);
select harness.rodar('fase6', 'F2 concluir com itens ainda vinculados é recusado', 'erro: Ainda vinculado ao colaborador: 1 equipamento(s) sob custódia. Inclua esses itens no checklist.', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.registrar_item_processo('o-conta', 'feito', null, '{"destino":"suspender"}');
    perform public.registrar_item_processo('o-fone', 'feito', null, '{"condicao":"bom"}');
    perform public.registrar_item_processo('o-equip', 'nao_se_aplica', 'colaborador não devolveu ainda');
    perform public.registrar_item_processo('o-drive', 'feito', 'Drive para o líder', '{"destino_colaborador_id":"emp-sup","lembrete_em":"2026-12-15"}');
    perform public.concluir_processo('tkt-off6'); end $x$$q$);
select harness.rodar('fase6', 'F3 offboarding completo: conta suspensa, fone devolvido, notebook com avaria vai para manutenção, desligado', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform public.registrar_item_processo('o-conta', 'feito', 'suspensa no admin', '{"destino":"suspender","lembrete_em":"2026-12-10"}');
    perform public.registrar_item_processo('o-fone', 'feito', null, '{"condicao":"bom"}');
    perform public.registrar_item_processo('o-equip', 'feito', 'tela riscada', '{"condicao":"avaria"}');
    perform public.registrar_item_processo('o-drive', 'feito', 'Drive para o líder', '{"destino_colaborador_id":"emp-sup"}');
    perform harness.espera($s$select 1 from public.colaborador_recursos where id = 'rec-1' and status = 'suspenso' and encerrado_por = 'emp-sup'$s$, 1);
    perform harness.espera($s$select 1 from public.colaborador_recursos where id = 'rec-2' and status = 'devolvido'$s$, 1);
    perform harness.espera($s$select 1 from public.ativos where id = 'ast-2' and custodiante_id is null and status = 'manutencao'$s$, 1);
    perform harness.espera($s$select 1 from public.historico_custodia where id = 'h-2' and data_devolucao = current_date and motivo_devolucao like '%avaria%'$s$, 1);
    perform harness.espera($s$select 1 from public.lembretes where chamado_id = 'tkt-off6' and vence_em = '2026-12-10'$s$, 1);
    perform public.concluir_processo('tkt-off6');
    perform harness.espera($s$select 1 from public.colaboradores where id = 'emp-outro' and status = 'desligado'$s$, 1);
    perform harness.espera($s$select 1 from public.chamados where id = 'tkt-off6' and status = 'resolvido'$s$, 1);
  end $x$$q$);
select harness.rodar('fase6', 'F4 item de chamado encerrado não muda mais', 'erro: encerrado', :'sup', 'authenticated',
  $q$do $x$ begin perform public.cancelar_chamado('tkt-off6', 'engano', 'Aberto por engano');
    perform public.registrar_item_processo('o-drive', 'feito', null);
    exception when others then if sqlerrm like 'O chamado #CH-% já foi encerrado' then raise exception 'encerrado'; else raise; end if; end $x$$q$);

-- Termo: aceite eletrônico e dispensa
select harness.rodar('fase6', 'T1 colaborador e TI assinam: termo assinado eletronicamente com hash', 'ok', :'colab', 'authenticated',
  $q$do $x$ declare r jsonb; begin
    r := public.aceitar_termo('tr-1');
    if (r->>'colaborador')::boolean is not true or (r->>'assinado')::boolean then raise exception 'aceite colaborador %', r; end if;
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}', true);
    r := public.aceitar_termo('tr-1');
    if (r->>'assinado')::boolean is not true or length(r->>'hash') <> 64 then raise exception 'aceite TI %', r; end if;
    perform harness.espera($s$select 1 from public.termos_responsabilidade where id = 'tr-1' and forma_assinatura = 'eletronica'
      and aceite_colaborador_uid = '00000000-0000-0000-0000-000000000002' and aceite_ti_por = 'emp-sup'$s$, 1);
  end $x$$q$);
select harness.rodar('fase6', 'T2 outra pessoa não assina termo alheio', 'bloqueado', :'rh', 'authenticated',
  $q$select public.aceitar_termo('tr-1')$q$);
select harness.rodar('fase6', 'T3 aceitar duas vezes', 'erro: Você já aceitou este termo', :'colab', 'authenticated',
  $q$do $x$ begin perform public.aceitar_termo('tr-1'); perform public.aceitar_termo('tr-1'); end $x$$q$);
select harness.rodar('fase6', 'T4 colaborador não dispensa assinatura', 'bloqueado', :'colab', 'authenticated',
  $q$select public.dispensar_assinatura_termo('tr-1', 'x')$q$);
select harness.rodar('fase6', 'T5 TI dispensa com motivo', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin perform public.dispensar_assinatura_termo('tr-2', 'Colaborador não compareceu para assinar');
    perform harness.espera($s$select 1 from public.termos_responsabilidade where id = 'tr-2' and forma_assinatura = 'dispensada'$s$, 1);
  end $x$$q$);
select harness.rodar('fase6', 'T6 configuração traz o modelo RG.TI.002 da Qualidade', 'ok', null, null,
  $q$select harness.espera($s$select 1 from public.configuracoes_empresa where doc_devolucao->>'codigo' = 'RG.TI.002' and doc_devolucao->>'referencia' = 'POP.TI.013'$s$, 1)$q$);
