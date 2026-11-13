import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatCurrency, formatDate } from '../../utils/formatters.ts';
import {
  X,
  Key,
  Users,
  ExternalLink,
  Edit2,
  UserPlus,
  UserMinus,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  Globe,
} from 'lucide-react';
import { FaturasSecao } from '../financeiro/FaturasSecao.tsx';
import { chamadosDoSoftware } from '../../utils/vinculos.ts';
import { ChamadosVinculados } from '../servicedesk/ChamadosVinculados.tsx';
import { History, Ban } from 'lucide-react';
import { contratoQuePagaLicenca, nomeContrato } from '../../utils/contratos.ts';
import { historicoAssentos, licencaAtiva } from '../../utils/licencas.ts';

interface Software360ModalProps {
  softwareId: string;
  onClose: () => void;
}

export const Software360Modal: React.FC<Software360ModalProps> = ({ softwareId, onClose }) => {
  const {
    licenses,
    employees,
    departments,
    allocateLicense,
    revokeLicense,
    editarLicenca,
    setSelectedEmployeeIdFor360,
    setSoftwareToEdit,
    setSoftwareModalOpen,
    currentRole,
    fornecedores,
    podeDescartarPendencias,
    tickets,
    contratos,
    atribuicoesLicenca,
    mudarSituacaoLicenca,
  } = useApp();
  const [motivoInativar, setMotivoInativar] = useState<string | null>(null);

  const [selectedColabToAssign, setSelectedColabToAssign] = useState('');
  const [colabFilterSearch, setColabFilterSearch] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isEditingSeats, setIsEditingSeats] = useState(false);
  const [newTotalSeats, setNewTotalSeats] = useState<number>(0);

  const license = licenses.find((l) => l.id === softwareId);

  if (!license) return null;

  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  // Lote 1: situação, contrato que paga e histórico de assentos
  const ativa = licencaAtiva(license);
  const contratoPagador = contratoQuePagaLicenca(license.id, contratos);
  const historico = historicoAssentos(atribuicoesLicenca, { licencaId: license.id });
  const nomePessoa = (id: string) => employees.find((e) => e.id === id)?.nome || 'Pessoa removida';

  const inativar = async () => {
    if (!motivoInativar) return;
    const falha = await mudarSituacaoLicenca(license.id, false, motivoInativar);
    if (falha) return setFeedbackMsg({ text: falha, type: 'error' });
    setMotivoInativar(null);
    setFeedbackMsg({ text: 'Licença inativada. Ela sai das listas de atribuição.', type: 'success' });
  };
  const reativar = async () => {
    if (!window.confirm(`Reativar ${license.nome}? Ela volta às listas de atribuição.`)) return;
    const falha = await mudarSituacaoLicenca(license.id, true);
    setFeedbackMsg(falha ? { text: falha, type: 'error' } : { text: 'Licença reativada.', type: 'success' });
  };
  // Fase 8: nome do cadastro de fornecedores; sem vínculo, o texto antigo
  const nomeFornecedor = fornecedores.find((f) => f.id === license.fornecedorId)?.nome || license.fornecedor;
  // Fecha perguntando se houver fatura em digitação
  const fechar = () => {
    if (podeDescartarPendencias()) onClose();
  };
  const freeSeats = Math.max(0, license.assentosTotais - license.assentosAlocados);
  const occupancyPercentage = Math.round((license.assentosAlocados / (license.assentosTotais || 1)) * 100);

  // Colaboradores ativos que NÃO possuem esta licença
  const unassignedEmployees = employees.filter(
    (emp) => emp.status === 'ativo' && !license.colaboradoresIds.includes(emp.id)
  );

  // Colaboradores que POSSUEM esta licença (filtrados por busca)
  const assignedEmployees = employees.filter((emp) =>
    license.colaboradoresIds.includes(emp.id)
  ).filter((emp) =>
    emp.nome.toLowerCase().includes(colabFilterSearch.toLowerCase()) ||
    emp.email.toLowerCase().includes(colabFilterSearch.toLowerCase()) ||
    emp.cargo.toLowerCase().includes(colabFilterSearch.toLowerCase())
  );

  const handleAllocate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedColabToAssign) return;

    if (freeSeats <= 0) {
      setFeedbackMsg({
        text: 'Não há assentos livres disponíveis neste contrato. Aumente o total de assentos antes de alocar.',
        type: 'error',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }

    const colab = employees.find((e) => e.id === selectedColabToAssign);
    allocateLicense(license.id, selectedColabToAssign);
    setSelectedColabToAssign('');
    setFeedbackMsg({
      text: `Assento alocado com sucesso para ${colab?.nome || 'o colaborador'}!`,
      type: 'success',
    });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleRevoke = (empId: string, empNome: string) => {
    // Fase 5: liberar assento tira o acesso da pessoa; pede confirmação
    if (!window.confirm(`Liberar o assento de ${empNome} em ${license.nome}?\n\nA pessoa perde o acesso a este software.`)) return;
    revokeLicense(license.id, empId);
    setFeedbackMsg({
      text: `Assento de ${empNome} liberado com sucesso. Saldo livre atualizado!`,
      type: 'success',
    });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleSaveTotalSeats = async () => {
    if (newTotalSeats < license.assentosAlocados) {
      setFeedbackMsg({
        text: `O total de assentos não pode ser menor que os assentos atualmente em uso (${license.assentosAlocados}).`,
        type: 'error',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }
    const falha = await editarLicenca(license.id, { assentosTotais: newTotalSeats });
    if (falha) return setFeedbackMsg({ text: `Não foi possível salvar: ${falha}`, type: 'error' });
    setIsEditingSeats(false);
    setFeedbackMsg({
      text: `Quantidade total de assentos atualizada para ${newTotalSeats}!`,
      type: 'success',
    });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto overscroll-contain modal-tela">
      <div className="relative w-full max-w-4xl bg-white rounded-none sm:rounded-xl min-h-[100dvh] sm:min-h-0 shadow-2xl border border-slate-200 sm:overflow-hidden my-0 sm:my-6">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Key className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900 leading-tight break-words">{license.nome}</h2>
                {license.chaveContrato && (
                  <span className="text-xs font-mono font-medium text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {license.chaveContrato}
                  </span>
                )}
                {!ativa && (
                  <span className="text-xs font-semibold text-slate-700 bg-slate-200 px-2 py-0.5 rounded">Inativa</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {nomeFornecedor}
                {contratoPagador && ` · paga pelo contrato ${nomeContrato(contratoPagador)}`}
              </p>
              {!ativa && (
                <p className="text-xs text-slate-600 mt-0.5">
                  Inativada{license.inativadaEm ? ` em ${formatDate(license.inativadaEm)}` : ''}
                  {license.inativadaPor ? ` por ${nomePessoa(license.inativadaPor)}` : ''}: {license.inativacaoMotivo || 'sem motivo'}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {license.urlPainel && (
              <a
                href={license.urlPainel}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                <span>Console Admin</span>
                <ExternalLink className="w-3 h-3 text-slate-500" />
              </a>
            )}

            {isTI && (
              <button
                type="button"
                onClick={() => {
                  // Fase 8: a ficha fecha; pergunta antes se há fatura em digitação
                  if (!podeDescartarPendencias()) return;
                  setSoftwareToEdit(license);
                  setSoftwareModalOpen(true);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Editar Dados</span>
              </button>
            )}

            {/* Lote 1 (L3): inativar com motivo; reativar só o administrador */}
            {isTI && ativa && (
              <button
                type="button"
                onClick={() => setMotivoInativar(motivoInativar === null ? '' : null)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Inativar</span>
              </button>
            )}
            {currentRole === 'ti_admin' && !ativa && (
              <button
                type="button"
                onClick={reativar}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Reativar</span>
              </button>
            )}

            <button
              type="button"
              aria-label="Fechar"
              onClick={fechar}
              className="p-1.5 text-slate-500 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {motivoInativar !== null && (
          <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 text-xs space-y-2">
            <p className="text-slate-700">
              A licença não é excluída: fica no histórico e sai das listas de atribuição.
              {license.colaboradoresIds.length > 0 &&
                ` Antes, libere os ${license.colaboradoresIds.length} assento(s) em uso.`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Motivo da inativação"
                value={motivoInativar}
                onChange={(e) => setMotivoInativar(e.target.value)}
                placeholder="Motivo (ex.: contrato encerrado; trocado pelo Google Workspace)"
                className="flex-1 min-w-[16rem] px-2.5 py-1.5 border border-slate-300 rounded-md"
              />
              <button
                type="button"
                onClick={inativar}
                disabled={license.colaboradoresIds.length > 0}
                className="px-3 py-1.5 font-semibold text-white bg-slate-700 rounded-md disabled:opacity-50"
              >
                Confirmar inativação
              </button>
            </div>
          </div>
        )}

        {/* Feedback visual */}
        {feedbackMsg && (
          <div
            className={`px-6 py-2.5 text-xs flex items-center gap-2 border-b animate-in fade-in ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Conteúdo em 2 seções */}
        <div className="p-6 space-y-6 sm:max-h-[75vh] sm:overflow-y-auto">
          {/* Card de Gestão de Capacidade & Assentos */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs uppercase font-bold text-slate-500 block tracking-wider">
                  Capacidade
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-bold font-mono text-slate-900">
                    {license.assentosAlocados} / {license.assentosTotais}
                  </span>
                  <span className="text-xs text-slate-500">assentos alocados ({occupancyPercentage}%)</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-xs uppercase font-bold text-slate-500 block tracking-wider">
                    Assentos Livres
                  </span>
                  <span
                    className={`text-base font-bold font-mono ${
                      freeSeats === 0 ? 'text-rose-600' : freeSeats <= 3 ? 'text-amber-600' : 'text-emerald-700'
                    }`}
                  >
                    {freeSeats} disponível(is)
                  </span>
                </div>

                {isTI && (
                  <div className="pl-3 border-l border-slate-200">
                    {isEditingSeats ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={license.assentosAlocados}
                          value={newTotalSeats}
                          onChange={(e) => setNewTotalSeats(Number(e.target.value))}
                          className="w-16 text-xs font-mono font-bold px-2 py-1 bg-white border border-slate-300 rounded"
                        />
                        <button
                          type="button"
                          onClick={handleSaveTotalSeats}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingSeats(false)}
                          className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setNewTotalSeats(license.assentosTotais);
                          setIsEditingSeats(true);
                        }}
                        className="text-xs text-blue-700 hover:underline flex items-center gap-1 font-medium"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Ajustar Assentos</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Barra de Progresso Visual */}
            <div className="space-y-1">
              <div className="w-full h-3 bg-white border border-slate-200 rounded-full overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    occupancyPercentage >= 100
                      ? 'bg-rose-500'
                      : occupancyPercentage >= 85
                      ? 'bg-amber-500'
                      : 'bg-blue-600'
                  }`}
                  style={{ width: `${Math.min(100, occupancyPercentage)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Card: Contrato e custo */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <span className="text-xs uppercase font-bold text-slate-500 block tracking-wider">
              Contrato e custo
            </span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-xs text-slate-500 uppercase font-semibold block">Custo Mensal</span>
                <span className="font-semibold text-slate-900 font-mono">
                  {formatCurrency(license.valorMensal)}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 uppercase font-semibold block">Custo por Assento</span>
                <span className="font-semibold text-slate-700 font-mono">
                  {formatCurrency(license.assentosTotais > 0 ? license.valorMensal / license.assentosTotais : 0)}/mês
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 uppercase font-semibold block">Data de Renovação</span>
                <span className="text-slate-800 font-medium">{formatDate(license.dataRenovacao)}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 uppercase font-semibold block">Tipo de Assinatura</span>
                <span className="text-slate-800 font-medium capitalize">
                  {license.tipoCobranca || 'Mensal Corporativa'}
                </span>
              </div>
            </div>
          </div>

          {/* Fase 8: faturas da licença (só a T.I.) */}
          {isTI && (
            <FaturasSecao
              alvo={{ licencaId: license.id }}
              periodicidade={license.tipoCobranca || 'mensal'}
              valorPadrao={license.valorMensal}
              bloqueioLancamento={
                contratoPagador
                  ? `Custo e faturas pelo contrato ${nomeContrato(contratoPagador)}: lance a fatura no contrato. As faturas acima são anteriores ao contrato.`
                  : undefined
              }
            />
          )}

          {/* Lote 1 (L4): quem teve assento, de quando a quando */}
          {isTI && (
            <div className="border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-slate-600" aria-hidden="true" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Histórico de assentos</h3>
              </div>
              {historico.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhuma atribuição registrada ainda.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-xs">
                  {historico.map((a) => (
                    <li key={a.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedEmployeeIdFor360(a.colaboradorId)}
                        className="font-medium text-slate-900 hover:text-blue-700"
                      >
                        {nomePessoa(a.colaboradorId)}
                      </button>
                      <span className="text-slate-600">
                        {a.inicio ? `desde ${formatDate(a.inicio)}` : 'antes do histórico'}
                        {a.atribuidoPor ? ` (por ${nomePessoa(a.atribuidoPor)})` : ''}
                        {a.fim
                          ? ` · saiu em ${formatDate(a.fim)}${a.removidoPor ? ` (por ${nomePessoa(a.removidoPor)})` : ''}`
                          : ' · em uso'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Fase 9: chamados ligados a este software */}
          <ChamadosVinculados
            chamados={chamadosDoSoftware(tickets, license.id)}
            vazio="Nenhum chamado ligado a este software."
          />

          {license.observacoes && (
            <div className="border border-slate-200 rounded-xl p-4 space-y-1">
              <span className="text-xs uppercase font-bold text-slate-500 block tracking-wider">
                Observações
              </span>
              <p className="text-xs text-slate-700 whitespace-pre-line">{license.observacoes}</p>
            </div>
          )}

          {/* Seção 2: Atribuição / Alocação de Assento (licença inativa não recebe assento) */}
          {isTI && ativa && (
            <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-blue-700" />
                <h3 className="text-xs font-bold text-blue-900 uppercase tracking-wide">
                  Alocar Novo Assento para Colaborador Ativo
                </h3>
              </div>

              <form onSubmit={handleAllocate} className="flex flex-col sm:flex-row items-center gap-2">
                <select
                  value={selectedColabToAssign}
                  onChange={(e) => setSelectedColabToAssign(e.target.value)}
                  disabled={freeSeats <= 0}
                  className="w-full sm:flex-1 text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 disabled:opacity-50"
                >
                  <option value="">
                    {freeSeats <= 0
                      ? 'Nenhum assento livre (Limite atingido)'
                      : 'Selecione um colaborador ativo sem esta licença...'}
                  </option>
                  {unassignedEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nome} ({emp.cargo} · {departments.find((d) => d.id === emp.setorId)?.nome || 'TI'})
                    </option>
                  ))}
                </select>

                <button
                  type="submit"
                  disabled={!selectedColabToAssign || freeSeats <= 0}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Alocar Assento</span>
                </button>
              </form>
            </div>
          )}

          {/* Seção 3: Lista de Colaboradores com Assento Ativo */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-600" />
                  <span>Colaboradores com Assento em Uso ({license.colaboradoresIds.length})</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Libere o assento para disponibilizá-lo imediatamente no saldo livre da empresa
                </p>
              </div>

              {/* Busca na lista */}
              <div className="relative">
                <input
                  type="text"
                  value={colabFilterSearch}
                  onChange={(e) => setColabFilterSearch(e.target.value)}
                  placeholder="Buscar colaborador na licença..."
                  className="w-60 text-xs pl-7 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-500"
                />
                <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-xs tracking-wider">
                      <th className="py-2.5 px-4">Colaborador</th>
                      <th className="py-2.5 px-4">E-mail Corporativo</th>
                      <th className="py-2.5 px-4">Cargo & Setor</th>
                      <th className="py-2.5 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {assignedEmployees.length > 0 ? (
                      assignedEmployees.map((emp) => {
                        const dep = departments.find((d) => d.id === emp.setorId);
                        return (
                          <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2.5 px-4">
                              <button
                                type="button"
                                onClick={() => setSelectedEmployeeIdFor360(emp.id)}
                                className="font-semibold text-slate-900 hover:text-blue-700 flex items-center gap-2 group text-left"
                              >
                                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-xs">
                                  {emp.nome.charAt(0)}
                                </div>
                                <span>{emp.nome}</span>
                                <ExternalLink className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                            </td>

                            <td className="py-2.5 px-4 text-slate-600 font-mono text-xs">
                              {emp.email}
                            </td>

                            <td className="py-2.5 px-4 text-slate-600">
                              <span className="block font-medium text-slate-800">{emp.cargo}</span>
                              <span className="text-xs text-slate-500">{dep?.nome || '-'}</span>
                            </td>

                            <td className="py-2.5 px-4 text-right">
                              {isTI ? (
                                <button
                                  type="button"
                                  onClick={() => handleRevoke(emp.id, emp.nome)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded transition-colors"
                                >
                                  <UserMinus className="w-3 h-3" />
                                  <span>Liberar Assento</span>
                                </button>
                              ) : (
                                <span className="text-slate-500 text-xs">Ativo</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-500 text-xs italic">
                          {colabFilterSearch
                            ? 'Nenhum colaborador encontrado com os termos de busca.'
                            : 'Nenhum colaborador alocado neste software no momento.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
