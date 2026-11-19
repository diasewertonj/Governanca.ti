import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate } from '../../utils/formatters.ts';
import { Printer, CheckCircle2, Clock, User, Ban } from 'lucide-react';
import { situacaoTermo } from '../../utils/termos.ts';
import { Abas } from '../ui/Abas.tsx';
import { Busca, CabecalhoTela, Vazio } from '../ui/Tela.tsx';

const SELO_TOM: Record<string, string> = { ok: 'selo-ok', pendente: 'selo-atencao', neutro: 'selo-neutro', cancelado: 'selo-neutro' };

type FiltroTipo = 'todos' | 'entrega' | 'devolucao';

export const TermsView: React.FC = () => {
  const { terms, setSelectedTermForPrint, setSelectedEmployeeIdFor360 } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<FiltroTipo>('todos');

  const filteredTerms = terms.filter((term) => {
    const matchesType = typeFilter === 'todos' || term.tipo === typeFilter;
    const matchesSearch =
      term.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      term.colaboradorNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      term.colaboradorMatricula.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesType && matchesSearch;
  });

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo="Termos"
        subtitulo="Termos de responsabilidade e devolução em padrão A4, prontos para impressão, coleta de assinatura e compliance jurídico"
        abas={
          <Abas
            rotulo="Tipos de termo"
            ativa={typeFilter}
            onMudar={setTypeFilter}
            itens={[
              { id: 'todos', rotulo: 'Todos os termos' },
              { id: 'entrega', rotulo: 'Termos de entrega' },
              { id: 'devolucao', rotulo: 'Termos de devolução' },
            ]}
          />
        }
        filtros={<Busca id="termos-busca" valor={searchTerm} onMudar={setSearchTerm} placeholder="Buscar por código ou colaborador..." />}
      />

      <div className="cartao-tabela">
        <table className="tabela tabela-cartoes">
          <thead>
            <tr>
              <th>Código</th>
              <th className="hidden xl:table-cell">Tipo de documento</th>
              <th>Colaborador</th>
              <th className="hidden 2xl:table-cell">Equipamentos</th>
              <th className="hidden xl:table-cell">Emissão</th>
              <th className="hidden 2xl:table-cell">Responsável T.I.</th>
              <th>Assinatura</th>
              <th className="col-acoes">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredTerms.length > 0 ? (
              filteredTerms.map((term) => {
                const s = situacaoTermo(term, false, terms.find((x) => x.id === term.substituidoPor)?.codigo);
                const Icone = s.tom === 'ok' ? CheckCircle2 : s.tom === 'cancelado' ? Ban : Clock;
                return (
                  <tr key={term.id} onClick={() => setSelectedTermForPrint(term)} className="hover:bg-slate-50/70 cursor-pointer">
                    <td data-label="Código" className="font-mono font-semibold text-blue-700">
                      {term.codigo}
                    </td>

                    <td data-label="Tipo de documento" className="hidden xl:table-cell font-semibold text-slate-900">
                      Termo de {term.tipo === 'entrega' ? 'entrega' : 'devolução'}
                    </td>

                    <td data-label="Colaborador">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEmployeeIdFor360(term.colaboradorId);
                        }}
                        className="link flex items-center gap-1"
                      >
                        <User className="ico-sm" />
                        <span>{term.colaboradorNome}</span>
                      </button>
                      <span className="text-slate-500 block font-mono">
                        {term.colaboradorMatricula} · {term.colaboradorSetorNome}
                      </span>
                    </td>

                    <td data-label="Equipamentos" className="hidden 2xl:table-cell">
                      <span className="font-semibold text-slate-800">{term.ativoIds.length} item(ns)</span>
                    </td>

                    <td data-label="Emissão" className="hidden xl:table-cell text-slate-600">
                      {formatDate(term.dataEmissao)}
                    </td>

                    <td data-label="Responsável T.I." className="hidden 2xl:table-cell text-slate-600">
                      {term.responsavelTINome}
                    </td>

                    <td data-label="Assinatura">
                      <span className={`selo ${SELO_TOM[s.tom] || 'selo-neutro'}`}>
                        <Icone />
                        {s.rotulo}
                      </span>
                    </td>

                    <td data-label="Ações" className="col-acoes">
                      <span className="acoes-linha">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTermForPrint(term);
                          }}
                          aria-label={`Abrir o termo ${term.codigo}`}
                          className="btn btn-sm btn-secundario"
                        >
                          <Printer /> Abrir termo
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
                    titulo="Nenhum termo encontrado"
                    acao={
                      <button type="button" onClick={() => { setSearchTerm(''); setTypeFilter('todos'); }} className="btn btn-sm btn-secundario">
                        Limpar filtros
                      </button>
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};