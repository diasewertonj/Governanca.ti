import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { TicketStatus } from '../../types/index.ts';
import { formatDateTime, formatDate, rotuloStatus, rotuloPrioridade } from '../../utils/formatters.ts';
import { linkTemporarioDb, mensagemDeErro } from '../../services/supabaseDb.ts';
import { AlteracoesChamado } from '../../context/AppContext.tsx';
import { BarraAlteracoes, confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { ChecklistProcesso } from '../processos/ChecklistProcesso.tsx';
import {
  X,
  Lock,
  Send,
  CheckCircle2,
  ExternalLink,
  FileCheck,
  Paperclip,
  UserPlus,
  ShieldCheck,
  Key,
} from 'lucide-react';

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
    setSelectedAssetIdFor360,
    setSelectedSoftwareIdFor360,
    setSelectedEmployeeIdFor360,
    concluirOffboarding,
  } = useApp();

  const [newMessageText, setNewMessageText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [concluindoOffboarding, setConcluindoOffboarding] = useState(false);
  const [resumoOffboarding, setResumoOffboarding] = useState<string | null>(null);

  // Fase 5: status, técnico e checklist ficam em rascunho até "Salvar alterações"
  const [rascStatus, setRascStatus] = useState<TicketStatus | null>(null);
  const [rascTecnico, setRascTecnico] = useState<string | null>(null);
  const [rascChecklist, setRascChecklist] = useState<Record<string, boolean>>({});

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
  }
  useRegistrarPendencias(`chamado:${ticketId}`, itensPendentes);

  if (!ticket) return null;

  const statusExibido = rascStatus ?? ticket.status;
  const tecnicoExibido = rascTecnico ?? (ticket.tecnicoResponsavelId || '');
  const concluidoExibido = (item: { id: string; concluido: boolean }) => rascChecklist[item.id] ?? item.concluido;

  const descartarRascunho = () => {
    setRascStatus(null);
    setRascTecnico(null);
    setRascChecklist({});
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
    salvarAlteracoesChamado(ticket.id, mudancas);
    descartarRascunho();
  };

  const fechar = () => {
    if (confirmarDescarte(itensPendentes)) onClose();
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
    const ok = window.confirm(
      `Concluir o desligamento de ${colaboradorDesligado.nome}?\n\n` +
        '• Todos os equipamentos voltam ao estoque (custódia fechada hoje)\n' +
        '• Todas as licenças são liberadas\n' +
        '• O acesso ao sistema é encerrado (status "desligado")\n' +
        '• O chamado é resolvido\n\nEssa ação é registrada e não pode ser desfeita pela tela.'
    );
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

  const linkedAsset = assets.find((a) => a.id === ticket.ativoId);
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';

  const isColaboradorJaCadastrado = ticket.onboarding
    ? employees.some(
        (e) =>
          e.email.toLowerCase() ===
          (ticket.onboarding?.emailColaborador || '').toLowerCase()
      )
    : false;

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

  const statusColors = {
    aberto: 'text-blue-700 bg-blue-50 border-blue-200',
    em_andamento: 'text-amber-700 bg-amber-50 border-amber-200',
    aguardando_terceiro: 'text-purple-700 bg-purple-50 border-purple-200',
    resolvido: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    cancelado: 'text-slate-500 bg-slate-100 border-slate-200',
  }[ticket.status];

  const priorityColors = {
    baixa: 'text-slate-600 bg-slate-100',
    media: 'text-blue-700 bg-blue-50',
    alta: 'text-amber-700 bg-amber-50',
    critica: 'text-rose-700 bg-rose-50 font-bold',
  }[ticket.prioridade];

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto overscroll-contain modal-tela">
      <div className="relative w-full max-w-4xl bg-white rounded-none sm:rounded-xl min-h-[100dvh] sm:min-h-0 shadow-2xl border border-slate-200 sm:overflow-hidden my-0 sm:my-6">
        {/* Barra Superior */}
        {/* Fase 7: no celular o cabeçalho quebra em duas linhas (etiquetas em cima, título embaixo) */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50">
          <span className="font-mono text-xs font-bold text-slate-800 bg-white px-2.5 py-1 rounded border border-slate-200">
            {ticket.codigo}
          </span>
          <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1 min-w-0">
            <h2 className="text-base sm:text-sm font-semibold text-slate-900 leading-tight">{ticket.titulo}</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Aberto em {formatDateTime(ticket.dataCriacao)} por {ticket.solicitanteNome}
            </p>
          </div>
          <span className={`text-xs px-2.5 py-0.5 rounded-md font-medium border ${statusColors}`}>
            {rotuloStatus(ticket.status)}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-md ${priorityColors}`}>
            Prioridade {rotuloPrioridade(ticket.prioridade).toLowerCase()}
          </span>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar chamado"
            className="ml-auto sm:ml-0 p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Chamado em 2 Colunas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 sm:max-h-[75vh] sm:overflow-y-auto">
          {/* Coluna Principal: Conversas e Linha do Tempo */}
          <div className="lg:col-span-2 p-4 sm:p-6 space-y-6 flex flex-col justify-between">
            <div className="space-y-5">
              {/* Descrição Inicial do Chamado */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">Relato Inicial do Solicitante</span>
                  <span>{formatDateTime(ticket.dataCriacao)}</span>
                </div>
                <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {ticket.descricao}
                </p>

                {ticket.anexos && ticket.anexos.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 mt-2 space-y-1">
                    <span className="text-xs text-slate-500 uppercase font-semibold block">Anexos</span>
                    {erroArquivo && <p className="text-xs text-rose-700">{erroArquivo}</p>}
                    <div className="flex flex-wrap gap-2">
                      {ticket.anexos.map((att) => (
                        <button
                          type="button"
                          key={att.id}
                          onClick={() => abrirAnexo(att.caminho || att.url)}
                          className="flex items-center gap-1.5 text-xs text-blue-700 bg-white border border-slate-200 px-2.5 py-1 rounded hover:bg-blue-50 transition-colors"
                        >
                          <Paperclip className="w-3 h-3 text-slate-500" />
                          <span>{att.nome}</span>
                          <span className="text-xs text-slate-500">({att.tamanho})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Checklist Interativo Técnico para Offboarding */}
              {usaChecklistLegado && ticket.offboarding && (
                <div className="border border-amber-200 bg-amber-50/40 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-amber-200">
                    <div className="flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-amber-700" />
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                        Checklist Operacional de Desligamento (Persistido)
                      </h4>
                    </div>
                    <span className="text-xs font-semibold text-amber-800">
                      {ticket.offboarding.checklist.filter((c) => concluidoExibido(c)).length}/
                      {ticket.offboarding.checklist.length} concluídos
                    </span>
                  </div>

                  <div className="space-y-2">
                    {ticket.offboarding.checklist.map((item) => (
                      <label
                        key={item.id}
                        className={`flex items-start gap-2.5 p-2 rounded cursor-pointer transition-colors text-xs ${
                          concluidoExibido(item) ? 'bg-amber-100/60 line-through text-slate-500' : 'bg-white text-slate-800 hover:bg-amber-50'
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
                    <div className="text-xs text-amber-900 bg-white/80 p-2 rounded border border-amber-200">
                      <span className="font-semibold">Logística:</span> {ticket.offboarding.recolhimentoInstrucoes}
                    </div>
                  )}

                  {/* Fase 3: conclusão automática (devolve ativos, libera licenças, desliga, resolve) */}
                  {resumoOffboarding && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{resumoOffboarding}</span>
                    </div>
                  )}
                  {isTI && ticket.status !== 'resolvido' && (
                    colaboradorDesligado ? (
                      <button
                        type="button"
                        onClick={handleConcluirOffboarding}
                        disabled={concluindoOffboarding}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        {concluindoOffboarding
                          ? 'Concluindo desligamento...'
                          : `Concluir desligamento de ${colaboradorDesligado.nome}`}
                      </button>
                    ) : (
                      <p className="text-xs text-amber-800">
                        Este chamado foi aberto antes da automação e não identifica o colaborador: conclua o checklist manualmente.
                      </p>
                    )
                  )}
                </div>
              )}

              {/* Painel Estruturado de Onboarding (Kit de Entrada Solicitado pelo RH) */}
              {ticket.tipo === 'onboarding' && ticket.onboarding && (
                <div className="border border-blue-200 bg-blue-50/40 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-blue-200">
                    <div className="flex items-center gap-1.5">
                      <UserPlus className="w-4 h-4 text-blue-700" />
                      <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wide">
                        Pacote de Admissão Solicitado pelo RH (Kit de Entrada)
                      </h4>
                    </div>
                    {isColaboradorJaCadastrado ? (
                      <span className="text-xs font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Cadastrado no Sistema
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                        Ainda não cadastrado
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-white p-3 rounded border border-blue-200/80">
                    <div>
                      <span className="text-xs uppercase font-bold text-slate-500 block">Novo Colaborador</span>
                      <span className="font-semibold text-slate-900 block">{ticket.onboarding.nomeColaborador}</span>
                      <span className="text-slate-600 text-xs block">{ticket.onboarding.cargo}</span>
                      <span className="text-slate-500 font-mono text-xs block">{ticket.onboarding.emailColaborador}</span>
                    </div>

                    <div>
                      <span className="text-xs uppercase font-bold text-slate-500 block">Setor & Início</span>
                      <span className="text-slate-800 font-medium block">
                        Setor: {departments.find((d) => d.id === ticket.onboarding?.setorId)?.nome || 'Não definido'}
                      </span>
                      <span className="text-slate-600 text-xs block">
                        Início: {formatDate(ticket.onboarding.dataAdmissao)}
                      </span>
                      <div className="mt-1 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-xs font-semibold text-blue-900">
                          Acesso sugerido: {
                            ticket.onboarding.papelAcessoSugerido === 'ti_admin'
                              ? 'Admin de T.I.'
                              : ticket.onboarding.papelAcessoSugerido === 'ti_suporte'
                              ? 'Suporte de T.I.'
                              : ticket.onboarding.papelAcessoSugerido === 'rh'
                              ? 'Recursos Humanos (RH)'
                              : 'Colaborador Padrão'
                          }
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="bg-white p-2.5 rounded border border-slate-200">
                      <span className="font-semibold text-slate-800 block text-xs">
                        Sugestão de Perfil de Equipamento:
                      </span>
                      <span className="text-blue-700 font-medium">{ticket.onboarding.tipoComputador}</span>
                      <p className="text-xs text-slate-500 mt-0.5">
                        * O RH não define a máquina física. A T.I. aloca o equipamento (#PAT) do estoque durante o atendimento.
                      </p>
                    </div>

                    {ticket.onboarding.perifericos.length > 0 && (
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="font-semibold text-slate-800 block text-xs mb-1">
                          Periféricos Solicitados:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {ticket.onboarding.perifericos.map((p, idx) => (
                            <span key={idx} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {ticket.onboarding.acessosSoftwares.length > 0 && (
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="font-semibold text-slate-800 block text-xs mb-1">
                          Acessos e Licenças Requeridos:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {ticket.onboarding.acessosSoftwares.map((a, idx) => (
                            <span key={idx} className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-xs">
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* Fase 6: checklist guiado (admissão e desligamento) */}
              {(ticket.tipo === 'onboarding' || (ticket.tipo === 'offboarding' && !usaChecklistLegado)) && (
                <ChecklistProcesso ticket={ticket} />
              )}

              {/* Linha do Tempo de Mensagens */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Histórico de Mensagens & Comunicação
                </h4>

                <div className="space-y-3">
                  {ticket.mensagens.map((msg) => {
                    // Se for nota interna e o usuário for colaborador comum, NÃO mostrar!
                    if (msg.ehNotaInterna && !isTI) return null;

                    return (
                      <div
                        key={msg.id}
                        className={`p-3.5 rounded-lg border text-xs leading-relaxed space-y-1.5 ${
                          msg.ehNotaInterna
                            ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                            : msg.autorId === currentUser?.id
                            ? 'bg-blue-50/50 border-blue-200 text-slate-900 ml-4'
                            : 'bg-white border-slate-200 text-slate-900 mr-4'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{msg.autorNome}</span>
                            {msg.ehNotaInterna ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-amber-200 text-amber-900 font-semibold rounded text-[9px] uppercase">
                                <Lock className="w-2.5 h-2.5" />
                                Nota Interna TI (Privada)
                              </span>
                            ) : (
                              <span className="text-slate-500">· {msg.autorRole}</span>
                            )}
                          </div>
                          <span className="text-slate-500 font-mono text-xs">
                            {formatDateTime(msg.data)}
                          </span>
                        </div>

                        <p className="whitespace-pre-wrap">{msg.texto}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Caixa de Resposta */}
            <form onSubmit={handleSendMessage} className="pt-4 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Adicionar Resposta ao Chamado</span>
                {isTI && (
                  <label className="flex items-center gap-1.5 text-xs text-amber-800 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isInternalNote}
                      onChange={(e) => setIsInternalNote(e.target.checked)}
                      className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <Lock className="w-3 h-3 text-amber-700" />
                    <span>Gravar como Nota Interna da TI (Invisível ao solicitante)</span>
                  </label>
                )}
              </div>

              <div className="relative">
                <textarea
                  rows={3}
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  placeholder={
                    isInternalNote
                      ? 'Escreva uma anotação privada para a equipe técnica de TI...'
                      : 'Escreva sua mensagem ou atualização para o chamado...'
                  }
                  className={`w-full text-xs p-3 rounded-lg border focus:outline-hidden focus:ring-1 ${
                    isInternalNote
                      ? 'border-amber-300 bg-amber-50/40 text-amber-950 focus:ring-amber-500'
                      : 'border-slate-300 bg-white text-slate-900 focus:ring-blue-500'
                  }`}
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!newMessageText.trim()}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg text-white transition-colors ${
                    isInternalNote
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  {isInternalNote ? 'Salvar Nota Interna' : 'Enviar Resposta'}
                </button>
              </div>
            </form>
          </div>

          {/* Coluna Lateral: Dados Relacionais e Controles */}
          <div className="p-6 space-y-6 bg-slate-50/50 text-xs">
            {/* Controles de Status (para TI) */}
            {isTI && (
              <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-3">
                <span className="text-xs uppercase font-bold text-slate-500 block tracking-wide">
                  Gerenciamento de Atendimento
                </span>

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">Status do Chamado</label>
                  <select
                    value={statusExibido}
                    onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-900"
                  >
                    <option value="aberto">Aberto (Na Fila)</option>
                    <option value="em_andamento">Em Andamento</option>
                    <option value="aguardando_terceiro">Aguardando Peça / Fornecedor</option>
                    <option value="resolvido">Resolvido / Finalizado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">Técnico Responsável</label>
                  <select
                    value={tecnicoExibido}
                    onChange={(e) => handleTechnicianChange(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-900"
                  >
                    <option value="">Não atribuído...</option>
                    {tecnicosTI
                      .map((tech) => (
                        <option key={tech.id} value={tech.id}>
                          {tech.nome} ({tech.cargo})
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}

            {/* Vínculo ao Equipamento com Defeito (360°) */}
            <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
              <span className="text-xs uppercase font-bold text-slate-500 block tracking-wide">
                Equipamento Vinculado ao Chamado
              </span>
              {linkedAsset ? (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-blue-700">{linkedAsset.tag}</span>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        setSelectedAssetIdFor360(linkedAsset.id);
                      }}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    >
                      Ver ficha
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="font-medium text-slate-900 mt-0.5">{linkedAsset.nome}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {linkedAsset.marca} {linkedAsset.modelo} · S/N: <span className="font-mono">{linkedAsset.serialNumber}</span>
                  </p>
                </div>
              ) : (
                <p className="text-slate-500 text-xs">Nenhum equipamento físico vinculado.</p>
              )}
            </div>

            {/* Vínculo a Software / SaaS (360°) */}
            {ticket.softwareId && (
              <div className="bg-white p-4 rounded-lg border border-purple-200 bg-purple-50/20 space-y-2">
                <span className="text-xs uppercase font-bold text-purple-700 block tracking-wide flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5" />
                  Software / SaaS Vinculado
                </span>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{ticket.softwareNome || 'Licença de Software'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        setSelectedSoftwareIdFor360(ticket.softwareId!);
                      }}
                      className="text-xs text-purple-700 hover:underline flex items-center gap-1 font-medium"
                    >
                      Ficha
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Assinatura Corporativa monitorada pela T.I.
                  </p>
                </div>
              </div>
            )}

            {/* Solicitante do Chamado */}
            <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
              <span className="text-xs uppercase font-bold text-slate-500 block tracking-wide">
                Solicitante
              </span>
              <div>
                {currentRole === 'colaborador' && ticket.solicitanteId !== currentUser?.id ? (
                  <span className="font-bold text-slate-900 block">
                    {ticket.solicitanteNome}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      setSelectedEmployeeIdFor360(ticket.solicitanteId);
                    }}
                    className="font-bold text-slate-900 hover:text-blue-700 flex items-center gap-1"
                  >
                    {ticket.solicitanteNome}
                    <ExternalLink className="w-3 h-3 text-slate-500" />
                  </button>
                )}
                <p className="text-xs text-slate-600 mt-0.5">{ticket.solicitanteCargo}</p>
                <p className="text-xs text-slate-500">{ticket.solicitanteSetorNome}</p>
                <p className="text-xs text-slate-500 mt-1">{ticket.solicitanteEmail}</p>
              </div>
            </div>

            {/* Informações de Categoria */}
            <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-1.5">
              <span className="text-xs uppercase font-bold text-slate-500 block tracking-wide">
                Metadados do Chamado
              </span>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Tipo:</span>
                <span className="font-medium capitalize text-slate-800">{ticket.tipo}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Categoria:</span>
                <span className="font-medium text-slate-800">{ticket.categoria}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Última Atualização:</span>
                <span className="font-medium text-slate-800">{formatDate(ticket.dataAtualizacao)}</span>
              </div>
            </div>
          </div>
        </div>
        <BarraAlteracoes itens={itensPendentes} onCancelar={descartarRascunho} onSalvar={salvarRascunho} />
      </div>
    </div>
  );
};
