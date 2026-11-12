import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { TicketStatus, TicketPriority } from '../../types/index.ts';
import { formatDate } from '../../utils/formatters.ts';
import {
  Search,
  Plus,
  User,
  Laptop,
  MessageSquare,
  Key,
} from 'lucide-react';

interface ServiceDeskViewProps {
  onOpenNewTicketModal: () => void;
}

export const ServiceDeskView: React.FC<ServiceDeskViewProps> = ({ onOpenNewTicketModal }) => {
  const {
    tickets,
    assets,
    currentUser,
    currentRole,
    setSelectedTicketIdForDetail,
    setSelectedAssetIdFor360,
    setSelectedSoftwareIdFor360,
    setSelectedEmployeeIdFor360,
  } = useApp();

  const isRH = currentRole === 'rh';

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [priorityFilter, setPriorityFilter] = useState<string>('todos');

  // Regra Estrita: RH só visualiza Onboarding, Offboarding e chamados onde ele mesmo é o solicitante
  const baseTickets = isRH
    ? tickets.filter(
        (t) =>
          t.tipo === 'onboarding' ||
          t.tipo === 'offboarding' ||
          t.solicitanteId === currentUser?.id
      )
    : tickets;

  const filteredTickets = baseTickets.filter((tkt) => {
    const matchesType = typeFilter === 'todos' || tkt.tipo === typeFilter;
    const matchesStatus = statusFilter === 'todos' || tkt.status === statusFilter;
    const matchesPriority = priorityFilter === 'todos' || tkt.prioridade === priorityFilter;
    const matchesSearch =
      tkt.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tkt.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tkt.solicitanteNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tkt.categoria.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesType && matchesStatus && matchesPriority && matchesSearch;
  });

  const getAsset = (assetId?: string) => {
    return assets.find((a) => a.id === assetId);
  };

  const statusBadges: Record<TicketStatus, { label: string; cls: string }> = {
    aberto: { label: 'Aberto', cls: 'text-blue-700 bg-blue-50 border-blue-200' },
    em_andamento: { label: 'Em Andamento', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
    aguardando_terceiro: { label: 'Aguardando Peça', cls: 'text-purple-700 bg-purple-50 border-purple-200' },
    resolvido: { label: 'Resolvido', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    cancelado: { label: 'Cancelado', cls: 'text-slate-500 bg-slate-100 border-slate-200' },
  };

  const priorityBadges: Record<TicketPriority, { label: string; cls: string }> = {
    baixa: { label: 'Baixa', cls: 'text-slate-500' },
    media: { label: 'Média', cls: 'text-blue-700' },
    alta: { label: 'Alta', cls: 'text-amber-700 font-semibold' },
    critica: { label: 'Urgente', cls: 'text-rose-700 font-bold' },
  };

  const tabsToDisplay = isRH
    ? [
        { id: 'todos', label: 'Todas as Requisições' },
        { id: 'onboarding', label: 'Onboarding (Admissões)' },
        { id: 'offboarding', label: 'Offboarding (Desligamentos)' },
        { id: 'suporte', label: 'Meus Chamados Técnicos' },
      ]
    : [
        { id: 'todos', label: 'Todos os Chamados' },
        { id: 'suporte', label: 'Suporte Técnico' },
        { id: 'onboarding', label: 'Onboarding (RH)' },
        { id: 'offboarding', label: 'Offboarding (RH)' },
      ];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {isRH ? 'Chamados do RH' : 'Chamados'}
          </h2>
          <p className="text-xs text-slate-500">
            {isRH
              ? 'Acompanhe as requisições de admissão, desligamento e chamados técnicos abertos por você'
              : 'Atendimento técnico consolidado com requisições de admissão e desligamento do RH'}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenNewTicketModal}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{isRH ? 'Solicitar Suporte Técnico' : 'Abrir Chamado'}</span>
        </button>
      </div>

      {/* Filtros e Busca */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Tabs de Tipo */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start max-w-full overflow-x-auto">
            {tabsToDisplay.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id)}
                className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  typeFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar chamado, código ou solicitante..."
                className="w-full sm:w-64 text-sm sm:text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700"
            >
              <option value="todos">Todos os Status</option>
              <option value="aberto">Aberto</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="aguardando_terceiro">Aguardando Peça</option>
              <option value="resolvido">Resolvido</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700"
            >
              <option value="todos">Todas Prioridades</option>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="critica">Urgente</option>
            </select>
          </div>
        </div>
      </div>

      {/* Fila de Chamados */}
      {/* Fase 7: no celular, a fila vira cartões */}
      <ul className="md:hidden space-y-2" aria-label="Fila de chamados">
        {filteredTickets.length === 0 ? (
          <li className="bg-white border border-slate-200 rounded-xl p-5 text-center text-sm text-slate-600">
            Nenhum chamado encontrado com os filtros selecionados.
          </li>
        ) : (
          filteredTickets.map((tkt) => {
            const statusInfo = statusBadges[tkt.status];
            const priorityInfo = priorityBadges[tkt.prioridade];
            return (
              <li key={tkt.id}>
                <button
                  type="button"
                  onClick={() => setSelectedTicketIdForDetail(tkt.id)}
                  className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 space-y-1.5 active:bg-slate-50"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-700">{tkt.codigo}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${statusInfo.cls}`}>{statusInfo.label}</span>
                  </span>
                  <span className="block text-sm font-semibold text-slate-900">{tkt.titulo}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
                    <span>{tkt.solicitanteNome}</span>
                    <span aria-hidden="true">·</span>
                    <span className={priorityInfo.cls}>{priorityInfo.label}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDate(tkt.dataCriacao)}</span>
                  </span>
                  <span className="block text-xs text-slate-600">
                    Técnico: {tkt.tecnicoResponsavelNome || 'pendente'}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>

      <div className="hidden md:block bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-xs tracking-wider">
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Título do Chamado</th>
                <th className="py-3 px-4">Solicitante</th>
                <th className="py-3 px-4">Ativo vinculado</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Prioridade</th>
                <th className="py-3 px-4">Técnico TI</th>
                <th className="py-3 px-4 text-right">Abertura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredTickets.length > 0 ? (
                filteredTickets.map((tkt) => {
                  const asset = getAsset(tkt.ativoId);
                  const statusInfo = statusBadges[tkt.status];
                  const priorityInfo = priorityBadges[tkt.prioridade];

                  return (
                    <tr
                      key={tkt.id}
                      onClick={() => setSelectedTicketIdForDetail(tkt.id)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {tkt.codigo}
                      </td>

                      <td className="py-3 px-4">
                        <div className="max-w-xs md:max-w-sm">
                          <span className="font-semibold text-slate-900 block hover:text-blue-700 truncate">
                            {tkt.titulo}
                          </span>
                          <span className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <span className="capitalize">{tkt.categoria}</span>
                            {tkt.mensagens.length > 1 && (
                              <>
                                <span>·</span>
                                <span className="flex items-center gap-0.5 text-slate-500">
                                  <MessageSquare className="w-2.5 h-2.5" />
                                  {tkt.mensagens.length}
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEmployeeIdFor360(tkt.solicitanteId);
                          }}
                          className="font-medium text-slate-900 hover:text-blue-700 flex items-center gap-1"
                        >
                          <User className="w-3 h-3 text-slate-500" />
                          <span>{tkt.solicitanteNome}</span>
                        </button>
                        <span className="text-xs text-slate-500 block">{tkt.solicitanteSetorNome}</span>
                      </td>

                      {/* Ativo Físico ou Software com link contextual 360° */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {asset ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAssetIdFor360(asset.id);
                            }}
                            className="font-semibold text-blue-700 hover:underline flex items-center gap-1"
                          >
                            <Laptop className="w-3 h-3 text-blue-500" />
                            <span>{asset.tag}</span>
                            <span className="text-slate-600 font-normal">({asset.nome.slice(0, 16)}...)</span>
                          </button>
                        ) : tkt.softwareId ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSoftwareIdFor360(tkt.softwareId!);
                            }}
                            className="font-semibold text-purple-700 hover:underline flex items-center gap-1"
                          >
                            <Key className="w-3 h-3 text-purple-600" />
                            <span>{tkt.softwareNome || 'Software SaaS'}</span>
                          </button>
                        ) : (
                          <span className="text-slate-500 text-xs">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${statusInfo.cls}`}>
                          {statusInfo.label}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`text-xs ${priorityInfo.cls}`}>
                          {priorityInfo.label}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                        {tkt.tecnicoResponsavelNome || <span className="text-slate-500 italic">Pendente</span>}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap text-slate-500">
                        {formatDate(tkt.dataCriacao)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                    Nenhum chamado encontrado com os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
