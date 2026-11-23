import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { TicketStatus, TicketPriority, type Ticket } from '../../types/index.ts';
import { chamadoEncerrado, ROTULO_CAUSA } from '../../utils/atendimento.ts';
import { situacaoSla } from '../../utils/sla.ts';
import { SeloSla } from './SeloSla.tsx';
import { formatDate } from '../../utils/formatters.ts';
import { Plus, User, MessageSquare } from 'lucide-react';
import { Abas } from '../ui/Abas.tsx';
import { Busca, CabecalhoTela, Vazio } from '../ui/Tela.tsx';

interface ServiceDeskViewProps {
  onOpenNewTicketModal: () => void;
}

export const ServiceDeskView: React.FC<ServiceDeskViewProps> = ({ onOpenNewTicketModal }) => {
  const {
    tickets,
    assets,
    employees,
    eventosSla,
    prazosSla,
    currentUser,
    currentRole,
    setSelectedTicketIdForDetail,
    setSelectedEmployeeIdFor360,
  } = useApp();

  const isRH = currentRole === 'rh';

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [priorityFilter, setPriorityFilter] = useState<string>('todos');
  // Seção 7: os chamados da própria T.I. ficam aqui (sem Meus chamados no menu), destacados e filtráveis
  const [origemFiltro, setOrigemFiltro] = useState<'todos' | 'meus' | 'ti'>('todos');
  const papelDoSolicitante = (t: Ticket) => employees.find((e) => e.id === t.solicitanteId)?.role;
  const abertoPelaTI = (t: Ticket) => papelDoSolicitante(t) === 'ti_admin' || papelDoSolicitante(t) === 'ti_suporte';
  const seloOrigem = (t: Ticket) =>
    t.solicitanteId === currentUser?.id
      ? { r: 'Aberto por você', cls: 'selo-info' }
      : abertoPelaTI(t)
        ? { r: papelDoSolicitante(t) === 'ti_admin' ? 'Aberto pelo admin' : 'Aberto pela T.I.', cls: 'selo-neutro' }
        : null;

  // Admissões e desligamentos ficam na tela própria (com histórico); aqui só chamados de suporte.
  // RH: só os chamados que ele mesmo abriu.
  const baseTickets = tickets.filter((t) => t.tipo === 'suporte' && (!isRH || t.solicitanteId === currentUser?.id));

  // Fase 10: duas filas — o trabalho em andamento e o histórico de encerrados
  const [fila, setFila] = useState<'atendimento' | 'encerrados'>('atendimento');
  const naFila = (t: Ticket) => (fila === 'encerrados' ? chamadoEncerrado(t) : !chamadoEncerrado(t));
  const qtdAtendimento = baseTickets.filter((t) => !chamadoEncerrado(t)).length;
  const qtdEncerrados = baseTickets.length - qtdAtendimento;
  const trocarFila = (nova: 'atendimento' | 'encerrados') => {
    setFila(nova);
    setStatusFilter('todos');
  };

  const filteredTickets = baseTickets.filter((tkt) => {
    const matchesStatus = statusFilter === 'todos' || tkt.status === statusFilter;
    const matchesPriority = priorityFilter === 'todos' || tkt.prioridade === priorityFilter;
    const matchesOrigem =
      origemFiltro === 'todos' || (origemFiltro === 'meus' ? tkt.solicitanteId === currentUser?.id : abertoPelaTI(tkt));
    // A busca também acha pelo equipamento, software, causa e solução registrada
    const termo = searchTerm.trim().toLowerCase();
    const textoBusca = [
      tkt.titulo,
      tkt.codigo,
      tkt.solicitanteNome,
      tkt.categoria,
      tkt.softwareNome,
      assets.find((a) => a.id === tkt.ativoId)?.tag,
      tkt.resolucao && ROTULO_CAUSA[tkt.resolucao.causa],
      tkt.resolucao?.solucao,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matchesSearch = !termo || textoBusca.includes(termo);

    return naFila(tkt) &&matchesStatus && matchesPriority && matchesOrigem && matchesSearch;
  });
  // Fase 10 C1: na fila de atendimento, o que vence primeiro vem antes
  if (fila === 'atendimento') {
    const vence = (t: Ticket) => situacaoSla(t, eventosSla[t.id] || [], prazosSla)?.solucao.vence.getTime() ?? Infinity;
    filteredTickets.sort((a, b) => vence(a) - vence(b));
  }

  const statusBadges: Record<TicketStatus, { label: string; cls: string }> = {
    aberto: { label: 'Aberto', cls: 'selo-info' },
    em_andamento: { label: 'Em atendimento', cls: 'selo-atencao' },
    aguardando_terceiro: { label: 'Aguardando', cls: 'selo-atencao' },
    resolvido: { label: 'Encerrado', cls: 'selo-ok' },
    cancelado: { label: 'Cancelado', cls: 'selo-neutro' },
  };

  const priorityBadges: Record<TicketPriority, { label: string; cls: string }> = {
    baixa: { label: 'Baixa', cls: 'text-slate-500' },
    media: { label: 'Média', cls: 'text-blue-700' },
    alta: { label: 'Alta', cls: 'text-amber-700 font-semibold' },
    critica: { label: 'Urgente', cls: 'text-red-700 font-semibold' },
  };

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo={isRH ? 'Chamados do RH' : 'Chamados'}
        subtitulo={
          isRH
            ? 'Acompanhe as requisições de admissão, desligamento e chamados técnicos abertos por você'
            : 'Atendimento técnico consolidado com requisições de admissão e desligamento do RH'
        }
        acoes={
          <button type="button" onClick={onOpenNewTicketModal} className="btn btn-primario">
            <Plus /> {isRH ? 'Solicitar suporte técnico' : 'Novo chamado'}
          </button>
        }
        abas={
          <Abas
            rotulo="Filas de chamados"
            ativa={fila}
            onMudar={trocarFila}
            itens={[
              { id: 'atendimento', rotulo: 'Em atendimento', contador: qtdAtendimento },
              { id: 'encerrados', rotulo: 'Encerrados', contador: qtdEncerrados },
            ]}
          />
        }
        filtros={
          <>
            <Busca
              id="chamados-busca"
              valor={searchTerm}
              onMudar={setSearchTerm}
              placeholder={fila === 'encerrados' ? 'Buscar por equipamento, causa, solução…' : 'Buscar chamado, código ou solicitante…'}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar por situação" className="campo campo-sm">
              <option value="todos">Todas as situações</option>
              {fila === 'atendimento' ? (
                <>
                  <option value="aberto">Aberto</option>
                  <option value="em_andamento">Em atendimento</option>
                  <option value="aguardando_terceiro">Aguardando</option>
                </>
              ) : (
                <>
                  <option value="resolvido">Encerrado com solução</option>
                  <option value="cancelado">Cancelado</option>
                </>
              )}
            </select>
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} aria-label="Filtrar por prioridade" className="campo campo-sm">
              <option value="todos">Todas as prioridades</option>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="critica">Urgente</option>
            </select>
            {!isRH && (
              <select value={origemFiltro} onChange={(e) => setOrigemFiltro(e.target.value as typeof origemFiltro)} aria-label="Quem abriu" className="campo campo-sm">
                <option value="todos">Todos os solicitantes</option>
                <option value="meus">Abertos por mim</option>
                <option value="ti">Abertos pela T.I. / admin</option>
              </select>
            )}
          </>
        }
      />

      {/* Fila de chamados: tabela que vira cartões no celular */}
      <div className="cartao-tabela">
        <table className="tabela tabela-cartoes">
          <thead>
            <tr>
              <th>Código</th>
              <th>Título do chamado</th>
              <th>Solicitante</th>
              <th>Situação</th>
              <th>Prioridade</th>
              <th className="hidden 2xl:table-cell">Técnico T.I.</th>
              <th>Abertura</th>
              <th className="col-acoes">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredTickets.length > 0 ? (
              filteredTickets.map((tkt) => {
                const statusInfo = statusBadges[tkt.status];
                const priorityInfo = priorityBadges[tkt.prioridade];
                const origem = seloOrigem(tkt);

                return (
                  <tr key={tkt.id} onClick={() => setSelectedTicketIdForDetail(tkt.id)} className="hover:bg-slate-50/70 cursor-pointer">
                    <td data-label="Código" className="font-mono font-semibold text-slate-800">
                      {tkt.codigo}
                    </td>

                    <td data-label="Título do chamado">
                      <div className="max-w-xs md:max-w-sm">
                        <span className="font-semibold text-slate-900 block truncate">{tkt.titulo}</span>
                        <span className="texto-aux flex items-center gap-2 mt-0.5">
                          <span className="capitalize">{tkt.categoria}</span>
                          {tkt.mensagens.length > 1 && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-0.5">
                                <MessageSquare className="ico-sm" />
                                {tkt.mensagens.length}
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                    </td>

                    <td data-label="Solicitante">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEmployeeIdFor360(tkt.solicitanteId);
                        }}
                        className="link flex items-center gap-1"
                      >
                        <User className="ico-sm" />
                        <span>{tkt.solicitanteNome}</span>
                      </button>
                      <span className="texto-aux block">{tkt.solicitanteSetorNome}</span>
                      {origem && <span className={`selo ${origem.cls} mt-0.5`}>{origem.r}</span>}
                      {tkt.tipo === 'suporte' && tkt.colaboradorId && tkt.colaboradorId !== tkt.solicitanteId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEmployeeIdFor360(tkt.colaboradorId!);
                          }}
                          className="block texto-aux hover:text-blue-700"
                        >
                          Relacionado: {employees.find((e) => e.id === tkt.colaboradorId)?.nome || 'colaborador'}
                        </button>
                      )}
                    </td>

                    <td data-label="Situação">
                      <span className={`selo ${statusInfo.cls}`}>{statusInfo.label}</span>
                      <span className="block mt-1">
                        <SeloSla tkt={tkt} />
                      </span>
                    </td>

                    <td data-label="Prioridade">
                      <span className={priorityInfo.cls}>{priorityInfo.label}</span>
                    </td>

                    <td data-label="Técnico T.I." className="hidden 2xl:table-cell text-slate-600">
                      {tkt.tecnicoResponsavelNome || <span className="text-slate-500 italic">Pendente</span>}
                    </td>

                    <td data-label="Abertura" className="text-slate-500">
                      {formatDate(tkt.dataCriacao)}
                    </td>

                    <td data-label="Ações" className="col-acoes">
                      <span className="acoes-linha">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTicketIdForDetail(tkt.id);
                          }}
                          aria-label={`Abrir o chamado ${tkt.codigo}`}
                          className="btn btn-sm btn-secundario"
                        >
                          Abrir
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8}>
                  <Vazio
                    titulo="Nenhum chamado encontrado"
                    acao={
                      <>
                        <button type="button" onClick={() => { setSearchTerm(''); setStatusFilter('todos'); setPriorityFilter('todos'); setOrigemFiltro('todos'); }} className="btn btn-sm btn-secundario">
                          Limpar filtros
                        </button>
                        <button type="button" onClick={onOpenNewTicketModal} className="btn btn-sm btn-primario">
                          Novo chamado
                        </button>
                      </>
                    }
                  >
                    Nenhum chamado com os filtros selecionados.
                  </Vazio>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};