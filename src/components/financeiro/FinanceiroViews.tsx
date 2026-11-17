/**
 * Seção 6 · Telas do menu: Vencimentos, Contas a pagar, Despesas e Conciliar fornecedores.
 * Tudo calculado a partir da fonte única (utils/financeiro.ts); nada é digitado duas vezes.
 */
import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import type { Fatura } from '../../types/index.ts';
import { formatDate } from '../../utils/formatters.ts';
import { statusExibido } from '../../utils/faturas.ts';
import { nomeContrato } from '../../utils/contratos.ts';
import { normalizar } from '../../utils/processos.ts';
import {
  ROTULO_VENCIMENTO,
  baixarCsv,
  brl,
  listarVencimentos,
  paraCsv,
  type TipoVencimento,
  type Vencimento,
} from '../../utils/financeiro.ts';
import { FaturasSecao } from './FaturasSecao.tsx';

const Topo: React.FC<{ titulo: string; sub: string; children?: React.ReactNode }> = ({ titulo, sub, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
    <div className="min-w-0">
      <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
    {children}
  </div>
);

const CAMPO_FILTRO = 'text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900';

// -----------------------------------------------------------------------------
// Vencimentos
// -----------------------------------------------------------------------------
export const VencimentosView: React.FC<{ noInicio?: boolean }> = ({ noInicio }) => {
  const { assets, contratos, licenses, faturas, employees, abrirFicha } = useApp();
  const { estoque, linhas } = useRecursos();
  const [horizonte, setHorizonte] = useState(60);
  const [tipo, setTipo] = useState<TipoVencimento | 'todos'>('todos');
  const [contratoAberto, setContratoAberto] = useState<string | null>(null);

  const lista = useMemo(
    () => listarVencimentos({ ativos: assets, contratos, licencas: licenses, faturas, estoque, linhas, pessoas: employees }, horizonte),
    [assets, contratos, licenses, faturas, estoque, linhas, employees, horizonte]
  ).filter((v) => tipo === 'todos' || v.tipo === tipo);

  const abrir = (v: Vencimento) => {
    if (v.alvo.tipo === 'ativo') abrirFicha({ tipo: 'ativo', id: v.alvo.id });
    else if (v.alvo.tipo === 'licenca') abrirFicha({ tipo: 'software', id: v.alvo.id });
    else if (v.alvo.tipo === 'contrato') setContratoAberto(v.alvo.id);
    else if (v.alvo.tipo === 'fatura') {
      const f = faturas.find((x) => x.id === v.alvo.id);
      if (f?.contratoId) setContratoAberto(f.contratoId);
      else if (f?.licencaId) abrirFicha({ tipo: 'software', id: f.licencaId });
    }
  };

  return (
    <div className="space-y-6">
      <Topo titulo={noInicio ? "Precisa de atenção" : "Vencimentos"} sub="Garantias, contratos, prazos de cancelamento, renovações, faturas, estoque baixo e recursos de desligados">
        <div className="flex flex-wrap gap-2">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoVencimento | 'todos')} aria-label="Tipo" className={CAMPO_FILTRO}>
            <option value="todos">Todos os tipos</option>
            {Object.entries(ROTULO_VENCIMENTO).map(([k, r]) => (
              <option key={k} value={k}>{r}</option>
            ))}
          </select>
          <select value={horizonte} onChange={(e) => setHorizonte(Number(e.target.value))} aria-label="Período" className={CAMPO_FILTRO}>
            <option value={30}>Próximos 30 dias</option>
            <option value={60}>Próximos 60 dias</option>
            <option value={90}>Próximos 90 dias</option>
            <option value={365}>Próximos 12 meses</option>
          </select>
        </div>
      </Topo>
      {lista.length === 0 ? (
        <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-xl p-4">Nada vencendo neste período.</p>
      ) : (
        <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden">
          <table className="tabela-cartoes w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <th className="py-2 px-3">Quando</th>
                <th className="py-2 px-3">Tipo</th>
                <th className="py-2 px-3">O quê</th>
                <th className="py-2 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {lista.map((v) => (
                <tr key={v.id}>
                  <td data-label="Quando" className="py-2 px-3">
                    {v.data ? (
                      <>
                        <span className="font-semibold text-slate-900">{formatDate(v.data)}</span>
                        <span className={`block ${v.dias !== undefined && v.dias < 0 ? 'text-red-700' : v.dias !== undefined && v.dias <= 15 ? 'text-amber-800' : 'text-slate-500'}`}>
                          {v.dias === undefined ? '' : v.dias < 0 ? `há ${-v.dias} dia(s)` : v.dias === 0 ? 'hoje' : `em ${v.dias} dia(s)`}
                        </span>
                      </>
                    ) : (
                      <span className="text-red-700 font-semibold">Pendência</span>
                    )}
                  </td>
                  <td data-label="Tipo" className="py-2 px-3">{ROTULO_VENCIMENTO[v.tipo]}</td>
                  <td data-label="O quê" className="py-2 px-3">
                    <span className="font-medium text-slate-900">{v.titulo}</span>
                    {v.detalhe && <span className="block text-slate-500">{v.detalhe}</span>}
                  </td>
                  <td data-label="Ação" className="py-2 px-3 text-right">
                    {v.alvo.tipo !== 'estoque' && v.alvo.tipo !== 'linha' && (
                      <button type="button" onClick={() => abrir(v)} className="px-2 py-1 text-xs font-medium text-blue-700 border border-blue-200 rounded-md hover:bg-blue-50">
                        {v.tipo === 'contrato' || v.tipo === 'cancelamento' ? 'Abrir contrato (renovar/encerrar)' : 'Abrir'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {contratoAberto && <ContratoPorId id={contratoAberto} onClose={() => setContratoAberto(null)} />}
    </div>
  );
};

/** Abre o formulário do contrato a partir de outras telas */
const ContratoFormModalLazy = React.lazy(() => import('../fornecedores/ContratoFormModal.tsx').then((m) => ({ default: m.ContratoFormModal })));
export const ContratoPorId: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const { contratos } = useApp();
  const contrato = contratos.find((c) => c.id === id);
  if (!contrato) return null;
  return (
    <React.Suspense fallback={null}>
      <ContratoFormModalLazy contrato={contrato} onClose={onClose} />
    </React.Suspense>
  );
};

// -----------------------------------------------------------------------------
// Contas a pagar
// -----------------------------------------------------------------------------
export const ContasPagarView: React.FC = () => {
  const { faturas, contratos, licenses, fornecedores } = useApp();
  const [status, setStatus] = useState<'abertas' | 'vencidas' | 'pagas' | 'todas'>('abertas');
  const [fornecedorId, setFornecedorId] = useState('');
  const [mes, setMes] = useState('');
  const [busca, setBusca] = useState('');

  const fornecedorDe = (f: Fatura) =>
    f.contratoId ? contratos.find((c) => c.id === f.contratoId)?.fornecedorId : licenses.find((l) => l.id === f.licencaId)?.fornecedorId;
  const nomeOrigem = (f: Fatura) => {
    const c = contratos.find((x) => x.id === f.contratoId);
    return c ? nomeContrato(c) : licenses.find((l) => l.id === f.licencaId)?.nome || '';
  };
  const agora = new Date();
  const lista = faturas
    .filter((f) => {
      const s = statusExibido(f, agora);
      if (status === 'abertas') return s === 'a_pagar' || s === 'vencida';
      if (status === 'vencidas') return s === 'vencida';
      if (status === 'pagas') return s === 'paga';
      return true;
    })
    .filter((f) => !fornecedorId || fornecedorDe(f) === fornecedorId)
    .filter((f) => !mes || f.competencia.startsWith(mes))
    .filter((f) => !busca || normalizar(`${nomeOrigem(f)} ${f.numeroDocumento || ''}`).includes(normalizar(busca)))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const total = lista.filter((f) => f.status !== 'cancelada').reduce((s, f) => s + f.valor, 0);

  const exportar = () =>
    baixarCsv(
      'contas-a-pagar.csv',
      paraCsv(
        ['Origem', 'Fornecedor', 'Competência', 'Vencimento', 'Valor (R$)', 'Situação', 'Pago em', 'Documento'],
        lista.map((f) => [
          nomeOrigem(f),
          fornecedores.find((x) => x.id === fornecedorDe(f))?.nome || '',
          f.competencia.slice(0, 7),
          f.vencimento,
          f.valor,
          statusExibido(f, agora),
          f.pagoEm || '',
          f.numeroDocumento || '',
        ])
      )
    );

  return (
    <div className="space-y-3">
      {/* Um cartão só: filtros à esquerda, total e CSV à direita (mesmo padrão das outras telas) */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar origem ou documento..." aria-label="Buscar" className={`${CAMPO_FILTRO} pl-8 w-full sm:w-60`} />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" aria-hidden="true" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Situação" className={CAMPO_FILTRO}>
          <option value="abertas">A pagar e vencidas</option>
          <option value="vencidas">Só vencidas</option>
          <option value="pagas">Pagas</option>
          <option value="todas">Todas</option>
        </select>
        <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} aria-label="Fornecedor" className={CAMPO_FILTRO}>
          <option value="">Todos os fornecedores</option>
          {fornecedores.map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </select>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Competência" title="Competência" className={CAMPO_FILTRO} />
        <span className="ml-auto text-xs text-slate-600">
          Total na lista: <span className="font-mono font-semibold text-slate-900">{brl(total)}</span>
        </span>
        <button type="button" onClick={exportar} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>      <FaturasSecao listaGlobal={lista} />
    </div>
  );
};

