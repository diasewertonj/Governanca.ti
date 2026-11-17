import React, { useState } from 'react';
import { Search, UserMinus, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Ticket } from '../../types/index.ts';
import { formatDate } from '../../utils/formatters.ts';
import { progresso } from '../../utils/processos.ts';
import { normalizar } from '../../utils/processos.ts';

const CAMPO = 'text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900';

const SITUACAO: Record<Ticket['status'], { r: string; c: string }> = {
  aberto: { r: 'Aguardando a T.I.', c: 'text-blue-700 bg-blue-50 border-blue-200' },
  em_andamento: { r: 'Em andamento', c: 'text-amber-800 bg-amber-50 border-amber-200' },
  aguardando_terceiro: { r: 'Aguardando', c: 'text-purple-700 bg-purple-50 border-purple-200' },
  resolvido: { r: 'Concluído', c: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  cancelado: { r: 'Cancelado', c: 'text-slate-600 bg-slate-100 border-slate-200' },
};

/**
 * Histórico de admissões e desligamentos (tela inicial de Admissões e desligamentos).
 * Os processos não aparecem mais em Chamados: aqui ficam o andamento (passos feitos)
 * e o histórico. Clicar abre o chamado do processo com o checklist.
 */
export const HistoricoProcessos: React.FC = () => {
  const { tickets, employees, processoItens, setSelectedTicketIdForDetail } = useApp();
  const [tipo, setTipo] = useState<'todos' | 'onboarding' | 'offboarding'>('todos');
  const [situacao, setSituacao] = useState<'andamento' | 'concluidos' | 'cancelados' | 'todos'>('andamento');
  const [busca, setBusca] = useState('');

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

  const contar = (s: typeof situacao) =>
    tickets.filter((t) => (t.tipo === 'onboarding' || t.tipo === 'offboarding') && (s === 'andamento' ? t.status !== 'resolvido' && t.status !== 'cancelado' : true)).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa ou código..." aria-label="Buscar" className={`${CAMPO} pl-8 w-full sm:w-64`} />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" aria-hidden="true" />
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} aria-label="Tipo" className={CAMPO}>
          <option value="todos">Admissões e desligamentos</option>
          <option value="onboarding">Só admissões</option>
          <option value="offboarding">Só desligamentos</option>
        </select>
        <select value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)} aria-label="Situação" className={CAMPO}>
          <option value="andamento">Em andamento ({contar('andamento')})</option>
          <option value="concluidos">Concluídos</option>
          <option value="cancelados">Cancelados</option>
          <option value="todos">Todos ({contar('todos')})</option>
        </select>
      </div>

      {lista.length === 0 ? (
        <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-xl p-4">Nenhum processo com estes filtros.</p>
      ) : (
        <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden">
          <table className="tabela-cartoes w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <th className="py-2 px-3">Processo</th>
                <th className="py-2 px-3">Pessoa</th>
                <th className="py-2 px-3">Data</th>
                <th className="py-2 px-3">Situação</th>
                <th className="py-2 px-3">Checklist</th>
                <th className="hidden xl:table-cell py-2 px-3">Aberto em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {lista.map((t) => {
                const itens = processoItens.filter((i) => i.chamadoId === t.id);
                const p = itens.length ? progresso(itens) : null;
                const s = SITUACAO[t.status];
                return (
                  <tr key={t.id} onClick={() => setSelectedTicketIdForDetail(t.id)} className="cursor-pointer hover:bg-slate-50">
                    <td data-label="Processo" className="py-2 px-3">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-900">
                        {t.tipo === 'onboarding' ? (
                          <UserPlus className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                        ) : (
                          <UserMinus className="w-3.5 h-3.5 text-rose-600" aria-hidden="true" />
                        )}
                        {t.tipo === 'onboarding' ? 'Admissão' : 'Desligamento'}
                      </span>
                      <span className="block font-mono text-slate-500">{t.codigo}</span>
                    </td>
                    <td data-label="Pessoa" className="py-2 px-3 font-semibold text-slate-900">{pessoa(t)}</td>
                    <td data-label="Data" className="py-2 px-3">
                      {dataProcesso(t) ? formatDate(dataProcesso(t)) : '—'}
                      <span className="block text-slate-500">{t.tipo === 'onboarding' ? 'início' : 'último dia'}</span>
                    </td>
                    <td data-label="Situação" className="py-2 px-3">
                      <span className={`inline-block px-1.5 py-0.5 rounded border ${s.c}`}>{s.r}</span>
                    </td>
                    <td data-label="Checklist" className="py-2 px-3">
                      {p ? (
                        <span className="flex items-center gap-2">
                          <span className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <span className="block h-full bg-emerald-600 rounded-full" style={{ width: `${p.percentual}%` }} />
                          </span>
                          {p.feitos + p.naoSeAplica}/{p.total}
                        </span>
                      ) : (
                        <span className="text-slate-500">não montado</span>
                      )}
                    </td>
                    <td data-label="Aberto em" className="hidden xl:table-cell py-2 px-3">{formatDate(t.dataCriacao.slice(0, 10))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
