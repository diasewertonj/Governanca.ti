import React, { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Busca, CabecalhoTela, Vazio } from '../ui/Tela.tsx';
import { useApp } from '../../context/AppContext.tsx';
import type { Contrato, Fornecedor, PeriodicidadeContrato } from '../../types/index.ts';
import { formatCurrency, formatDate } from '../../utils/formatters.ts';
import { normalizar } from '../../utils/processos.ts';
import {
  DIAS_ALERTA_CONTRATO,
  ROTULO_TIPO_CONTRATO,
  resumoVinculos,
  situacaoContrato,
  temVinculos,
  vinculosDoFornecedor,
} from '../../utils/contratos.ts';
import { ContratoFormModal } from './ContratoFormModal.tsx';
import { FornecedorFormModal } from './FornecedorFormModal.tsx';

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

/** Itens citados na linha do contrato: até 2 com link; o resto vira "+N" */
const ITENS_NA_LINHA = 2;

/**
 * Seção 21: a linha inteira abre a ficha. O botão do título cobre a linha
 * (after:absolute); links e botões das outras colunas ficam por cima por virem
 * depois no documento (relative). Sem z-index: o cabeçalho fixo da tabela fica acima.
 */
const LINHA = 'relative hover:bg-slate-50/70';
const BOTAO_LINHA = "text-left font-semibold text-slate-900 after:absolute after:inset-0 after:content-[''] hover:text-blue-700";
const LINK_NA_LINHA = 'link relative text-left';

/** Célula sem dado: traço no computador; no celular (cartão) não ocupa espaço */
const SemDado = () => <span className="texto-aux hidden md:inline">—</span>;

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
  const { fornecedores, contratos, assets, licenses, abrirFicha } = useApp();
  const [busca, setBusca] = useState('');
  const [filtroContrato, setFiltroContrato] = useState<FiltroContrato>('vigentes');
  const [filtroFornecedor, setFiltroFornecedor] = useState<FiltroFornecedor>('todos');
  // undefined = fechado; null = novo; objeto = edição
  const [contratoAberto, setContratoAberto] = useState<Contrato | null | undefined>(undefined);
  const [fornecedorAberto, setFornecedorAberto] = useState<Fornecedor | null | undefined>(undefined);

  const termo = normalizar(busca);
  const fornecedorDe = (id: string) => fornecedores.find((f) => f.id === id);
  const nomeFornecedor = (id: string) => fornecedorDe(id)?.nome || 'Fornecedor não encontrado';

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

  // Coluna sem nenhum dado na lista some (princípio 1)
  const mostrarItens = contratosFiltrados.some((c) => c.itens.length > 0);
  const mostrarCnpj = fornecedoresFiltrados.some((f) => f.cnpj);
  const mostrarContato = fornecedoresFiltrados.some((f) => f.contato || f.telefone || f.email);
  const vinculosPorFornecedor = new Map(
    fornecedoresFiltrados.map((f) => [f.id, vinculosDoFornecedor(f.id, { contratos, ativos: assets, licencas: licenses })])
  );
  const mostrarVinculos = [...vinculosPorFornecedor.values()].some(temVinculos);
  const colunasContratos = 6 + (mostrarItens ? 1 : 0);
  const colunasFornecedores = 2 + (mostrarCnpj ? 1 : 0) + (mostrarContato ? 1 : 0) + (mostrarVinculos ? 1 : 0);

  /** Itens cobertos citados na linha, cada um abrindo a sua ficha */
  const itensDaLinha = (c: Contrato) => {
    const citados = c.itens.slice(0, ITENS_NA_LINHA).map((i) => {
      if (i.ativoId) {
        const a = assets.find((x) => x.id === i.ativoId);
        return a ? (
          <button key={i.ativoId} type="button" onClick={() => abrirFicha({ tipo: 'ativo', id: a.id })} className={`${LINK_NA_LINHA} font-mono`}>
            {a.tag}
          </button>
        ) : null;
      }
      const l = licenses.find((x) => x.id === i.licencaId);
      return l ? (
        <button key={i.licencaId} type="button" onClick={() => abrirFicha({ tipo: 'software', id: l.id })} className={LINK_NA_LINHA}>
          {l.nome}
        </button>
      ) : null;
    });
    const resto = c.itens.length - ITENS_NA_LINHA;
    return (
      <span className="flex flex-wrap items-baseline gap-x-2">
        {citados}
        {resto > 0 && <span className="texto-aux num">+{resto}</span>}
      </span>
    );
  };

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
        // Uma ação principal por tela (o contrato cria fornecedor pelo próprio formulário)
        acoes={ehContratos ? novoContrato : novoFornecedor}
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
        <div className="cartao-tabela">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Fornecedor</th>
                <th className="hidden xl:table-cell">Tipo</th>
                <th>Fim</th>
                {mostrarItens && <th className="hidden xl:table-cell">Itens cobertos</th>}
                <th className="num">Valor</th>
                <th className="col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {contratosFiltrados.length > 0 ? (
                contratosFiltrados.map((c) => {
                  const fornecedor = fornecedorDe(c.fornecedorId);
                  return (
                    <tr key={c.id} className={LINHA}>
                      <td data-label="Contrato" className="min-w-0">
                        <button type="button" onClick={() => abrirFicha({ tipo: 'contrato', id: c.id })} className={`${BOTAO_LINHA} break-words`}>
                          {c.numero && <span className="mr-2 font-mono text-blue-700">{c.numero}</span>}
                          {c.descricao}
                        </button>
                      </td>
                      <td data-label="Fornecedor" className="break-words">
                        {fornecedor ? (
                          <button type="button" onClick={() => abrirFicha({ tipo: 'fornecedor', id: fornecedor.id })} className={LINK_NA_LINHA}>
                            {fornecedor.nome}
                          </button>
                        ) : (
                          'Fornecedor não encontrado'
                        )}
                      </td>
                      <td data-label="Tipo" className="hidden xl:table-cell">
                        {ROTULO_TIPO_CONTRATO[c.tipo]}
                      </td>
                      <td data-label="Fim">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="num text-slate-800">{c.fim ? formatDate(c.fim) : 'Sem data'}</span>
                          <SeloFim contrato={c} />
                        </span>
                      </td>
                      {mostrarItens && (
                        <td data-label={c.itens.length > 0 ? 'Itens cobertos' : undefined} className="hidden xl:table-cell">
                          {c.itens.length > 0 ? itensDaLinha(c) : <SemDado />}
                        </td>
                      )}
                      <td data-label="Valor" className="num text-slate-800">
                        {formatCurrency(c.valor)}
                        <span className="font-sans text-slate-500">{SUFIXO_PERIODICIDADE[c.periodicidade]}</span>
                      </td>
                      <td className="col-acoes">
                        <span className="acoes-linha">
                          <button
                            type="button"
                            onClick={() => setContratoAberto(c)}
                            title="Editar"
                            aria-label={`Editar o contrato ${c.numero || c.descricao}`}
                            className="btn-icone relative"
                          >
                            <Pencil />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={colunasContratos}>
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
        <div className="cartao-tabela">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Fornecedor</th>
                {mostrarCnpj && <th className="hidden xl:table-cell">CNPJ</th>}
                {mostrarContato && <th>Contato</th>}
                {mostrarVinculos && <th>Vínculos</th>}
                <th className="col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {fornecedoresFiltrados.length > 0 ? (
                fornecedoresFiltrados.map((f) => {
                  const vinculos = vinculosPorFornecedor.get(f.id);
                  const meiosContato = [f.telefone, f.email].filter(Boolean).join(' · ');
                  return (
                    <tr key={f.id} className={`${LINHA} ${f.ativo ? '' : 'opacity-60'}`}>
                      <td data-label="Fornecedor" className="min-w-0">
                        <button type="button" onClick={() => abrirFicha({ tipo: 'fornecedor', id: f.id })} className={`${BOTAO_LINHA} break-words`}>
                          {f.nome}
                        </button>
                        {!f.ativo && <span className="selo selo-neutro ml-2">Inativo</span>}
                      </td>
                      {mostrarCnpj && (
                        <td data-label={f.cnpj ? 'CNPJ' : undefined} className="hidden xl:table-cell font-mono text-slate-600">
                          {f.cnpj || <SemDado />}
                        </td>
                      )}
                      {mostrarContato && (
                        <td data-label={f.contato || meiosContato ? 'Contato' : undefined} className="break-words">
                          {f.contato || meiosContato ? (
                            <span>
                              {f.contato && <span className="block text-slate-800">{f.contato}</span>}
                              {meiosContato && <span className="texto-aux block">{meiosContato}</span>}
                            </span>
                          ) : (
                            <SemDado />
                          )}
                        </td>
                      )}
                      {mostrarVinculos && (
                        <td data-label={vinculos && temVinculos(vinculos) ? 'Vínculos' : undefined}>
                          {vinculos && temVinculos(vinculos) ? resumoVinculos(vinculos) : <SemDado />}
                        </td>
                      )}
                      <td className="col-acoes">
                        <span className="acoes-linha">
                          <button
                            type="button"
                            onClick={() => setFornecedorAberto(f)}
                            title="Editar"
                            aria-label={`Editar o fornecedor ${f.nome}`}
                            className="btn-icone relative"
                          >
                            <Pencil />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={colunasFornecedores}>
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
    </div>
  );
};
