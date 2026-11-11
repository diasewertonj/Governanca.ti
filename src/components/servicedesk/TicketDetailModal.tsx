import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { TicketStatus, TicketPriority } from '../../types/index.ts';
import { formatDateTime, formatDate, rotuloStatus, rotuloPrioridade } from '../../utils/formatters.ts';
import {
  X,
  User,
  Laptop,
  MessageSquare,
  Lock,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
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
    addEmployee,
    addTicketMessage,
    updateTicketStatus,
    assignTicketTechnician,
    toggleOffboardingChecklist,
    setSelectedAssetIdFor360,
    setSelectedSoftwareIdFor360,
    setSelectedEmployeeIdFor360,
  } = useApp();

  const [newMessageText, setNewMessageText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [onboardingSuccess, setOnboardingSuccess] = useState<string | null>(null);

  const ticket = tickets.find((t) => t.id === ticketId);

  if (!ticket) return null;

  const linkedAsset = assets.find((a) => a.id === ticket.ativoId);
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';

  const isColaboradorJaCadastrado = ticket.onboarding
    ? employees.some(
        (e) =>
          e.email.toLowerCase() ===
          (ticket.onboarding?.emailColaborador || '').toLowerCase()
      )
    : false;

  const handleEfetivarAdmissao = () => {
    if (!ticket.onboarding) return;
    const onb = ticket.onboarding;

    const existing = employees.find(
      (e) => e.email.toLowerCase() === onb.emailColaborador.toLowerCase()
    );
    if (existing) {
      setOnboardingSuccess(`O colaborador ${onb.nomeColaborador} já está ativo no sistema.`);
      return;
    }

    const newEmp = addEmployee({
      matricula: `NX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      nome: onb.nomeColaborador,
      email: onb.emailColaborador,
      cargo: onb.cargo,
      setorId: onb.setorId,
      gestorId: onb.gestorId,
      status: 'ativo',
      dataAdmissao: onb.dataAdmissao,
      role: onb.papelAcessoSugerido || 'colaborador',
    });

    updateTicketStatus(ticket.id, 'resolvido');
    addTicketMessage(
      ticket.id,
      `Admissão concluída com sucesso pela equipe de T.I.! Colaborador ${newEmp.nome} cadastrado com matrícula ${newEmp.matricula} e nível de acesso "${newEmp.role || 'colaborador'}".`,
      false
    );
    setOnboardingSuccess(`Colaborador ${newEmp.nome} cadastrado e chamado finalizado!`);
    setTimeout(() => setOnboardingSuccess(null), 4000);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim()) return;

    addTicketMessage(ticket.id, newMessageText.trim(), isInternalNote);
    setNewMessageText('');
  };

  const handleStatusChange = (newStatus: TicketStatus) => {
    updateTicketStatus(ticket.id, newStatus);
  };

  const handleTechnicianChange = (techId: string) => {
    assignTicketTechnician(ticket.id, techId);
  };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Barra Superior */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-bold text-slate-800 bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs">
              {ticket.codigo}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900 leading-tight">{ticket.titulo}</h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Aberto em {formatDateTime(ticket.dataCriacao)} por {ticket.solicitanteNome}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs px-2.5 py-0.5 rounded-md font-medium border ${statusColors}`}>
              {rotuloStatus(ticket.status).toUpperCase()}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-md ${priorityColors}`}>
              Prioridade: {rotuloPrioridade(ticket.prioridade).toUpperCase()}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Corpo do Chamado em 2 Colunas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 max-h-[75vh] overflow-y-auto">
          {/* Coluna Principal: Conversas e Linha do Tempo */}
          <div className="lg:col-span-2 p-6 space-y-6 flex flex-col justify-between">
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
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Anexos</span>
                    <div className="flex flex-wrap gap-2">
                      {ticket.anexos.map((att) => (
                        <a
                          key={att.id}
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs text-blue-700 bg-white border border-slate-200 px-2.5 py-1 rounded hover:bg-blue-50 transition-colors"
                        >
                          <Paperclip className="w-3 h-3 text-slate-400" />
                          <span>{att.nome}</span>
                          <span className="text-[10px] text-slate-400">({att.tamanho})</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Checklist Interativo Técnico para Offboarding */}
              {ticket.tipo === 'offboarding' && ticket.offboarding && (
                <div className="border border-amber-200 bg-amber-50/40 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-amber-200">
                    <div className="flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-amber-700" />
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                        Checklist Operacional de Desligamento (Persistido)
                      </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-amber-800">
                      {ticket.offboarding.checklist.filter((c) => c.concluido).length}/
                      {ticket.offboarding.checklist.length} concluídos
                    </span>
                  </div>

                  <div className="space-y-2">
                    {ticket.offboarding.checklist.map((item) => (
                      <label
                        key={item.id}
                        className={`flex items-start gap-2.5 p-2 rounded cursor-pointer transition-colors text-xs ${
                          item.concluido ? 'bg-amber-100/60 line-through text-slate-500' : 'bg-white text-slate-800 hover:bg-amber-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={item.concluido}
                          disabled={!isTI}
                          onChange={() => toggleOffboardingChecklist(ticket.id, item.id)}
                          className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="flex-1 leading-tight">{item.texto}</span>
                      </label>
                    ))}
                  </div>

                  {ticket.offboarding.recolhimentoInstrucoes && (
                    <div className="text-[11px] text-amber-900 bg-white/80 p-2 rounded border border-amber-200">
                      <span className="font-semibold">Logística:</span> {ticket.offboarding.recolhimentoInstrucoes}
                    </div>
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
                      <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Cadastrado no Sistema
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                        Pendente de Efetivação
                      </span>
                    )}
                  </div>

                  {onboardingSuccess && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{onboardingSuccess}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-white p-3 rounded border border-blue-200/80">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Novo Colaborador</span>
                      <span className="font-semibold text-slate-900 block">{ticket.onboarding.nomeColaborador}</span>
                      <span className="text-slate-600 text-[11px] block">{ticket.onboarding.cargo}</span>
                      <span className="text-slate-400 font-mono text-[11px] block">{ticket.onboarding.emailColaborador}</span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Setor & Início</span>
                      <span className="text-slate-800 font-medium block">
                        Setor: {departments.find((d) => d.id === ticket.onboarding?.setorId)?.nome || 'Não definido'}
                      </span>
                      <span className="text-slate-600 text-[11px] block">
                        Início: {formatDate(ticket.onboarding.dataAdmissao)}
                      </span>
                      <div className="mt-1 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-[11px] font-semibold text-blue-900">
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
                      <span className="font-semibold text-slate-800 block text-[11px]">
                        Sugestão de Perfil de Equipamento:
                      </span>
                      <span className="text-blue-700 font-medium">{ticket.onboarding.tipoComputador}</span>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        * O RH não define a máquina física. A T.I. aloca o equipamento (#PAT) do estoque durante o atendimento.
                      </p>
                    </div>

                    {ticket.onboarding.perifericos.length > 0 && (
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="font-semibold text-slate-800 block text-[11px] mb-1">
                          Periféricos Solicitados:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {ticket.onboarding.perifericos.map((p, idx) => (
                            <span key={idx} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px]">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {ticket.onboarding.acessosSoftwares.length > 0 && (
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="font-semibold text-slate-800 block text-[11px] mb-1">
                          Acessos e Licenças Requeridos:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {ticket.onboarding.acessosSoftwares.map((a, idx) => (
                            <span key={idx} className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {isTI && !isColaboradorJaCadastrado && (
                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={handleEfetivarAdmissao}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Efetivar Admissão no Sistema & Concluir Chamado</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Linha do Tempo de Mensagens */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
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
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{msg.autorNome}</span>
                            {msg.ehNotaInterna ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-amber-200 text-amber-900 font-semibold rounded text-[9px] uppercase">
                                <Lock className="w-2.5 h-2.5" />
                                Nota Interna TI (Privada)
                              </span>
                            ) : (
                              <span className="text-slate-400">· {msg.autorRole}</span>
                            )}
                          </div>
                          <span className="text-slate-400 font-mono text-[10px]">
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
                <span className="text-[11px] font-medium text-slate-600">Adicionar Resposta ao Chamado</span>
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
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wide">
                  Gerenciamento de Atendimento
                </span>

                <div>
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">Status do Chamado</label>
                  <select
                    value={ticket.status}
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
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">Técnico Responsável</label>
                  <select
                    value={ticket.tecnicoResponsavelId || ''}
                    onChange={(e) => handleTechnicianChange(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-900"
                  >
                    <option value="">Não atribuído...</option>
                    {employees
                      .filter((e) => e.setorId === 'dep-1') // Setor TI
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
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wide">
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
                      className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
                    >
                      Ver Ficha 360°
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="font-medium text-slate-900 mt-0.5">{linkedAsset.nome}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {linkedAsset.marca} {linkedAsset.modelo} · S/N: <span className="font-mono">{linkedAsset.serialNumber}</span>
                  </p>
                </div>
              ) : (
                <p className="text-slate-400 text-xs">Nenhum equipamento físico vinculado.</p>
              )}
            </div>

            {/* Vínculo a Software / SaaS (360°) */}
            {ticket.softwareId && (
              <div className="bg-white p-4 rounded-lg border border-purple-200 bg-purple-50/20 space-y-2">
                <span className="text-[10px] uppercase font-bold text-purple-700 block tracking-wide flex items-center gap-1.5">
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
                      className="text-[11px] text-purple-700 hover:underline flex items-center gap-1 font-medium"
                    >
                      Ficha 360°
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Assinatura Corporativa monitorada pela T.I.
                  </p>
                </div>
              </div>
            )}

            {/* Solicitante do Chamado */}
            <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wide">
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
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </button>
                )}
                <p className="text-[11px] text-slate-600 mt-0.5">{ticket.solicitanteCargo}</p>
                <p className="text-[11px] text-slate-500">{ticket.solicitanteSetorNome}</p>
                <p className="text-[11px] text-slate-400 mt-1">{ticket.solicitanteEmail}</p>
              </div>
            </div>

            {/* Informações de Categoria */}
            <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wide">
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
      </div>
    </div>
  );
};
