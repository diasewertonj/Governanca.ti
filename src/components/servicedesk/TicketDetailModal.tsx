import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { TicketStatus } from '../../types/index.ts';
import { formatDateTime, formatDate, rotuloStatus, rotuloPrioridade } from '../../utils/formatters.ts';
import { linkTemporarioDb, mensagemDeErro } from '../../services/supabaseDb.ts';
import { AlteracoesChamado } from '../../context/AppContext.tsx';
import { BarraAlteracoes, confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { ChecklistProcesso } from '../processos/ChecklistProcesso.tsx';
import { VinculosChamado } from './VinculosChamado.tsx';
import { NewEmployeeModal } from '../collaborators/NewEmployeeModal.tsx';
import { BlocoCancelamento, BlocoResolucao, FormCancelamento, FormResolucao } from './AtendimentoChamado.tsx';
import { imprimirRelatorio } from './relatorioChamado.ts';
import { PrazosChamado, SELO_PRIORIDADE_CHAMADO, SELO_STATUS_CHAMADO } from './SeloSla.tsx';
import { situacaoSla } from '../../utils/sla.ts';
import { PedidoDesligamento } from './PedidoDesligamento.tsx';
import { chamadoEncerrado, podeCancelar, rotuloSituacao, ROTULO_AGUARDANDO } from '../../utils/atendimento.ts';
import type { AguardandoMotivo } from '../../types/index.ts';
import { Printer } from 'lucide-react';
import { ConversaChamado, ProblemaRelatado } from './ConversaChamado.tsx';
import { ROTULO_TIPO_CHAMADO } from '../../utils/conversa.ts';
import { RASCUNHO_VAZIO, ROTULO_VINCULO, mudancasVinculos, type RascunhoVinculos } from '../../utils/vinculos.ts';
import {
  X,
  Lock,
  Send,
  CheckCircle2,
  ExternalLink,
  FileCheck,
  UserPlus,
  ShieldCheck,
} from 'lucide-react';
import { confirmar } from '../ui/dialogo.tsx';
import { BotaoVoltar, Caminho, useNivelNavegacao } from '../ui/navegacao.tsx';

interface TicketDetailModalProps {
  ticketId: string;
  onClose: () => void;
}

export const TicketDetailModal: React.FC<TicketDetailModalProps> = ({ ticketId, onClose }) => {
  const {
    tickets,
    employees,
    departments,
    assets,
    currentUser,
    currentRole,
    processoItens,
    addTicketMessage,
    salvarAlteracoesChamado,
    setSelectedEmployeeIdFor360,
    concluirOffboarding,
    licenses,
    eventosSla,
    prazosSla,
  } = useApp();

  const [newMessageText, setNewMessageText] = useState('');
  // T.I.: a caixa ao lado é, por padrão, o caderno de anotações do atendimento (nota interna)
  const [isInternalNote, setIsInternalNote] = useState(currentRole === 'ti_admin' || currentRole === 'ti_suporte');
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [concluindoOffboarding, setConcluindoOffboarding] = useState(false);
  const [resumoOffboarding, setResumoOffboarding] = useState<string | null>(null);

  // Fase 5: status, técnico e checklist ficam em rascunho até "Salvar alterações"
  const [rascStatus, setRascStatus] = useState<TicketStatus | null>(null);
  const [rascTecnico, setRascTecnico] = useState<string | null>(null);
  const [rascChecklist, setRascChecklist] = useState<Record<string, boolean>>({});
  // Fase 9: vínculos (equipamento, software, colaborador relacionado) também em rascunho
  const [rascVinculos, setRascVinculos] = useState<RascunhoVinculos>(RASCUNHO_VAZIO);
  // Muda a cada "Salvar alterações": recria o bloco de vínculos com os campos recolhidos
  const [salvamentos, setSalvamentos] = useState(0);
  // Fase 10: cadastro do admitido direto pelo chamado de admissão
  const [cadastrandoAdmitido, setCadastrandoAdmitido] = useState(false);
  // Fase 10: motivo da espera (rascunho), registrar solução e cancelar
  const [rascAguardando, setRascAguardando] = useState<AguardandoMotivo | '' | null>(null);
  const [resolvendo, setResolvendo] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const ticket = tickets.find((t) => t.id === ticketId);

  // Técnicos = perfis de TI ativos (antes: quem estava no setor 'dep-1', fixo no código)
  const tecnicosTI = employees.filter(
    (e) => (e.role === 'ti_admin' || e.role === 'ti_suporte') && e.status !== 'desligado'
  );
  const nomeTecnico = (id?: string) => (id ? employees.find((e) => e.id === id)?.nome || 'Técnico' : 'Não atribuído');

  const itensPendentes: string[] = [];
  if (ticket) {
    if (rascStatus !== null && rascStatus !== ticket.status) {
      itensPendentes.push(`Status: ${rotuloStatus(ticket.status)} → ${rotuloStatus(rascStatus)}`);
    }
    if (rascTecnico !== null && rascTecnico !== (ticket.tecnicoResponsavelId || '')) {
      itensPendentes.push(`Técnico: ${nomeTecnico(ticket.tecnicoResponsavelId)} → ${nomeTecnico(rascTecnico || undefined)}`);
    }
    const checklistAlterado = (ticket.offboarding?.checklist || []).filter(
      (i) => i.id in rascChecklist && rascChecklist[i.id] !== i.concluido
    );
    if (checklistAlterado.length > 0) {
      itensPendentes.push(`Checklist: ${checklistAlterado.length} item(ns) marcado(s) ou desmarcado(s)`);
    }
    if (rascAguardando !== null && rascAguardando !== (ticket.aguardandoMotivo || '')) {
      itensPendentes.push(`Aguardando: ${rascAguardando ? ROTULO_AGUARDANDO[rascAguardando] : 'sem motivo'}`);
    }
    for (const campo of mudancasVinculos(ticket, rascVinculos)) {
      const rotulo = (id?: string) => {
        if (!id) return 'nenhum';
        if (campo === 'ativoId') return assets.find((a) => a.id === id)?.tag || 'equipamento';
        if (campo === 'softwareId') return licenses.find((l) => l.id === id)?.nome || ticket.softwareNome || 'software';
        return employees.find((e) => e.id === id)?.nome || 'colaborador';
      };
      itensPendentes.push(
        `${ROTULO_VINCULO[campo]}: ${rotulo(ticket[campo])} → ${rotulo(rascVinculos[campo] || undefined)}`
      );
    }
  }
  useRegistrarPendencias(`chamado:${ticketId}`, itensPendentes);
  // Caminho (seção 8.8): o chamado é um nível como as fichas
  const fecharChamado = () => void confirmarDescarte(itensPendentes).then((ok) => ok && onClose());
  const nav = useNivelNavegacao(ticket ? `Chamado ${ticket.codigo}` : 'Chamado', fecharChamado);

  if (!ticket) return null;
  const temAnterior = nav.noCaminho && nav.indice > 0;

  const encerrado = chamadoEncerrado(ticket);
  const statusExibido = rascStatus ?? ticket.status;
  const tecnicoExibido = rascTecnico ?? (ticket.tecnicoResponsavelId || '');
  const concluidoExibido = (item: { id: string; concluido: boolean }) => rascChecklist[item.id] ?? item.concluido;

  const descartarRascunho = () => {
    setRascStatus(null);
    setRascTecnico(null);
    setRascChecklist({});
    setRascVinculos(RASCUNHO_VAZIO);
    setRascAguardando(null);
  };

  const salvarRascunho = () => {
    const mudancas: AlteracoesChamado = {};
    if (rascStatus !== null && rascStatus !== ticket.status) mudancas.status = rascStatus;
    if (rascTecnico !== null && rascTecnico !== (ticket.tecnicoResponsavelId || '')) mudancas.tecnicoId = rascTecnico;
    const marcados = Object.fromEntries(
      Object.entries(rascChecklist).filter(
        ([id, v]) => ticket.offboarding?.checklist.find((i) => i.id === id)?.concluido !== v
      )
    );
    if (Object.keys(marcados).length > 0) mudancas.checklist = marcados;
    for (const campo of mudancasVinculos(ticket, rascVinculos)) mudancas[campo] = rascVinculos[campo] as string;
    if (rascAguardando !== null && rascAguardando !== (ticket.aguardandoMotivo || '')) mudancas.aguardandoMotivo = rascAguardando;
    salvarAlteracoesChamado(ticket.id, mudancas);
    descartarRascunho();
    setSalvamentos((n) => n + 1);
  };

  const fechar = () => {
    void confirmarDescarte(itensPendentes).then((ok) => ok && onClose());
  };

  // Fase 3: anexos privados abrem por link temporário (5 min).
  // A janela é aberta antes do await para não ser barrada pelo bloqueador de pop-up.
  const abrirAnexo = async (caminhoOuUrl: string) => {
    setErroArquivo(null);
    const janela = window.open('', '_blank');
    try {
      const url = await linkTemporarioDb(caminhoOuUrl);
      if (janela) {
        janela.opener = null;
        janela.location.href = url;
      }
    } catch (err) {
      janela?.close();
      setErroArquivo(`Não foi possível abrir o anexo: ${mensagemDeErro(err)}.`);
    }
  };

  const colaboradorDesligado = ticket.offboarding?.colaboradorId
    ? employees.find((e) => e.id === ticket.offboarding?.colaboradorId)
    : undefined;

  const handleConcluirOffboarding = async () => {
    if (!colaboradorDesligado) return;
    const ok = (await confirmar(
      `Concluir o desligamento de ${colaboradorDesligado.nome}?\n\n` +
        '• Todos os equipamentos voltam ao estoque (custódia fechada hoje)\n' +
        '• Todas as licenças são liberadas\n' +
        '• O acesso ao sistema é encerrado (status "desligado")\n' +
        '• O chamado é resolvido\n\nEssa ação é registrada e não pode ser desfeita pela tela.'
    ));
    if (!ok) return;
    setConcluindoOffboarding(true);
    const resumo = await concluirOffboarding(ticket.id);
    setConcluindoOffboarding(false);
    if (resumo) {
      setResumoOffboarding(
        `Desligamento concluído: ${resumo.ativosDevolvidos} equipamento(s) devolvido(s) ao estoque e ${resumo.licencasLiberadas} licença(s) liberada(s).`
      );
    }
  };

  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';

  const colaboradorDoEmail = ticket.onboarding
    ? employees.find(
        (e) => e.email.toLowerCase() === (ticket.onboarding?.emailColaborador || '').toLowerCase()
      )
    : undefined;
  const isColaboradorJaCadastrado = Boolean(colaboradorDoEmail);

  // Fase 6: chamados antigos de desligamento têm o checklist em JSON (legado);
  // os novos usam o checklist guiado (tabela processo_itens).
  const temChecklistGuiado = processoItens.some((i) => i.chamadoId === ticket.id);
  const usaChecklistLegado =
    ticket.tipo === 'offboarding' && !temChecklistGuiado && (ticket.offboarding?.checklist.length || 0) > 0;

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim()) return;

    addTicketMessage(ticket.id, newMessageText.trim(), isInternalNote);
    setNewMessageText('');
  };

  const handleStatusChange = (newStatus: TicketStatus) => setRascStatus(newStatus);
  const handleTechnicianChange = (techId: string) => setRascTecnico(techId);

  const papelSugerido =
    ticket.onboarding?.papelAcessoSugerido === 'ti_admin'
      ? 'Admin de T.I.'
      : ticket.onboarding?.papelAcessoSugerido === 'ti_suporte'
        ? 'Suporte de T.I.'
        : ticket.onboarding?.papelAcessoSugerido === 'rh'
          ? 'Recursos Humanos (RH)'
          : 'Colaborador Padrão';

  /** Linha "rótulo à esquerda, valor à direita" (igual ao Pedido do RH do desligamento) */
  const linha = (rotulo: string, valor: React.ReactNode) => (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
      <span className="text-slate-500">{rotulo}</span>
      <span className="break-words text-slate-900">{valor}</span>
    </div>
  );

  return (
    <div className={`janela-fundo modal-tela ${nav.topo ? '' : 'hidden'}`}>
      <div role="dialog" aria-modal="true" aria-labelledby={`chamado-titulo-${ticket.id}`} className="janela janela-ficha">
        {/* Cabeçalho fixo: código, tipo, situação, prioridade e título; abaixo, a faixa de ações do atendimento */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            {temAnterior && <BotaoVoltar onClick={fecharChamado} anterior={nav.niveis[nav.indice - 1]?.rotulo} />}
            <span className="font-mono text-xs font-semibold text-slate-700">{ticket.codigo}</span>
            <span className="text-xs text-slate-500">
              · {ROTULO_TIPO_CHAMADO[ticket.tipo]} · {ticket.categoria}
            </span>
            <span className="flex-1" />
            <span className={SELO_STATUS_CHAMADO[ticket.status]}>{rotuloSituacao(ticket)}</span>
            <span className={SELO_PRIORIDADE_CHAMADO[ticket.prioridade]}>
              Prioridade {rotuloPrioridade(ticket.prioridade).toLowerCase()}
            </span>
            <button
              type="button"
              onClick={() =>
                imprimirRelatorio(ticket, employees, isTI, situacaoSla(ticket, eventosSla[ticket.id] || [], prazosSla))
              }
              title="Relatório do chamado (imprimir ou salvar em PDF)"
              className="btn btn-sm btn-secundario"
            >
              <Printer aria-hidden="true" />
              <span className="hidden sm:inline">Relatório</span>
            </button>
            {temAnterior ? (
              <button type="button" onClick={() => void nav.fecharTudo?.()} aria-label="Fechar tudo" title="Fechar tudo" className="btn-icone">
                <X className="!h-5 !w-5" />
              </button>
            ) : (
              <button type="button" onClick={fechar} aria-label="Fechar chamado" title="Fechar" className="btn-icone">
                <X className="!h-5 !w-5" />
              </button>
            )}
          </div>
          {temAnterior && (
            <div className="mt-1">
              <Caminho niveis={nav.niveis} indice={nav.indice} voltarAte={nav.voltarAte} />
            </div>
          )}
          <h2 id={`chamado-titulo-${ticket.id}`} className="tela-titulo mt-1 break-words">
            {ticket.titulo}
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Aberto por {ticket.solicitanteNome} em {formatDateTime(ticket.dataCriacao)} · Técnico:{' '}
            {ticket.tecnicoResponsavelNome || 'não atribuído'}
          </p>
          {/* Ações do atendimento numa faixa compacta do cabeçalho */}
          {isTI && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {encerrado ? (
                <span className="text-slate-600">
                  {ticket.tipo === 'suporte'
                    ? `Chamado ${ticket.status === 'cancelado' ? 'cancelado' : 'encerrado com solução registrada'}. Para continuar, reabra o chamado.`
                    : `Processo ${ticket.status === 'cancelado' ? 'cancelado' : 'concluído'}. Se faltou algo, abra um chamado novo.`}
                </span>
              ) : (
                <>
                  <label className="flex items-center gap-1.5">
                    <span className="text-slate-600">Situação</span>
                    <select
                      value={statusExibido}
                      onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                      className="campo campo-sm w-auto"
                    >
                      <option value="aberto">Aberto (na fila)</option>
                      <option value="em_andamento">Em atendimento</option>
                      <option value="aguardando_terceiro">Aguardando…</option>
                    </select>
                  </label>
                  {statusExibido === 'aguardando_terceiro' && (
                    <select
                      aria-label="Aguardando o quê"
                      value={rascAguardando ?? (ticket.aguardandoMotivo || '')}
                      onChange={(e) => setRascAguardando(e.target.value as AguardandoMotivo | '')}
                      className="campo campo-sm w-auto"
                    >
                      <option value="">Aguardando o quê?</option>
                      <option value="peca">Peça</option>
                      <option value="fornecedor">Fornecedor</option>
                      <option value="solicitante">Resposta do solicitante</option>
                    </select>
                  )}
                </>
              )}
              <label className="flex items-center gap-1.5">
                <span className="text-slate-600">Técnico</span>
                <select
                  value={tecnicoExibido}
                  onChange={(e) => handleTechnicianChange(e.target.value)}
                  className="campo campo-sm w-auto max-w-56"
                >
                  <option value="">Não atribuído...</option>
                  {tecnicosTI.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.nome}
                    </option>
                  ))}
                </select>
              </label>
              {!encerrado && (
                <span className="flex flex-wrap gap-2 sm:ml-auto">
                  {/* Padrão dos rodapés: destrutiva à esquerda, principal (azul) por último */}
                  <button type="button" onClick={() => setCancelando(true)} className="btn btn-sm btn-perigo">
                    {ticket.tipo === 'suporte' ? 'Cancelar chamado' : ticket.tipo === 'onboarding' ? 'Cancelar admissão' : 'Cancelar desligamento'}
                  </button>
                  {ticket.tipo === 'suporte' && (
                    <button type="button" onClick={() => setResolvendo(true)} className="btn btn-sm btn-primario">
                      <CheckCircle2 aria-hidden="true" />
                      Registrar solução
                    </button>
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="sm:max-h-[85vh] sm:overflow-y-auto">
          {/* Solicitante, prazos e vínculos numa faixa acima do conteúdo */}
          <div className="grid grid-cols-1 items-start gap-3 px-4 pt-3 sm:px-5 md:grid-cols-3">
            <section aria-label="Solicitante" className="cartao space-y-3 p-4 text-xs">
              <h3 className="secao-titulo">Solicitante</h3>
              <div className="space-y-0.5">
                {currentRole === 'colaborador' && ticket.solicitanteId !== currentUser?.id ? (
                  <span className="block font-semibold text-slate-900">{ticket.solicitanteNome}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedEmployeeIdFor360(ticket.solicitanteId)}
                    className="link inline-flex items-center gap-1 text-left"
                  >
                    {ticket.solicitanteNome}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </button>
                )}
                <p className="text-slate-600">{[ticket.solicitanteCargo, ticket.solicitanteSetorNome].filter(Boolean).join(' · ')}</p>
                <p className="break-all text-slate-500">{ticket.solicitanteEmail}</p>
                <p className="text-slate-500">Atualizado em {formatDate(ticket.dataAtualizacao)}</p>
              </div>
            </section>
            <PrazosChamado tkt={ticket} />
            <VinculosChamado
              key={salvamentos}
              ticket={ticket}
              rascunho={rascVinculos}
              onMudar={(campo, valor) => setRascVinculos((r) => ({ ...r, [campo]: valor }))}
            />
          </div>

          {/* O pedido, o checklist e a solução ocupam 2/3; anotações e conversa ficam ao lado (1/3) */}
          <div className="mt-3 grid grid-cols-1 gap-0 divide-y divide-slate-200 border-t border-slate-200 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:divide-x lg:divide-y-0">
            <div className="min-w-0 space-y-3 p-4 sm:p-5">
              {/* Desligamento: o pedido organizado, com o que está com a pessoa (só leitura) */}
              {ticket.tipo === 'offboarding' && ticket.offboarding && <PedidoDesligamento ticket={ticket} />}
              {ticket.tipo === 'suporte' && (
                <ProblemaRelatado
                  ticket={ticket}
                  ativo={assets.find((a) => a.id === ticket.ativoId)}
                  onAbrirAnexo={abrirAnexo}
                  erroArquivo={erroArquivo}
                />
              )}
              {/* A solução (ou o cancelamento) logo depois do problema */}
              {ticket.status === 'resolvido' && ticket.resolucao && <BlocoResolucao ticket={ticket} />}
              {ticket.status === 'cancelado' && ticket.cancelamento && <BlocoCancelamento ticket={ticket} />}
              {!isTI && podeCancelar(ticket, currentRole, currentUser?.id) && (
                <div className="text-right">
                  <button type="button" onClick={() => setCancelando(true)} className="btn btn-sm btn-perigo">
                    Não precisa mais? Cancelar chamado
                  </button>
                </div>
              )}

              {/* Checklist interativo (chamados antigos de desligamento) */}
              {usaChecklistLegado && ticket.offboarding && (
                <section aria-label="Checklist operacional de desligamento" className="cartao space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="secao-titulo flex items-center gap-1.5">
                      <FileCheck className="h-4 w-4" aria-hidden="true" />
                      Checklist operacional de desligamento
                    </h3>
                    <span className="text-xs font-semibold whitespace-nowrap text-slate-700">
                      {ticket.offboarding.checklist.filter((c) => concluidoExibido(c)).length}/{ticket.offboarding.checklist.length}{' '}
                      concluídos
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {ticket.offboarding.checklist.map((item) => (
                      <label
                        key={item.id}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 text-xs transition-colors hover:bg-slate-50 ${
                          concluidoExibido(item) ? 'text-slate-500 line-through' : 'text-slate-900'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={concluidoExibido(item)}
                          disabled={!isTI}
                          onChange={() => setRascChecklist((p) => ({ ...p, [item.id]: !concluidoExibido(item) }))}
                          className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="flex-1 leading-tight">{item.texto}</span>
                      </label>
                    ))}
                  </div>

                  {ticket.offboarding.recolhimentoInstrucoes && (
                    <p className="text-xs text-slate-700">
                      <span className="font-semibold">Logística:</span> {ticket.offboarding.recolhimentoInstrucoes}
                    </p>
                  )}

                  {/* Fase 3: conclusão automática (devolve ativos, libera licenças, desliga, resolve) */}
                  {resumoOffboarding && (
                    <span className="selo selo-ok whitespace-normal">
                      <CheckCircle2 aria-hidden="true" />
                      {resumoOffboarding}
                    </span>
                  )}
                  {isTI &&
                    ticket.status !== 'resolvido' &&
                    (colaboradorDesligado ? (
                      <button
                        type="button"
                        onClick={handleConcluirOffboarding}
                        disabled={concluindoOffboarding}
                        className="btn btn-sm btn-primario"
                      >
                        <ShieldCheck aria-hidden="true" />
                        {concluindoOffboarding ? 'Concluindo desligamento...' : `Concluir desligamento de ${colaboradorDesligado.nome}`}
                      </button>
                    ) : (
                      <p className="ajuda">
                        Este chamado foi aberto antes da automação e não identifica o colaborador. Ligue a pessoa em "Vínculos" para poder
                        concluir o desligamento.
                      </p>
                    ))}
                </section>
              )}

              {/* Admissão: o "Pedido do RH" (kit de entrada solicitado), no mesmo formato do desligamento */}
              {ticket.tipo === 'onboarding' && ticket.onboarding && (
                <section aria-label="Pedido do RH" className="cartao space-y-3 p-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="secao-titulo flex items-center gap-1.5">
                      <UserPlus className="h-4 w-4" aria-hidden="true" />
                      Pedido do RH
                    </h3>
                    {isColaboradorJaCadastrado && colaboradorDoEmail?.status !== 'ativo' ? (
                      // Lote 1 (1.13): admissão só se liga a pessoa ativa (mesma regra do banco)
                      <span className="selo selo-atencao">
                        E-mail de pessoa {colaboradorDoEmail?.status === 'desligado' ? 'desligada' : 'de férias'}
                      </span>
                    ) : isColaboradorJaCadastrado ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="selo selo-ok">
                          <CheckCircle2 aria-hidden="true" />
                          Cadastrado no Sistema
                        </span>
                        {/* Fase 10: cadastrado por fora, mas ainda não ligado a este chamado */}
                        {isTI && !ticket.colaboradorId && colaboradorDoEmail && (
                          <button
                            type="button"
                            onClick={() => salvarAlteracoesChamado(ticket.id, { colaboradorId: colaboradorDoEmail.id })}
                            className="link text-xs"
                          >
                            Ligar a este chamado
                          </button>
                        )}
                      </span>
                    ) : isTI && !temChecklistGuiado ? (
                      // Chamados antigos (sem checklist): cadastra a pessoa daqui, com os dados do RH.
                      // Com checklist, o cadastro é o passo "Cadastrar colaborador".
                      <button type="button" onClick={() => setCadastrandoAdmitido(true)} className="btn btn-sm btn-primario">
                        <UserPlus aria-hidden="true" />
                        Cadastrar colaborador
                      </button>
                    ) : (
                      <span className="selo selo-info">Ainda não cadastrado</span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-y-1.5">
                    {linha('Novo colaborador', ticket.onboarding.nomeColaborador)}
                    {linha('Cargo', ticket.onboarding.cargo)}
                    {linha('E-mail', <span className="font-mono">{ticket.onboarding.emailColaborador}</span>)}
                    {linha('Setor', departments.find((d) => d.id === ticket.onboarding?.setorId)?.nome || 'Não definido')}
                    {linha('Início', formatDate(ticket.onboarding.dataAdmissao))}
                    {linha(
                      'Acesso sugerido',
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                        {papelSugerido}
                      </span>
                    )}
                    {/* Só o que o RH escreveu (chamados antigos: o perfil escolhido vira observação) */}
                    {ticket.onboarding.tipoComputador?.trim() && linha('Equipamento', ticket.onboarding.tipoComputador)}
                    {ticket.onboarding.perifericos.length > 0 &&
                      linha(
                        'Periféricos',
                        <span className="flex flex-wrap gap-1.5">
                          {ticket.onboarding.perifericos.map((p, idx) => (
                            <span key={idx} className="selo selo-neutro">
                              {p}
                            </span>
                          ))}
                        </span>
                      )}
                    {ticket.onboarding.acessosSoftwares.length > 0 &&
                      linha(
                        'Acessos e licenças',
                        <span className="flex flex-wrap gap-1.5">
                          {ticket.onboarding.acessosSoftwares.map((a, idx) => (
                            <span key={idx} className="selo selo-neutro">
                              {a}
                            </span>
                          ))}
                        </span>
                      )}
                    {ticket.onboarding.observacoes?.trim() &&
                      linha('Observações', <span className="whitespace-pre-wrap">{ticket.onboarding.observacoes}</span>)}
                  </div>
                </section>
              )}

              {/* Fase 6: checklist guiado (admissão e desligamento) */}
              {(ticket.tipo === 'onboarding' || (ticket.tipo === 'offboarding' && !usaChecklistLegado)) && (
                <ChecklistProcesso ticket={ticket} />
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
              <div className="flex-1">
                {/* Conversa única: a abertura é o 1º item, sem repetir a descrição */}
                <ConversaChamado ticket={ticket} podeVerNotas={isTI} meuId={currentUser?.id} abaInicial={isTI ? 'notas' : 'conversa'} />
              </div>

              {/* Caixa de resposta */}
              {encerrado ? (
                <p className="ajuda border-t border-slate-200 pt-4">
                  Chamado {ticket.status === 'cancelado' ? 'cancelado' : 'encerrado'}: a conversa fica registrada como está.
                  {ticket.status === 'resolvido' && ticket.tipo === 'suporte' && ' Se o problema voltar, reabra o chamado.'}
                </p>
              ) : (
                <form onSubmit={handleSendMessage} className="space-y-2 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor={`resposta-${ticket.id}`} className="rotulo !mb-0">
                      Responder
                    </label>
                    {isTI && (
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700 select-none">
                        <input
                          type="checkbox"
                          checked={isInternalNote}
                          onChange={(e) => setIsInternalNote(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <Lock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                        <span>Nota interna (só a T.I. vê)</span>
                      </label>
                    )}
                  </div>

                  <textarea
                    id={`resposta-${ticket.id}`}
                    rows={3}
                    value={newMessageText}
                    onChange={(e) => setNewMessageText(e.target.value)}
                    placeholder={isInternalNote ? 'Escreva uma nota para a equipe de T.I.…' : 'Escreva uma resposta…'}
                    className="campo"
                  />

                  <div className="flex justify-end">
                    <button type="submit" disabled={!newMessageText.trim()} className="btn btn-primario">
                      <Send aria-hidden="true" />
                      {isInternalNote ? 'Salvar nota' : 'Enviar'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
        <BarraAlteracoes itens={itensPendentes} onCancelar={descartarRascunho} onSalvar={salvarRascunho} />
      </div>
      {resolvendo && <FormResolucao ticket={ticket} onClose={() => setResolvendo(false)} />}
      {cancelando && <FormCancelamento ticket={ticket} onClose={() => setCancelando(false)} />}
      {cadastrandoAdmitido && ticket.onboarding && (
        <NewEmployeeModal
          inicial={{
            nome: ticket.onboarding.nomeColaborador,
            email: ticket.onboarding.emailColaborador,
            cargo: ticket.onboarding.cargo,
            setorId: ticket.onboarding.setorId,
            gestorId: ticket.onboarding.gestorId,
            dataAdmissao: ticket.onboarding.dataAdmissao,
          }}
          onCriado={(id) => salvarAlteracoesChamado(ticket.id, { colaboradorId: id })}
          onClose={() => setCadastrandoAdmitido(false)}
        />
      )}
    </div>
  );
};
