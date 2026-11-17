import React from 'react';
import { StickyNote, UserMinus, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Ticket } from '../../types/index.ts';
import { formatDate } from '../../utils/formatters.ts';
import { progresso } from '../../utils/processos.ts';
import { normalizar } from '../../utils/processos.ts';
import { Vazio } from '../ui/Tela.tsx';

export type FiltroTipoProcesso = 'todos' | 'onboarding' | 'offboarding';
export type FiltroSituacaoProcesso = 'andamento' | 'concluidos' | 'cancelados' | 'todos';

const SITUACAO: Record<Ticket['status'], { r: string; c: string }> = {
  aberto: { r: 'Aguardando a T.I.', c: 'selo-info' },
  em_andamento: { r: 'Em andamento', c: 'selo-atencao' },
  aguardando_terceiro: { r: 'Aguardando', c: 'selo-atencao' },
  resolvido: { r: 'Concluído', c: 'selo-ok' },
  cancelado: { r: 'Cancelado', c: 'selo-neutro' },
};

/**
 * Histórico de admissões e desligamentos (tela inicial de Admissões e desligamentos).
 * Os processos não aparecem mais em Chamados: aqui ficam o andamento (passos feitos)
 * e o histórico. Clicar abre a tela própria do processo (seção 9.2).
 * Os filtros ficam no cabeçalho da tela (RhProcessesView) e chegam por props.
 */
export const HistoricoProcessos: React.FC<{ tipo: FiltroTipoProcesso; situacao: FiltroSituacaoProcesso; busca: string }> = ({ tipo, situacao, busca }) => {
  const { tickets, employees, processoItens, setSelectedTicketIdForDetail } = useApp();

  const pessoa = (t: Ticket) =>
    t.tipo === 'onboarding'
      ? t.onboarding?.nomeColaborador || employees.find((e) => e.id === t.colaboradorId)?.nome || '—'
      : employees.find((e) => e.id === (t.colaboradorId || t.offboarding?.colaboradorId))?.nome || '—';
  const dataProcesso = (t: Ticket) => (t.tipo === 'onboarding' ? t.onboarding?.dataAdmissao : t.offboarding?.dataDesligamento);

  const lista = tickets
    .filter((t) => t.tipo === 'onboarding' || t.tipo === 'offboarding')
    .filter((t) => tipo === 'todos' || t.tipo === tipo)
    .filter((t) =>
      situacao === 'todos'
        ? true
        : situacao === 'concluidos'
          ? t.status === 'resolvido'
          : situacao === 'cancelados'
            ? t.status === 'cancelado'
            : t.status !== 'resolvido' && t.status !== 'cancelado'
    )
    .filter((t) => !busca || normalizar(`${t.codigo} ${pessoa(t)} ${t.titulo}`).includes(normalizar(busca)))
    .sort((a, b) => (dataProcesso(b) || b.dataCriacao).localeCompare(dataProcesso(a) || a.dataCriacao));

  if (lista.length === 0) return <Vazio>Nenhum processo com estes filtros.</Vazio>;

  return (
    <div className="cartao overflow-hidden">
      <table className="tabela tabela-cartoes">
        <thead>
          <tr>
            <th>Processo</th>
            <th>Pessoa</th>
            <th>Data</th>
            <th>Situação</th>
            <th>Checklist</th>
            <th className="hidden xl:table-cell">Aberto em</th>
            <th className="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((t) => {
            const itens = processoItens.filter((i) => i.chamadoId === t.id);
            const p = itens.length ? progresso(itens) : null;
            const s = SITUACAO[t.status];
            return (
              <tr key={t.id} onClick={() => setSelectedTicketIdForDetail(t.id)} className="cursor-pointer hover:bg-slate-50">
                <td data-label="Processo">
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-900">
                    {t.tipo === 'onboarding' ? (
                      <UserPlus className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                    ) : (
                      <UserMinus className="w-3.5 h-3.5 text-red-700" aria-hidden="true" />
                    )}
                    {t.tipo === 'onboarding' ? 'Admissão' : 'Desligamento'}
                  </span>
                  <span className="block font-mono text-slate-500">{t.codigo}</span>
                </td>
                <td data-label="Pessoa" className="font-semibold text-slate-900">
                  {pessoa(t)}
                  {/* Seção 9.2: anotações fixas do processo, visíveis também depois de concluir */}
                  {t.anotacoesProcesso && (
                    <span className="block max-w-xs truncate font-normal text-slate-500" title={t.anotacoesProcesso}>
                      <StickyNote className="mr-1 inline h-3 w-3" aria-label="Anotações" />
                      {t.anotacoesProcesso}
                    </span>
                  )}
                </td>
                <td data-label="Data">
                  {dataProcesso(t) ? formatDate(dataProcesso(t)) : '—'}
                  <span className="block text-slate-500">{t.tipo === 'onboarding' ? 'início' : 'último dia'}</span>
                </td>
                <td data-label="Situação">
                  <span className={`selo ${s.c}`}>{s.r}</span>
                </td>
                <td data-label="Checklist">
                  {p ? (
                    <span className="flex items-center gap-2">
                      <span className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <span className="block h-full bg-blue-600 rounded-full" style={{ width: `${p.percentual}%` }} />
                      </span>
                      {p.feitos + p.naoSeAplica}/{p.total}
                    </span>
                  ) : (
                    <span className="text-slate-500">não montado</span>
                  )}
                </td>
                <td data-label="Aberto em" className="hidden xl:table-cell">
                  {formatDate(t.dataCriacao.slice(0, 10))}
                </td>
                <td data-label="Ações" className="text-right">
                  <span className="acoes-linha">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTicketIdForDetail(t.id);
                      }}
                      aria-label={`Abrir o processo ${t.codigo}`}
                      className="btn btn-sm btn-secundario"
                    >
                      Abrir
                    </button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};