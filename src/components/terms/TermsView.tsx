import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate } from '../../utils/formatters.ts';
import {
  Search,
  Printer,
  CheckCircle2,
  Clock,
  User,
  Ban,
} from 'lucide-react';
import { CLASSE_TOM, situacaoTermo } from '../../utils/termos.ts';

export const TermsView: React.FC = () => {
  const { terms, setSelectedTermForPrint, setSelectedEmployeeIdFor360 } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'todos' | 'entrega' | 'devolucao'>('todos');

  const filteredTerms = terms.filter((term) => {
    const matchesType = typeFilter === 'todos' || term.tipo === typeFilter;
    const matchesSearch =
      term.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      term.colaboradorNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      term.colaboradorMatricula.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesType && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Termos de Responsabilidade & Devolução Patrimonial
          </h2>
          <p className="text-xs text-slate-500">
            Documentos formais em padrão A4, prontos para impressão física, coleta de assinatura e compliance jurídico
          </p>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start flex-wrap">
          {[
            { id: 'todos', label: 'Todos os Termos' },
            { id: 'entrega', label: 'Termos de Entrega' },
            { id: 'devolucao', label: 'Termos de Devolução' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTypeFilter(tab.id as 'todos' | 'entrega' | 'devolucao')}
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

        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código ou colaborador..."
            className="w-full sm:w-72 text-sm sm:text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
        </div>
      </div>

      {/* Tabela de Termos */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tabela-cartoes w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-xs tracking-wider">
                <th className="py-3 px-4">Código</th>
                <th className="hidden xl:table-cell py-3 px-4">Tipo de Documento</th>
                <th className="py-3 px-4">Colaborador</th>
                <th className="hidden 2xl:table-cell py-3 px-4">Qtd. Equipamentos</th>
                <th className="hidden xl:table-cell py-3 px-4">Data de Emissão</th>
                <th className="hidden 2xl:table-cell py-3 px-4">Responsável T.I.</th>
                <th className="py-3 px-4">Status da Assinatura</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredTerms.length > 0 ? (
                filteredTerms.map((term) => (
                  <tr
                    key={term.id}
                    onClick={() => setSelectedTermForPrint(term)}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                  >
                    <td data-label="Código" className="py-3 px-4 font-mono font-bold text-blue-700">
                      {term.codigo}
                    </td>

                    <td data-label="Tipo de Documento" className="hidden xl:table-cell py-3 px-4 font-semibold text-slate-900 capitalize">
                      Termo de {term.tipo === 'entrega' ? 'Entrega' : 'Devolução'}
                    </td>

                    <td data-label="Colaborador" className="py-3 px-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEmployeeIdFor360(term.colaboradorId);
                        }}
                        className="font-medium text-slate-900 hover:text-blue-700 flex items-center gap-1"
                      >
                        <User className="w-3 h-3 text-slate-500" />
                        <span>{term.colaboradorNome}</span>
                      </button>
                      <span className="text-xs text-slate-500 block font-mono">
                        {term.colaboradorMatricula} · {term.colaboradorSetorNome}
                      </span>
                    </td>

                    <td data-label="Qtd. Equipamentos" className="hidden 2xl:table-cell py-3 px-4">
                      <span className="font-semibold text-slate-800">
                        {term.ativoIds.length} item(ns)
                      </span>
                    </td>

                    <td data-label="Data de Emissão" className="hidden xl:table-cell py-3 px-4 text-slate-600">
                      {formatDate(term.dataEmissao)}
                    </td>

                    <td data-label="Responsável T.I." className="hidden 2xl:table-cell py-3 px-4 text-slate-600">
                      {term.responsavelTINome}
                    </td>

                    <td data-label="Status da Assinatura" className="py-3 px-4">
                      {(() => {
                        const s = situacaoTermo(term, false, terms.find((x) => x.id === term.substituidoPor)?.codigo);
                        const Icone = s.tom === 'ok' ? CheckCircle2 : s.tom === 'cancelado' ? Ban : Clock;
                        return (
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${CLASSE_TOM[s.tom]}`}>
                            <Icone className="w-3 h-3" />
                            {s.rotulo}
                          </span>
                        );
                      })()}
                    </td>

                    <td data-label="Ação" className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTermForPrint(term);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors ml-auto"
                      >
                        <Printer className="w-3.5 h-3.5 text-blue-600" />
                        <span>Imprimir A4</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                    Nenhum termo encontrado.
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
