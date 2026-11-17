import React, { Suspense, lazy, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Busca, CabecalhoTela, Vazio } from '../ui/Tela.tsx';
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

// As fichas (outro arquivo) carregam sob demanda
const ContratoFicha = lazy(() => import('./ContratoFicha.tsx').then((m) => ({ default: m.ContratoFicha })));
const FornecedorFicha = lazy(() => import('./FornecedorFicha.tsx').then((m) => ({ default: m.FornecedorFicha })));

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
    return <span className="selo selo-neutro">encerrado</span>;
  }
  if (situacao === 'vencendo' && dias !== undefined) {
    return (
      <span className="selo selo-atencao">
        {dias === 0 ? 'vence hoje' : `vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`}
      </span>
    );
  }
  if (situacao === 'a_iniciar') {
    return <span className="selo selo-info">começa em {formatDate(contrato.inicio)}</span>;
  }
  return null;
};

/**
 * Fase 8 · Fornecedores e contratos (só a T.I.). Aba Contratos com vigência,
 * itens cobertos e valor; aba Fornecedores com contato e vínculos. As tabelas
 * viram cartões abaixo de 768px.
 */
/** Seção 6: telas separadas no menu — Fornecedores e Contratos (linhas telefônicas ficam em Inventário) */
export const FornecedoresView: React.FC<{ modo?: 'fornecedores' | 'contratos' }> = ({ modo = 'contratos' }) => {
  const { fornecedores, contratos, assets, licenses } = useApp();
  const [busca, setBusca] = useState('');
  const [filtroContrato, setFiltroContrato] = useState<FiltroContrato>('vigentes');
  const [filtroFornecedor, setFiltroFornecedor] = useState<FiltroFornecedor>('todos');
  // undefined = fechado; null = novo; objeto = edição
  const [contratoAberto, setContratoAberto] = useState<Contrato | null | undefined>(undefined);
  const [fornecedorAberto, setFornecedorAberto] = useState<Fornecedor | null | undefined>(undefined);
  // Fichas (clicar na linha)
  const [fichaContratoId, setFichaContratoId] = useState<string | null>(null);
  const [fichaFornecedorId, setFichaFornecedorId] = useState<string | null>(null);

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

  const ehContratos = modo === 'contratos';
  const novoContrato = (
    <button type="button" onClick={() => setContratoAberto(null)} className={`btn ${ehContratos ? 'btn-primario' : 'btn-secundario'}`}>
      <Plus /> Novo contrato
    </button>
  );
  const novoFornecedor = (
    <button type="button" onClick={() => setFornecedorAberto(null)} className={`btn ${ehContratos ? 'btn-secundario' : 'btn-primario'}`}>
      <Plus /> Novo fornecedor
    </button>
  );

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo={ehContratos ? 'Contratos' : 'Fornecedores'}
        subtitulo={
          ehContratos
            ? 'Vigência, itens cobertos, valor e faturas de cada contrato'
            : 'Quem cobra a empresa: revendas, fabricantes, operadoras e prestadores'
        }
        acoes={
          ehContratos ? (
            <>
              {novoFornecedor}
              {novoContrato}
            </>
          ) : (
            <>
              {novoContrato}
              {novoFornecedor}
            </>
          )
        }
        filtros={
          <>
            <Busca
              id="fornecedores-busca"
              valor={busca}
              onMudar={setBusca}
              placeholder={ehContratos ? 'Buscar contrato ou fornecedor...' : 'Buscar nome, CNPJ ou contato...'}
            />
            {ehContratos ? (
              <select value={filtroContrato} onChange={(e) => setFiltroContrato(e.target.value as FiltroContrato)} aria-label="Filtrar contratos" className="campo campo-sm">
                {FILTROS_CONTRATO.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.rotulo}
                  </option>
                ))}
              </select>
            ) : (
              <select value={filtroFornecedor} onChange={(e) => setFiltroFornecedor(e.target.value as FiltroFornecedor)} aria-label="Filtrar fornecedores" className="campo campo-sm">
                <option value="todos">Todos</option>
                <option value="ativos">Ativos</option>
                <option value="inativos">Inativos</option>
              </select>
            )}
          </>
        }
      />

      {ehContratos ? (
        <div className="cartao overflow-hidden">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Fornecedor</th>
                <th className="hidden xl:table-cell">Tipo</th>
                <th>Fim</th>
                <th className="hidden xl:table-cell">Itens cobertos</th>
                <th>Valor</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {contratosFiltrados.length > 0 ? (
                contratosFiltrados.map((c) => (
                  <tr key={c.id} onClick={() => setFichaContratoId(c.id)} className="hover:bg-slate-50/70 cursor-pointer">
                    <td data-label="Contrato" className="min-w-0">
                      <span className="font-semibold text-slate-900 text-left break-words">
                        {c.numero && <span className="font-mono text-blue-700 mr-1.5">{c.numero}</span>}
                        {c.descricao}
                      </span>
                    </td>
                    <td data-label="Fornecedor" className="break-words">
                      {nomeFornecedor(c.fornecedorId)}
                    </td>
                    <td data-label="Tipo" className="hidden xl:table-cell">
                      {ROTULO_TIPO_CONTRATO[c.tipo]}
                    </td>
                    <td data-label="Fim">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-slate-800">{c.fim ? formatDate(c.fim) : 'Sem data'}</span>
                        <SeloFim contrato={c} />
                      </span>
                    </td>
                    <td data-label="Itens cobertos" className="hidden xl:table-cell">
                      {resumoItens(c.itens)}
                    </td>
                    <td data-label="Valor" className="font-mono text-slate-800">
                      {formatCurrency(c.valor)}
                      <span className="font-sans text-slate-500">{SUFIXO_PERIODICIDADE[c.periodicidade]}</span>
                    </td>
                    <td data-label="Ações" className="text-right">
                      <span className="acoes-linha">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFichaContratoId(c.id);
                          }}
                          aria-label={`Abrir a ficha do contrato ${c.numero || c.descricao}`}
                          className="btn btn-sm btn-primario"
                        >
                          Ficha
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setContratoAberto(c);
                          }}
                          title="Editar"
                          aria-label={`Editar o contrato ${c.numero || c.descricao}`}
                          className="btn-icone"
                        >
                          <Pencil />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    <Vazio>
                      {contratos.length === 0
                        ? 'Nenhum contrato cadastrado. Use "Novo contrato" para começar.'
                        : 'Nenhum contrato encontrado com os filtros aplicados.'}
                    </Vazio>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="cartao overflow-hidden">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th className="hidden xl:table-cell">CNPJ</th>
                <th>Contato</th>
                <th>Vínculos</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {fornecedoresFiltrados.length > 0 ? (
                fornecedoresFiltrados.map((f) => (
                  <tr key={f.id} onClick={() => setFichaFornecedorId(f.id)} className={`hover:bg-slate-50/70 cursor-pointer ${f.ativo ? '' : 'opacity-60'}`}>
                    <td data-label="Fornecedor" className="min-w-0">
                      <span className="font-semibold text-slate-900 text-left break-words">{f.nome}</span>
                      {!f.ativo && <span className="selo selo-neutro ml-1.5">Inativo</span>}
                    </td>
                    <td data-label="CNPJ" className="hidden xl:table-cell font-mono text-slate-600">
                      {f.cnpj || '-'}
                    </td>
                    <td data-label="Contato" className="break-words">
                      <span className="block text-slate-800">{f.contato || '-'}</span>
                      {(f.telefone || f.email) && <span className="block text-slate-500">{[f.telefone, f.email].filter(Boolean).join(' · ')}</span>}
                    </td>
                    <td data-label="Vínculos">{resumoVinculos(vinculosDoFornecedor(f.id, { contratos, ativos: assets, licencas: licenses }))}</td>
                    <td data-label="Ações" className="text-right">
                      <span className="acoes-linha">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFichaFornecedorId(f.id);
                          }}
                          aria-label={`Abrir a ficha do fornecedor ${f.nome}`}
                          className="btn btn-sm btn-primario"
                        >
                          Ficha
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFornecedorAberto(f);
                          }}
                          title="Editar"
                          aria-label={`Editar o fornecedor ${f.nome}`}
                          className="btn-icone"
                        >
                          <Pencil />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <Vazio>
                      {fornecedores.length === 0
                        ? 'Nenhum fornecedor cadastrado. Use "Novo fornecedor" para começar.'
                        : 'Nenhum fornecedor encontrado com os filtros aplicados.'}
                    </Vazio>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {contratoAberto !== undefined && <ContratoFormModal contrato={contratoAberto ?? undefined} onClose={() => setContratoAberto(undefined)} />}
      {fornecedorAberto !== undefined && <FornecedorFormModal fornecedor={fornecedorAberto ?? undefined} onClose={() => setFornecedorAberto(undefined)} />}
      <Suspense fallback={null}>
        {fichaContratoId && <ContratoFicha contratoId={fichaContratoId} onClose={() => setFichaContratoId(null)} />}
        {fichaFornecedorId && <FornecedorFicha fornecedorId={fichaFornecedorId} onClose={() => setFichaFornecedorId(null)} />}
      </Suspense>
    </div>
  );
};