/**
 * Seção 9.4 · Compras de equipamento (aba do Financeiro) e valor do patrimônio.
 * Tudo vem da ficha fiscal do equipamento (data de aquisição, fornecedor, NF e
 * valor de compra): nada é lançado de novo aqui.
 */
import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import type { AssetCategory } from '../../types/index.ts';
import { formatDate } from '../../utils/formatters.ts';
import { normalizar } from '../../utils/processos.ts';
import { baixarCsv, brl, comprasDeEquipamentos, paraCsv, somarPor, valorPatrimonio, type CompraEquipamento } from '../../utils/financeiro.ts';
import { Busca, CabecalhoTela, Vazio } from '../ui/Tela.tsx';

const ROTULO_CATEGORIA_ATIVO: Record<AssetCategory, string> = {
  hardware: 'Hardware',
  periferico: 'Periférico',
  telefonia: 'Telefonia',
  software: 'Software',
};

/** Cartão "Valor do patrimônio" (Despesas e Compras): equipamentos sem baixa + acessórios em estoque */
export const CartaoPatrimonio: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { assets } = useApp();
  const { estoque } = useRecursos();
  const vp = useMemo(() => valorPatrimonio(assets, estoque), [assets, estoque]);
  return (
    <div className={`cartao min-w-0 p-3 ${className}`}>
      <p className="text-xs text-slate-500">Valor do patrimônio hoje</p>
      <p className="font-mono text-lg font-semibold text-slate-900">{brl(vp.total)}</p>
      <p className="text-xs text-slate-500">
        equipamentos <span className="font-mono">{brl(vp.equipamentos)}</span> · acessórios em estoque <span className="font-mono">{brl(vp.acessorios)}</span>
      </p>
      {vp.semValor > 0 && (
        <p className="text-xs text-amber-800">
          {vp.semValor} {vp.semValor === 1 ? 'equipamento sem valor de compra' : 'equipamentos sem valor de compra'}
        </p>
      )}
    </div>
  );
};

/** Soma por grupo com barra proporcional (mesmo desenho do "Realizado por" de Despesas) */
const BlocoSoma: React.FC<{ titulo: string; grupos: { chave: string; total: number }[]; total: number }> = ({ titulo, grupos, total }) => (
  <div className="cartao space-y-2 p-3">
    <h3 className="secao-titulo">{titulo}</h3>
    {grupos.length === 0 ? (
      <p className="text-xs text-slate-500">Nenhuma compra no período com estes filtros.</p>
    ) : (
      <ul className="space-y-2">
        {grupos.map((g) => (
          <li key={g.chave} className="text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-slate-800">{g.chave}</span>
              <span className="font-mono font-semibold">
                {brl(g.total)} <span className="font-normal text-slate-500">({total ? ((g.total / total) * 100).toFixed(0) : 0}%)</span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${total ? (g.total / total) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export const ComprasView: React.FC<{
  abas?: React.ReactNode;
  /** Período escolhido no Financeiro (o mesmo de Despesas) */
  periodo: { de: string; ate: string };
  /** Seletor de período (atalhos ou de/até), montado pelo Financeiro */
  filtroPeriodo: React.ReactNode;
}> = ({ abas, periodo, filtroPeriodo }) => {
  const { assets, fornecedores, abrirFicha } = useApp();
  const [fFornecedor, setFFornecedor] = useState('');
  const [fCategoria, setFCategoria] = useState<AssetCategory | ''>('');
  const [busca, setBusca] = useState('');
  const [incluirBaixados, setIncluirBaixados] = useState(false);

  const todas = useMemo(() => comprasDeEquipamentos(assets), [assets]);
  // Nome do cadastro de fornecedores; registro antigo sem vínculo mostra o texto digitado
  const nomeForn = (c: CompraEquipamento) => fornecedores.find((f) => f.id === c.fornecedorId)?.nome || c.fornecedorTexto || '';

  const termo = normalizar(busca.trim());
  const filtradas = todas.filter(
    (c) =>
      (incluirBaixados || !c.baixado) &&
      (!fFornecedor || c.fornecedorId === fFornecedor) &&
      (!fCategoria || c.categoria === fCategoria) &&
      (!termo || normalizar(`${c.tag} ${c.nome} ${c.numeroNF || ''}`).includes(termo))
  );
  const lista = filtradas.filter((c) => c.data && c.data.slice(0, 10) >= periodo.de && c.data.slice(0, 10) <= periodo.ate);
  const semData = filtradas.filter((c) => !c.data).length;
  const semValor = lista.filter((c) => !(c.valor > 0)).length;
  const total = lista.reduce((s, c) => s + c.valor, 0);
  const porFornecedor = somarPor(lista, (c) => nomeForn(c) || 'Sem fornecedor', (c) => c.valor);
  const porCategoria = somarPor(lista, (c) => ROTULO_CATEGORIA_ATIVO[c.categoria] || c.categoria, (c) => c.valor);

  const exportar = () =>
    baixarCsv(
      `compras-${periodo.de}-a-${periodo.ate}.csv`,
      paraCsv(
        ['Data de aquisição', 'Patrimônio', 'Equipamento', 'Categoria', 'Fornecedor', 'NF', 'Valor (R$)', 'Situação'],
        lista.map((c) => [c.data, c.tag, c.nome, ROTULO_CATEGORIA_ATIVO[c.categoria] || c.categoria, nomeForn(c), c.numeroNF || '', c.valor, c.baixado ? 'Baixado' : 'Ativo'])
      )
    );

  const limpar = () => {
    setFFornecedor('');
    setFCategoria('');
    setBusca('');
    setIncluirBaixados(false);
  };

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo="Financeiro"
        subtitulo={`Compras de equipamento de ${formatDate(periodo.de)} a ${formatDate(periodo.ate)}, pela data de aquisição · valor da ficha fiscal, sem lançamento novo`}
        acoes={
          <button type="button" onClick={exportar} className="btn btn-secundario">
            <Download /> Exportar CSV
          </button>
        }
        abas={abas}
        filtros={
          <>
            <Busca id="compras-busca" valor={busca} onMudar={setBusca} placeholder="Buscar por patrimônio, nome ou NF" />
            {filtroPeriodo}
            <select aria-label="Fornecedor" value={fFornecedor} onChange={(e) => setFFornecedor(e.target.value)} className="campo campo-sm">
              <option value="">Todos os fornecedores</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            <select aria-label="Categoria do equipamento" value={fCategoria} onChange={(e) => setFCategoria(e.target.value as AssetCategory | '')} className="campo campo-sm">
              <option value="">Todas as categorias</option>
              {(Object.keys(ROTULO_CATEGORIA_ATIVO) as AssetCategory[]).map((k) => (
                <option key={k} value={k}>
                  {ROTULO_CATEGORIA_ATIVO[k]}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
              <input type="checkbox" checked={incluirBaixados} onChange={(e) => setIncluirBaixados(e.target.checked)} /> Incluir baixados
            </label>
            <button type="button" onClick={limpar} className="btn btn-sm btn-secundario">
              Limpar filtros
            </button>
          </>
        }
      />

      {/* Números do período */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="cartao min-w-0 p-3">
          <p className="text-xs text-slate-500">Comprado no período</p>
          <p className="font-mono text-lg font-semibold text-slate-900">{brl(total)}</p>
          <p className="text-xs text-slate-500">pela data de aquisição</p>
        </div>
        <div className="cartao min-w-0 p-3">
          <p className="text-xs text-slate-500">Quantidade</p>
          <p className="font-mono text-lg font-semibold text-slate-900">{lista.length}</p>
          <p className={`text-xs ${semValor > 0 ? 'text-amber-800' : 'text-slate-500'}`}>
            {semValor > 0 ? `${semValor} sem valor de compra na ficha` : lista.length === 1 ? 'equipamento comprado' : 'equipamentos comprados'}
          </p>
        </div>
        <CartaoPatrimonio className="col-span-2 lg:col-span-1" />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <BlocoSoma titulo="Por fornecedor" grupos={porFornecedor} total={total} />
        <BlocoSoma titulo="Por categoria" grupos={porCategoria} total={total} />
      </div>

      {/* Detalhe */}
      <div className="cartao overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 pt-3">
          <h3 className="secao-titulo">Compras do período ({lista.length})</h3>
          {semData > 0 && (
            <p className="text-xs text-slate-500">
              {semData} {semData === 1 ? 'equipamento sem data de aquisição fica' : 'equipamentos sem data de aquisição ficam'} fora do período
            </p>
          )}
        </div>
        {lista.length === 0 ? (
          <div className="p-3">
            <Vazio>Nenhuma compra de equipamento no período com estes filtros.</Vazio>
          </div>
        ) : (
          <table className="tabela tabela-cartoes mt-2">
            <thead>
              <tr>
                <th>Data</th>
                <th>Equipamento</th>
                <th>Categoria</th>
                <th>Fornecedor</th>
                <th>NF</th>
                <th className="text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.ativoId}>
                  <td data-label="Data">{formatDate(c.data)}</td>
                  <td data-label="Equipamento">
                    <button type="button" onClick={() => abrirFicha({ tipo: 'ativo', id: c.ativoId })} className="link text-left">
                      <span className="font-mono">{c.tag}</span> · {c.nome}
                    </button>
                    {c.baixado && <span className="selo selo-neutro ml-1.5">Baixado</span>}
                  </td>
                  <td data-label="Categoria">{ROTULO_CATEGORIA_ATIVO[c.categoria] || c.categoria}</td>
                  <td data-label="Fornecedor">{nomeForn(c) || '—'}</td>
                  <td data-label="NF" className="font-mono">
                    {c.numeroNF || '—'}
                  </td>
                  <td data-label="Valor" className="text-right font-mono">
                    {c.valor > 0 ? brl(c.valor) : <span className="font-sans text-slate-500">sem valor</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
