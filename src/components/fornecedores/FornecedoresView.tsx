import React, { useState } from 'react';
import { Building2, FileSignature, Plus, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Contrato, Fornecedor, PeriodicidadeContrato } from '../../types/index.ts';
import { formatCurrency, formatDate } from '../../utils/formatters.ts';
import { normalizar } from '../../utils/processos.ts';
import {
  DIAS_ALERTA_CONTRATO,
  ROTULO_TIPO_CONTRATO,
  resumoItens,
  resumoVinculos,
  situacaoContrato,
  vinculosDoFornecedor,
} from '../../utils/contratos.ts';
import { ContratoFormModal } from './ContratoFormModal.tsx';
import { FornecedorFormModal } from './FornecedorFormModal.tsx';

type Aba = 'contratos' | 'fornecedores';
type FiltroContrato = 'vigentes' | 'vencendo' | 'encerrados' | 'todos';
type FiltroFornecedor = 'todos' | 'ativos' | 'inativos';

const SUFIXO_PERIODICIDADE: Record<PeriodicidadeContrato, string> = {
  mensal: '/mês',
  anual: '/ano',
  unico: ' (único)',
};

const FILTROS_CONTRATO: { id: FiltroContrato; rotulo: string }[] = [
  { id: 'vigentes', rotulo: 'Vigentes' },
  { id: 'vencendo', rotulo: `Vencem em ${DIAS_ALERTA_CONTRATO} dias` },
  { id: 'encerrados', rotulo: 'Encerrados' },
  { id: 'todos', rotulo: 'Todos' },
];

/** Selo do fim do contrato: "vence em N dias" (até 60) e "encerrado" */
const SeloFim: React.FC<{ contrato: Contrato }> = ({ contrato }) => {
  const { situacao, dias } = situacaoContrato(contrato);
  if (situacao === 'encerrado') {
    return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium text-slate-700 bg-slate-100">encerrado</span>;
  }
  if (situacao === 'vencendo' && dias !== undefined) {
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200">
        {dias === 0 ? 'vence hoje' : `vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`}
      </span>
    );
  }
  if (situacao === 'a_iniciar') {
    return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium text-blue-700 bg-blue-50">começa em {formatDate(contrato.inicio)}</span>;
  }
  return null;
};

/**
 * Fase 8 · Fornecedores e contratos (só a T.I.). Aba Contratos com vigência,
 * itens cobertos e valor; aba Fornecedores com contato e vínculos. As tabelas
 * viram cartões abaixo de 768px.
 */
export const FornecedoresView: React.FC = () => {
  const { fornecedores, contratos, assets, licenses } = useApp();
  const [aba, setAba] = useState<Aba>('contratos');
  const [busca, setBusca] = useState('');
  const [filtroContrato, setFiltroContrato] = useState<FiltroContrato>('vigentes');
  const [filtroFornecedor, setFiltroFornecedor] = useState<FiltroFornecedor>('todos');
  // undefined = fechado; null = novo; objeto = edição
  const [contratoAberto, setContratoAberto] = useState<Contrato | null | undefined>(undefined);
  const [fornecedorAberto, setFornecedorAberto] = useState<Fornecedor | null | undefined>(undefined);

  const termo = normalizar(busca);
  const nomeFornecedor = (id: string) => fornecedores.find((f) => f.id === id)?.nome || 'Fornecedor não encontrado';

  const contratosFiltrados = contratos
    .filter((c) => {
      const { situacao } = situacaoContrato(c);
      if (filtroContrato === 'vigentes') return situacao !== 'encerrado';
      if (filtroContrato === 'vencendo') return situacao === 'vencendo';
      if (filtroContrato === 'encerrados') return situacao === 'encerrado';
      return true;
    })
    .filter((c) => !termo || normalizar(`${c.numero || ''} ${c.descricao} ${nomeFornecedor(c.fornecedorId)}`).includes(termo))
    // Sem fim vai para o final; os demais, do fim mais próximo para o mais distante
    .sort((a, b) => (a.fim || '9999-12-31').localeCompare(b.fim || '9999-12-31'));

  const fornecedoresFiltrados = fornecedores
    .filter((f) => (filtroFornecedor === 'ativos' ? f.ativo : filtroFornecedor === 'inativos' ? !f.ativo : true))
    .filter((f) => !termo || normalizar(`${f.nome} ${f.cnpj || ''} ${f.contato || ''} ${f.email || ''}`).includes(termo));

  const botaoPrimario =
    'flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors';
  const botaoSecundario =
    'flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors';

  return (
    <div className="space-y-6">
      {/* Topo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Fornecedores e contratos</h2>
          <p className="text-xs text-slate-500">
            Contratos, itens cobertos e faturas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setContratoAberto(null)} className={botaoPrimario}>
            <Plus className="w-4 h-4" /> Contrato
          </button>
          <button type="button" onClick={() => setFornecedorAberto(null)} className={botaoSecundario}>
            <Plus className="w-3.5 h-3.5 text-blue-600" /> Fornecedor
          </button>
        </div>
      </div>

      {/* Abas, filtro e busca */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div role="tablist" aria-label="Fornecedores e contratos" className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start flex-wrap">
          {(
            [
              { id: 'contratos', rotulo: `Contratos (${contratos.length})`, Icone: FileSignature },
              { id: 'fornecedores', rotulo: `Fornecedores (${fornecedores.length})`, Icone: Building2 },
            ] as const
          ).map(({ id, rotulo, Icone }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={aba === id}
              onClick={() => setAba(id)}
              className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                aba === id ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icone className="w-3.5 h-3.5" aria-hidden="true" />
              {rotulo}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="relative w-full sm:w-auto">
            <label htmlFor="fornecedores-busca" className="sr-only">
              Buscar
            </label>
            <input
              id="fornecedores-busca"
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={aba === 'contratos' ? 'Buscar contrato ou fornecedor...' : 'Buscar nome, CNPJ ou contato...'}
              className="w-full sm:w-64 text-sm sm:text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" aria-hidden="true" />
          </div>
          {aba === 'contratos' ? (
            <select
              value={filtroContrato}
              onChange={(e) => setFiltroContrato(e.target.value as FiltroContrato)}
              aria-label="Filtrar contratos"
              className="text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
            >
              {FILTROS_CONTRATO.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={filtroFornecedor}
              onChange={(e) => setFiltroFornecedor(e.target.value as FiltroFornecedor)}
              aria-label="Filtrar fornecedores"
              className="text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
            >
              <option value="todos">Todos</option>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
            </select>
          )}
        </div>
      </div>

      {aba === 'contratos' ? (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <table className="tabela-cartoes w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-xs tracking-wider">
                <th className="py-3 px-4">Contrato</th>
                <th className="py-3 px-4">Fornecedor</th>
                <th className="hidden xl:table-cell py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Fim</th>
                <th className="hidden xl:table-cell py-3 px-4">Itens cobertos</th>
                <th className="py-3 px-4">Valor</th>
                <th className="py-3 px-4 text-right">Ficha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {contratosFiltrados.length > 0 ? (
                contratosFiltrados.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    <td data-label="Contrato" className="py-3 px-4 min-w-0">
                      <button
                        type="button"
                        onClick={() => setContratoAberto(c)}
                        className="font-semibold text-slate-900 hover:text-blue-700 text-left break-words"
                      >
                        {c.numero && <span className="font-mono text-blue-700 mr-1.5">{c.numero}</span>}
                        {c.descricao}
                      </button>
                    </td>
                    <td data-label="Fornecedor" className="py-3 px-4 break-words">
                      {nomeFornecedor(c.fornecedorId)}
                    </td>
                    <td data-label="Tipo" className="hidden xl:table-cell py-3 px-4">
                      {ROTULO_TIPO_CONTRATO[c.tipo]}
                    </td>
                    <td data-label="Fim" className="py-3 px-4">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-slate-800">{c.fim ? formatDate(c.fim) : 'Sem data'}</span>
                        <SeloFim contrato={c} />
                      </span>
                    </td>
                    <td data-label="Itens cobertos" className="hidden xl:table-cell py-3 px-4">
                      {resumoItens(c.itens)}
                    </td>
                    <td data-label="Valor" className="py-3 px-4 font-mono text-slate-800">
                      {formatCurrency(c.valor)}
                      <span className="font-sans text-slate-500">{SUFIXO_PERIODICIDADE[c.periodicidade]}</span>
                    </td>
                    <td data-label="Ficha" className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setContratoAberto(c)}
                        aria-label={`Abrir o contrato ${c.numero || c.descricao}`}
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 px-4 text-center text-slate-500 text-xs">
                    {contratos.length === 0
                      ? 'Nenhum contrato cadastrado. Use "+ Contrato" para começar.'
                      : 'Nenhum contrato encontrado com os filtros aplicados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <table className="tabela-cartoes w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-xs tracking-wider">
                <th className="py-3 px-4">Fornecedor</th>
                <th className="hidden xl:table-cell py-3 px-4">CNPJ</th>
                <th className="py-3 px-4">Contato</th>
                <th className="py-3 px-4">Vínculos</th>
                <th className="py-3 px-4 text-right">Ficha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {fornecedoresFiltrados.length > 0 ? (
                fornecedoresFiltrados.map((f) => (
                  <tr key={f.id} className={`hover:bg-slate-50/70 transition-colors ${f.ativo ? '' : 'opacity-60'}`}>
                    <td data-label="Fornecedor" className="py-3 px-4 min-w-0">
                      <button
                        type="button"
                        onClick={() => setFornecedorAberto(f)}
                        className="font-semibold text-slate-900 hover:text-blue-700 text-left break-words"
                      >
                        {f.nome}
                      </button>
                      {!f.ativo && (
                        <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-xs font-medium text-slate-700 bg-slate-100">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td data-label="CNPJ" className="hidden xl:table-cell py-3 px-4 font-mono text-slate-600">
                      {f.cnpj || '-'}
                    </td>
                    <td data-label="Contato" className="py-3 px-4 break-words">
                      <span className="block text-slate-800">{f.contato || '-'}</span>
                      {(f.telefone || f.email) && (
                        <span className="block text-slate-500">{[f.telefone, f.email].filter(Boolean).join(' · ')}</span>
                      )}
                    </td>
                    <td data-label="Vínculos" className="py-3 px-4">
                      {resumoVinculos(vinculosDoFornecedor(f.id, { contratos, ativos: assets, licencas: licenses }))}
                    </td>
                    <td data-label="Ficha" className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setFornecedorAberto(f)}
                        aria-label={`Editar o fornecedor ${f.nome}`}
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 px-4 text-center text-slate-500 text-xs">
                    {fornecedores.length === 0
                      ? 'Nenhum fornecedor cadastrado. Use "+ Fornecedor" para começar.'
                      : 'Nenhum fornecedor encontrado com os filtros aplicados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {contratoAberto !== undefined && (
        <ContratoFormModal contrato={contratoAberto ?? undefined} onClose={() => setContratoAberto(undefined)} />
      )}
      {fornecedorAberto !== undefined && (
        <FornecedorFormModal fornecedor={fornecedorAberto ?? undefined} onClose={() => setFornecedorAberto(undefined)} />
      )}
    </div>
  );
};
