\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'
\set colab '{"sub":"00000000-0000-0000-0000-000000000002","email":"colab@x.test","role":"authenticated"}'
\set sup '{"sub":"00000000-0000-0000-0000-000000000003","email":"sup@x.test","role":"authenticated"}'
\set rh '{"sub":"00000000-0000-0000-0000-000000000005","email":"rh@x.test","role":"authenticated"}'
\set anon '{"role":"anon"}'

-- Dados fixos da Fase 8 (como postgres)
insert into public.ativos (id, tag, nome, categoria, marca, modelo, serial_number, status, localizacao_fisica) values
  ('ast-8', '#P8', 'Monitor estoque', 'periferico', 'M', 'X', 'SN8', 'disponivel', 'estoque');
insert into public.fornecedores (id, nome) values ('forn-1', 'TecFix Assistência'), ('forn-2', 'Sem vínculo');
insert into public.contratos (id, fornecedor_id, tipo, descricao, inicio, fim, valor, periodicidade) values
  ('ct-1', 'forn-1', 'suporte', 'Suporte notebooks', '2026-01-01', '2027-06-30', 900, 'mensal');
insert into public.faturas (id, licenca_id, competencia, valor, vencimento) values
  ('fat-1', 'lic-1', '2026-10-01', 100, '2026-10-10');

-- Leitura e permissões
select harness.rodar('fase8', 'F1 colaborador não lê fornecedores, contratos, faturas nem manutenções', 'ok', :'colab', 'authenticated',
  $q$do $x$ begin
    perform harness.espera($s$select 1 from public.fornecedores$s$, 0);
    perform harness.espera($s$select 1 from public.contratos$s$, 0);
    perform harness.espera($s$select 1 from public.faturas$s$, 0);
    perform harness.espera($s$select 1 from public.manutencoes union all select 1 from public.ativo_baixas union all select 1 from public.ativo_anexos$s$, 0);
  end $x$$q$);
select harness.rodar('fase8', 'F2 RH não lê fornecedores, contratos nem faturas', 'ok', :'rh', 'authenticated',
  $q$do $x$ begin
    perform harness.espera($s$select 1 from public.fornecedores union all select 1 from public.contratos union all select 1 from public.faturas$s$, 0);
  end $x$$q$);
select harness.rodar('fase8', 'F3 anônimo não lê fornecedores', 'bloqueado', :'anon', 'anon',
  $q$select * from public.fornecedores$q$);
select harness.rodar('fase8', 'F4 suporte cadastra fornecedor e o banco carimba a autoria', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.fornecedores (id, nome, criado_por) values ('forn-x', 'Nova Loja', 'emp-admin');
    perform harness.espera($s$select 1 from public.fornecedores where id = 'forn-x' and criado_por = 'emp-sup'$s$, 1);
    perform harness.espera($s$select 1 from public.fornecedores$s$, 3);
  end $x$$q$);
select harness.rodar('fase8', 'F5 suporte não exclui fornecedor', 'ok', :'sup', 'authenticated',
  $q$select harness.afeta($s$delete from public.fornecedores where id = 'forn-2'$s$, 0)$q$);
select harness.rodar('fase8', 'F6 admin exclui fornecedor sem vínculo', 'ok', :'admin', 'authenticated',
  $q$select harness.afeta($s$delete from public.fornecedores where id = 'forn-2'$s$, 1)$q$);
select harness.rodar('fase8', 'F7 fornecedor com contrato não pode ser excluído',
  'erro: update or delete on table "fornecedores" violates foreign key constraint "contratos_fornecedor_id_fkey" on table "contratos"',
  :'admin', 'authenticated',
  $q$delete from public.fornecedores where id = 'forn-1'$q$);
select harness.rodar('fase8', 'F8 nome de fornecedor repetido é recusado',
  'erro: duplicate key value violates unique constraint "uq_fornecedores_nome"', :'sup', 'authenticated',
  $q$insert into public.fornecedores (nome) values ('  tecfix assistência ')$q$);

-- Ativo: observações, fornecedor e lembrete
select harness.rodar('fase8', 'A1 suporte grava observações e fornecedor do ativo', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform harness.afeta($s$update public.ativos set observacoes = 'Tecla com folga', fornecedor_id = 'forn-1' where id = 'ast-1'$s$, 1);
    perform harness.afeta($s$update public.licencas_software set fornecedor_id = 'forn-1' where id = 'lic-1'$s$, 1);
  end $x$$q$);
select harness.rodar('fase8', 'A2 lembrete ligado a ativo e a contrato', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.lembretes (titulo, vence_em, ativo_id) values ('Garantia do #P1 vence', '2026-12-01', 'ast-1');
    insert into public.lembretes (titulo, vence_em, contrato_id) values ('Renovar suporte', '2027-06-01', 'ct-1');
    perform harness.espera($s$select 1 from public.lembretes where ativo_id = 'ast-1' or contrato_id = 'ct-1'$s$, 2);
  end $x$$q$);

-- Contratos
select harness.rodar('fase8', 'C1 item de contrato com ativo e licença ao mesmo tempo é recusado',
  'erro: new row for relation "contrato_itens" violates check constraint "chk_contrato_item_alvo"', :'sup', 'authenticated',
  $q$insert into public.contrato_itens (contrato_id, ativo_id, licenca_id) values ('ct-1', 'ast-1', 'lic-1')$q$);
select harness.rodar('fase8', 'C2 item de contrato sem ativo nem licença é recusado',
  'erro: new row for relation "contrato_itens" violates check constraint "chk_contrato_item_alvo"', :'sup', 'authenticated',
  $q$insert into public.contrato_itens (contrato_id) values ('ct-1')$q$);
select harness.rodar('fase8', 'C3 contrato que termina antes de começar é recusado',
  'erro: new row for relation "contratos" violates check constraint "chk_contrato_periodo"', :'sup', 'authenticated',
  $q$insert into public.contratos (fornecedor_id, tipo, descricao, inicio, fim) values ('forn-1', 'suporte', 'x', '2026-05-01', '2026-04-01')$q$);
select harness.rodar('fase8', 'C4 suporte cobre 2 ativos e 1 licença com o contrato', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.contrato_itens (contrato_id, ativo_id) values ('ct-1', 'ast-1'), ('ct-1', 'ast-2');
    insert into public.contrato_itens (contrato_id, licenca_id) values ('ct-1', 'lic-1');
    perform harness.espera($s$select 1 from public.contrato_itens where contrato_id = 'ct-1'$s$, 3);
  end $x$$q$);

-- Faturas
select harness.rodar('fase8', 'R1 fatura de licença e de contrato ao mesmo tempo é recusada',
  'erro: new row for relation "faturas" violates check constraint "chk_fatura_alvo"', :'sup', 'authenticated',
  $q$insert into public.faturas (licenca_id, contrato_id, competencia, valor, vencimento) values ('lic-1', 'ct-1', '2026-11-01', 1, '2026-11-10')$q$);
select harness.rodar('fase8', 'R2 fatura com valor negativo é recusada',
  'erro: new row for relation "faturas" violates check constraint "faturas_valor_check"', :'sup', 'authenticated',
  $q$insert into public.faturas (licenca_id, competencia, valor, vencimento) values ('lic-1', '2026-11-01', -1, '2026-11-10')$q$);
select harness.rodar('fase8', 'R3 fatura paga sem data de pagamento é recusada',
  'erro: new row for relation "faturas" violates check constraint "chk_fatura_paga"', :'sup', 'authenticated',
  $q$update public.faturas set status = 'paga' where id = 'fat-1'$q$);
select harness.rodar('fase8', 'R4 duas faturas na mesma competência são recusadas',
  'erro: duplicate key value violates unique constraint "uq_fatura_licenca_comp"', :'sup', 'authenticated',
  $q$insert into public.faturas (licenca_id, competencia, valor, vencimento) values ('lic-1', '2026-10-01', 100, '2026-10-10')$q$);
select harness.rodar('fase8', 'R5 competência liberada quando a fatura anterior foi cancelada; pagar com data', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    perform harness.afeta($s$update public.faturas set status = 'cancelada' where id = 'fat-1'$s$, 1);
    insert into public.faturas (id, licenca_id, competencia, valor, vencimento) values ('fat-2', 'lic-1', '2026-10-01', 100, '2026-10-10');
    perform harness.afeta($s$update public.faturas set status = 'paga', pago_em = '2026-10-09' where id = 'fat-2'$s$, 1);
    perform harness.espera($s$select 1 from public.faturas where id = 'fat-2' and criado_por = 'emp-sup'$s$, 1);
  end $x$$q$);
select harness.rodar('fase8', 'R6 competência precisa ser o 1º dia do mês',
  'erro: new row for relation "faturas" violates check constraint "chk_fatura_competencia"', :'sup', 'authenticated',
  $q$insert into public.faturas (contrato_id, competencia, valor, vencimento) values ('ct-1', '2026-11-15', 900, '2026-11-20')$q$);
select harness.rodar('fase8', 'R7 colaborador não lança fatura', 'bloqueado', :'colab', 'authenticated',
  $q$insert into public.faturas (licenca_id, competencia, valor, vencimento) values ('lic-1', '2026-12-01', 1, '2026-12-10')$q$);

-- Manutenção
select harness.rodar('fase8', 'M1 enviar para manutenção muda o status e carimba quem abriu', 'ok', :'sup', 'authenticated',
  $q$do $x$ declare v text; begin
    v := public.abrir_manutencao('ast-1', '{"tipo":"corretiva","descricao":"Tela piscando","fornecedor_id":"forn-1","custo":"980"}');
    perform harness.espera($s$select 1 from public.ativos where id = 'ast-1' and status = 'manutencao' and custodiante_id = 'emp-colab'$s$, 1);
    perform harness.espera($s$select 1 from public.manutencoes where status = 'em_andamento' and criado_por = 'emp-sup' and custo = 980$s$, 1);
  end $x$$q$);
select harness.rodar('fase8', 'M2 concluir devolve o ativo para "em uso" quando está com alguém', 'ok', :'sup', 'authenticated',
  $q$do $x$ declare v text; begin
    v := public.abrir_manutencao('ast-1', '{"descricao":"Tela"}');
    perform public.encerrar_manutencao(v, 'concluida', '{"custo":"1050.50","concluida_em":"2026-11-20"}');
    perform harness.espera($s$select 1 from public.ativos where id = 'ast-1' and status = 'em_uso'$s$, 1);
    perform harness.espera($s$select 1 from public.manutencoes where status = 'concluida' and custo = 1050.50
      and concluida_em = '2026-11-20' and encerrado_por = 'emp-sup' and encerrado_em is not null$s$, 1);
  end $x$$q$);
select harness.rodar('fase8', 'M3 cancelar devolve o ativo para "disponível" quando está no estoque', 'ok', :'sup', 'authenticated',
  $q$do $x$ declare v text; begin
    v := public.abrir_manutencao('ast-8', '{"tipo":"preventiva","descricao":"Limpeza"}');
    perform public.encerrar_manutencao(v, 'cancelada');
    perform harness.espera($s$select 1 from public.ativos where id = 'ast-8' and status = 'disponivel'$s$, 1);
    perform harness.espera($s$select 1 from public.manutencoes where id = '$s$ || v || $s$' and concluida_em is null$s$, 1);
  end $x$$q$);
select harness.rodar('fase8', 'M4 segunda manutenção aberta no mesmo ativo é recusada', 'erro: O ativo #P1 já está em manutenção', :'sup', 'authenticated',
  $q$do $x$ declare v text; begin
    v := public.abrir_manutencao('ast-1', '{"descricao":"a"}');
    v := public.abrir_manutencao('ast-1', '{"descricao":"b"}');
  end $x$$q$);
select harness.rodar('fase8', 'M5 custo negativo é recusado',
  'erro: new row for relation "manutencoes" violates check constraint "manutencoes_custo_check"', :'sup', 'authenticated',
  $q$select public.abrir_manutencao('ast-8', '{"descricao":"x","custo":"-1"}')$q$);
select harness.rodar('fase8', 'M6 colaborador não envia para manutenção', 'bloqueado', :'colab', 'authenticated',
  $q$select public.abrir_manutencao('ast-1', '{"descricao":"x"}')$q$);
select harness.rodar('fase8', 'M7 manutenção encerrada não é encerrada de novo', 'erro: Esta manutenção já foi encerrada', :'sup', 'authenticated',
  $q$do $x$ declare v text; begin
    v := public.abrir_manutencao('ast-8', '{"descricao":"x"}');
    perform public.encerrar_manutencao(v, 'concluida');
    perform public.encerrar_manutencao(v, 'cancelada');
  end $x$$q$);
select harness.rodar('fase8', 'M8 manutenção já feita (histórico) não muda o status do ativo', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into public.manutencoes (ativo_id, tipo, descricao, aberta_em, concluida_em, custo, status)
    values ('ast-2', 'upgrade', 'SSD 1 TB', '2026-03-01', '2026-03-02', 400, 'concluida');
    perform harness.espera($s$select 1 from public.ativos where id = 'ast-2' and status = 'em_uso'$s$, 1);
  end $x$$q$);
select harness.rodar('fase8', 'M9 descrição vazia é recusada', 'erro: Descreva o problema ou o serviço', :'sup', 'authenticated',
  $q$select public.abrir_manutencao('ast-8', '{"descricao":"  "}')$q$);

-- Baixa patrimonial
select harness.rodar('fase8', 'B1 suporte não dá baixa', 'bloqueado', :'sup', 'authenticated',
  $q$select public.baixar_ativo('ast-8', '{"motivo":"obsoleto","destino":"reciclagem"}')$q$);
select harness.rodar('fase8', 'B2 baixa sem motivo ou destino é recusada', 'erro: Informe o motivo e o destino da baixa', :'admin', 'authenticated',
  $q$select public.baixar_ativo('ast-8', '{"motivo":"obsoleto"}')$q$);
select harness.rodar('fase8', 'B3 ativo com colaborador não é baixado por defeito',
  'erro: O ativo #P1 está com um colaborador. Registre a devolução antes da baixa', :'admin', 'authenticated',
  $q$select public.baixar_ativo('ast-1', '{"motivo":"defeito","destino":"descarte"}')$q$);
select harness.rodar('fase8', 'B4 roubo encerra a custódia, baixa o ativo e guarda o histórico', 'ok', :'admin', 'authenticated',
  $q$do $x$ declare v text; begin
    v := public.baixar_ativo('ast-1', '{"motivo":"roubo_furto","destino":"nao_se_aplica","documento":"BO 123/2026"}');
    perform harness.espera($s$select 1 from public.ativos where id = 'ast-1' and status = 'descartado' and custodiante_id is null$s$, 1);
    perform harness.espera($s$select 1 from public.historico_custodia where id = 'h-1' and data_devolucao = current_date
      and motivo_devolucao = 'Baixa patrimonial: roubo ou furto'$s$, 1);
    perform harness.espera($s$select 1 from public.ativo_baixas where ativo_id = 'ast-1' and criado_por = 'emp-admin' and documento = 'BO 123/2026'$s$, 1);
  end $x$$q$);
select harness.rodar('fase8', 'B5 ativo com manutenção em andamento não é baixado',
  'erro: Conclua ou cancele a manutenção em andamento do ativo #P8 antes da baixa', :'admin', 'authenticated',
  $q$do $x$ declare v text; begin
    v := public.abrir_manutencao('ast-8', '{"descricao":"x"}');
    v := public.baixar_ativo('ast-8', '{"motivo":"obsoleto","destino":"reciclagem"}');
  end $x$$q$);
select harness.rodar('fase8', 'B6 UPDATE direto para "descartado" é recusado', 'erro: Use "Dar baixa" para baixar o ativo #P8', :'admin', 'authenticated',
  $q$update public.ativos set status = 'descartado' where id = 'ast-8'$q$);
select harness.rodar('fase8', 'B7 ativo baixado não pode ser alterado nem transferido',
  'erro: O ativo #P8 está baixado. Para alterá-lo, estorne a baixa', :'admin', 'authenticated',
  $q$do $x$ declare v text; begin
    v := public.baixar_ativo('ast-8', '{"motivo":"obsoleto","destino":"reciclagem","destinatario":"EcoTech"}');
    update public.ativos set status = 'em_uso', custodiante_id = 'emp-outro' where id = 'ast-8';
  end $x$$q$);
select harness.rodar('fase8', 'B8 registro de baixa não pode ser apagado',
  'erro: O registro de baixa faz parte do histórico e não pode ser apagado', :'admin', 'authenticated',
  $q$do $x$ declare v text; begin
    v := public.baixar_ativo('ast-8', '{"motivo":"obsoleto","destino":"reciclagem"}');
    delete from public.ativo_baixas where id = v;
  end $x$$q$);
select harness.rodar('fase8', 'B9 registro de baixa não é alterado fora do estorno', 'erro: A baixa só pode ser alterada pelo estorno', :'admin', 'authenticated',
  $q$do $x$ declare v text; begin
    v := public.baixar_ativo('ast-8', '{"motivo":"obsoleto","destino":"reciclagem"}');
    update public.ativo_baixas set estornada_em = now() where id = v;
  end $x$$q$);
select harness.rodar('fase8', 'B10 ativo baixado não pode ser excluído',
  'erro: update or delete on table "ativos" violates foreign key constraint "ativo_baixas_ativo_id_fkey" on table "ativo_baixas"',
  :'admin', 'authenticated',
  $q$do $x$ declare v text; begin
    v := public.baixar_ativo('ast-8', '{"motivo":"obsoleto","destino":"reciclagem"}');
    delete from public.ativos where id = 'ast-8';
  end $x$$q$);
select harness.rodar('fase8', 'B11 suporte não estorna baixa', 'bloqueado', :'sup', 'authenticated',
  $q$select public.estornar_baixa('x', 'engano')$q$);
select harness.rodar('fase8', 'B12 estorno volta o ativo ao estoque, mantém o registro e permite nova baixa', 'ok', :'admin', 'authenticated',
  $q$do $x$ declare v text; v2 text; begin
    v := public.baixar_ativo('ast-8', '{"motivo":"obsoleto","destino":"reciclagem"}');
    perform public.estornar_baixa(v, 'Baixa no ativo errado');
    perform harness.espera($s$select 1 from public.ativos where id = 'ast-8' and status = 'disponivel'$s$, 1);
    perform harness.espera($s$select 1 from public.ativo_baixas where estornada_em is not null and estornada_por = 'emp-admin'
      and motivo_estorno = 'Baixa no ativo errado'$s$, 1);
    v2 := public.baixar_ativo('ast-8', '{"motivo":"defeito","destino":"venda","valor_venda":"50"}');
    perform harness.espera($s$select 1 from public.ativo_baixas where ativo_id = 'ast-8'$s$, 2);
  end $x$$q$);
select harness.rodar('fase8', 'B13 valor de venda só quando o destino é venda',
  'erro: new row for relation "ativo_baixas" violates check constraint "chk_baixa_venda"', :'admin', 'authenticated',
  $q$select public.baixar_ativo('ast-8', '{"motivo":"obsoleto","destino":"doacao","valor_venda":"10"}')$q$);
select harness.rodar('fase8', 'B14 ativo não é cadastrado já baixado', 'erro: Cadastre o ativo e use "Dar baixa" para baixá-lo', :'admin', 'authenticated',
  $q$insert into public.ativos (id, tag, nome, categoria, marca, modelo, serial_number, status, localizacao_fisica)
     values ('ast-z', '#PZ', 'x', 'hardware', 'M', 'X', 'SNZ', 'descartado', 'x')$q$);

-- Anexos e arquivos
select harness.rodar('fase8', 'S1 suporte anexa nota fiscal ao ativo (arquivo e registro)', 'ok', :'sup', 'authenticated',
  $q$do $x$ begin
    insert into storage.objects (bucket_id, name) values ('documentos', 'ativos/ast-2/nf.pdf'), ('documentos', 'faturas/fat-1/inv.pdf');
    insert into public.ativo_anexos (ativo_id, categoria, nome, caminho) values ('ast-2', 'nota_fiscal', 'nf.pdf', 'ativos/ast-2/nf.pdf');
    perform harness.espera($s$select 1 from public.ativo_anexos where criado_por = 'emp-sup'$s$, 1);
  end $x$$q$);
select harness.rodar('fase8', 'S2 colaborador não envia arquivo para a pasta de ativos', 'bloqueado', :'colab', 'authenticated',
  $q$insert into storage.objects (bucket_id, name) values ('documentos', 'ativos/ast-1/x.pdf')$q$);
select harness.rodar('fase8', 'S3 RH não envia arquivo para a pasta de faturas', 'bloqueado', :'rh', 'authenticated',
  $q$insert into storage.objects (bucket_id, name) values ('documentos', 'faturas/fat-1/x.pdf')$q$);
