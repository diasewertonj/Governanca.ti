/**
 * Seção 17 · Gestão de T.I.: Painel executivo, Orçamento (acompanhamento e
 * planejamento), Projeção, Patrimônio (imobilizado por ano, com fechamento) e
 * Relatórios/exportações. Tudo lê do mesmo livro (useGestao) — nada é somado à parte.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Copy, Download, FileSpreadsheet, ListTree, Lock, LockOpen, Pencil, Plus, Search, Sparkles, Split, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import type { CategoriaDespesa, FechamentoImobilizado, Orcamento, Rateio } from '../../types/index.ts';
import type { FichaAberta } from '../../utils/fichas.ts';
import { assentosOciosos, baixarCsv, baixarExcel, brl, brlOuTraco, paraCsv, paraExcel, ROTULO_CATEGORIA, valorPatrimonio } from '../../utils/financeiro.ts';
import { distribuirMensal } from '../../utils/compras.ts';
import { diasAte, formatDate } from '../../utils/formatters.ts';
import { DIAS_ALERTA_CONTRATO, nomeContrato, situacaoContrato } from '../../utils/contratos.ts';
import { custoPorFornecedor } from '../../utils/analises.ts';
import { ROTULO_GRUPO_DEPRECIACAO } from '../../utils/patrimonio.ts';
import {
  csvImobilizado,
  csvLancamentos,
  custoPorArea,
  depreciacaoMensal,
  imobilizadoDoAno,
  imobilizadoPor,
  indicadoresExecutivos,
  lancamentosDaLinha,
  projecaoPorAno,
  totaisImobilizado,
  type Lancamento,
  type LinhaGestao,
  type LinhaImobilizado,
  type Projecao,
  type TotaisImobilizado,
} from '../../utils/gestaoFinanceira.ts';
import { fecharImobilizado, listarFechamentos, listarRateios, reabrirImobilizado, salvarRateioDe } from '../../services/financeiroDb.ts';
import { supabase } from '../../services/supabase.ts';
import { areaDoOrcamento, useGestao, type Regime } from './useGestao.ts';
import { LinkFicha, Numero, pct } from './pecas.tsx';
import { CopiarOrcamento, FormOrcamento } from '../compras/OrcamentoView.tsx';
import { copiarOrcamentos } from '../../utils/compras.ts';
import { ABAS_ANALISE, AnalisesView, type AbaAnalise } from './AnalisesView.tsx';
import { Abas } from '../ui/Abas.tsx';
import { confirmar, pedirTexto } from '../ui/dialogo.tsx';
import { Janela } from '../ui/Janela.tsx';
import { CabecalhoTela, Vazio } from '../ui/Tela.tsx';
import { CLASSE_CAMPO } from '../comum/campos.ts';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (aaaamm: string) => `${MESES[Number(aaaamm.slice(5, 7)) - 1]}/${aaaamm.slice(2, 4)}`;
const ANO_ATUAL = new Date().getFullYear();

/** Texto e ficha de onde veio um lançamento do livro (fatura de contrato, licença, pedido, equipamento ou avulsa) */
function useOrigemDoLancamento() {
  const { faturas, contratos, licenses, assets, fornecedores } = useApp();
  const { pedidos } = useCompras();
  return (l: Lancamento): { texto: string; ficha?: FichaAberta } => {
    const o = l.origem || {};
    if (o.contrato) {
      const c = contratos.find((x) => x.id === o.contrato);
      return c ? { texto: nomeContrato(c), ficha: { tipo: 'contrato', id: c.id } } : { texto: 'Contrato' };
    }
    if (o.licenca) {
      const s = licenses.find((x) => x.id === o.licenca);
      return s ? { texto: s.nome, ficha: { tipo: 'software', id: s.id } } : { texto: 'Software' };
    }
    if (o.pedido) {
      const p = pedidos.find((x) => x.id === o.pedido);
      return p ? { texto: `${p.codigo} · ${p.titulo}`, ficha: { tipo: 'pedido', id: p.id } } : { texto: 'Pedido de compra' };
    }
    if (o.ativo) {
      const a = assets.find((x) => x.id === o.ativo);
      return a ? { texto: `${a.tag} · ${a.nome}`, ficha: { tipo: 'ativo', id: a.id } } : { texto: 'Equipamento' };
    }
    const f = o.fatura ? faturas.find((x) => x.id === o.fatura) : undefined;
    const forn = f?.fornecedorId ? fornecedores.find((x) => x.id === f.fornecedorId) : undefined;
    return { texto: f?.descricao || forn?.nome || 'Conta avulsa', ficha: forn ? { tipo: 'fornecedor', id: forn.id } : undefined };
  };
}

const ROTULO_SITUACAO: Record<Lancamento['situacao'], string> = { realizado: 'Realizado (pago)', a_pagar: 'A pagar', comprometido: 'Comprometido' };
const SELO_SITUACAO: Record<Lancamento['situacao'], string> = { realizado: 'selo-ok', a_pagar: 'selo-atencao', comprometido: 'selo-neutro' };

const SeletorAno: React.FC<{ ano: number; onMudar: (a: number) => void; anos?: number[] }> = ({ ano, onMudar, anos }) => {
  const lista = anos?.length ? anos : [ANO_ATUAL + 1, ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2, ANO_ATUAL - 3];
  return (
    <select aria-label="Ano" value={ano} onChange={(e) => onMudar(Number(e.target.value))} className="campo campo-sm">
      {lista.map((a) => (
        <option key={a} value={a}>{a}</option>
      ))}
    </select>
  );
};

/** Fornecedor de uma fatura: o da avulsa, do pedido, do contrato ou da licença */
function useFornecedorDaFatura() {
  const { contratos, licenses } = useApp();
  const { pedidos } = useCompras();
  return (f: { fornecedorId?: string; pedidoId?: string; contratoId?: string; licencaId?: string }) =>
    f.fornecedorId ||
    (f.pedidoId && pedidos.find((p) => p.id === f.pedidoId)?.fornecedorId) ||
    (f.contratoId && contratos.find((c) => c.id === f.contratoId)?.fornecedorId) ||
    (f.licencaId && licenses.find((l) => l.id === f.licencaId)?.fornecedorId) ||
    '';
}

// -----------------------------------------------------------------------------
// Painel executivo (só o admin — decisão 2)
// -----------------------------------------------------------------------------
export const PainelExecutivoView: React.FC<{ onNavigate: (v: string) => void }> = ({ onNavigate }) => {
  const { faturas, contratos, licenses, assets, fornecedores, settings, abrirFicha } = useApp();
  const { estoque } = useRecursos();
  const g = useGestao(ANO_ATUAL);
  const fornecedorDe = useFornecedorDaFatura();
  const mes = new Date().getMonth();
  const orcadoAno = g.orcamentoDoAno.reduce((s, o) => s + o.valorAnual, 0);
  const ind = indicadoresExecutivos(g.lancamentos, orcadoAno, g.colaboradoresAtivos, g.projecao);
  const usados = g.lancamentos.filter((l) => l.situacao !== 'comprometido');
  const doMes = usados.filter((l) => l.mes === mes).reduce((s, l) => s + l.valor, 0);
  const comprometido = g.lancamentos.filter((l) => l.situacao === 'comprometido').reduce((s, l) => s + l.valor, 0);
  // Mesma definição da tela Orçamento: usado = pago + a pagar + comprometido
  const pctUsado = orcadoAno > 0 ? (ind.totalAno + comprometido) / orcadoAno : undefined;
  const patrimonio = useMemo(() => valorPatrimonio(assets, estoque, settings.vidaUtil), [assets, estoque, settings.vidaUtil]);
  // Mesmo número da tela Patrimônio (saldo do imobilizado CAPEX em 31/12), para a diferença de base ficar à vista
  const imobilizado3112 = useMemo(() => totaisImobilizado(imobilizadoDoAno(assets, ANO_ATUAL, settings.vidaUtil, g.limite)).liquidoFinal, [assets, settings.vidaUtil, g.limite]);
  const ociosos = assentosOciosos(licenses, contratos);
  // Só os meses com valor (meses zerados não ocupam linha)
  const porMes = MESES.map((_, m) => ({
    m,
    opex: usados.filter((l) => l.mes === m && l.natureza === 'opex').reduce((s, l) => s + l.valor, 0),
    capex: usados.filter((l) => l.mes === m && l.natureza === 'capex').reduce((s, l) => s + l.valor, 0),
  })).filter((x) => x.opex + x.capex > 0.004);
  const maior = Math.max(1, ...porMes.map((m) => m.opex + m.capex));
  // Seção 27: mesma conta de Análises › Fornecedores (custoPorFornecedor sobre o livro), só o pago
  const { top, semFornecedor } = useMemo(() => {
    const doFornecedor = (id: string) => fornecedorDe(faturas.find((f) => f.id === id) || {});
    const lista = custoPorFornecedor(g.lancamentos, doFornecedor, { contratos, licencas: licenses }).filter((x) => x.pago > 0.004);
    return {
      top: lista.filter((x) => x.fornecedorId).sort((a, b) => b.pago - a.pago).slice(0, 10).map((x) => [x.fornecedorId, x.pago] as const),
      semFornecedor: lista.filter((x) => !x.fornecedorId).reduce((s, x) => s + x.pago, 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.lancamentos, faturas, contratos, licenses]);
  // Seção 27: a mesma janela do Início e dos alertas (situacaoContrato, 60 dias)
  const vencendo = contratos
    .filter((c) => situacaoContrato(c).situacao === 'vencendo')
    .sort((a, b) => (a.fim || '').localeCompare(b.fim || ''));
  const reposicoes = g.projecao.itens.filter((i) => i.origem === 'reposicao').slice(0, 8);
  const primeiroMesProj = g.projecao.meses[0]?.mes;

  return (
    <div className="space-y-4">
      <CabecalhoTela titulo="Painel executivo" subtitulo={`Custo de T.I. em ${ANO_ATUAL} por competência · realizado = pago; a pagar = fatura lançada · para apresentar à diretoria`} />
      <div className="grid items-start grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Numero rotulo={`Realizado + a pagar em ${ANO_ATUAL}`} valor={brl(ind.totalAno)} detalhe={`OPEX ${brl(ind.opexAno)} · CAPEX ${brl(ind.capexAno)}`} onAbrir={() => onNavigate('orcamento')} />
        <Numero rotulo={`Realizado + a pagar em ${MESES[mes]}`} valor={brl(doMes)} detalhe="ver contas a pagar" onAbrir={() => onNavigate('financeiro')} />
        <Numero
          rotulo="Orçamento usado"
          valor={pct(pctUsado)}
          detalhe={orcadoAno ? `de ${brl(orcadoAno)} · inclui ${brl(comprometido)} comprometido` : 'sem orçamento no ano'}
          tom={pctUsado !== undefined && pctUsado >= 1 ? 'problema' : pctUsado !== undefined && pctUsado >= 0.9 ? 'atencao' : undefined}
          onAbrir={() => onNavigate('orcamento')}
        />
        <Numero rotulo={`OPEX por colaborador em ${ANO_ATUAL}`} valor={ind.custoPorColaborador !== undefined ? brl(ind.custoPorColaborador) : '—'} detalhe={`${g.colaboradoresAtivos} colaboradores ativos`} />
        <Numero
          rotulo="Projeção · próximos 12 meses"
          valor={brl(ind.projecao12m)}
          detalhe={primeiroMesProj ? `a partir de ${rotuloMes(primeiroMesProj)} · recorrentes, reposições e pedidos` : undefined}
          onAbrir={() => onNavigate('projecao')}
        />
        <Numero
          rotulo="Patrimônio · valor hoje"
          valor={brl(patrimonio.totalAtual)}
          detalhe={`equipamentos e estoque · imobilizado (CAPEX) em 31/12: ${brl(imobilizado3112)}`}
          onAbrir={() => onNavigate('patrimonio')}
        />
      </div>

      <div className="grid items-start grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="cartao p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="secao-titulo">Mês a mês ({ANO_ATUAL}, realizado + a pagar)</h3>
            <span className="texto-aux">
              <span className="inline-block w-2.5 h-2.5 bg-blue-600 rounded-sm align-middle" /> OPEX{' '}
              <span className="inline-block w-2.5 h-2.5 bg-emerald-600 rounded-sm align-middle ml-2" /> CAPEX
            </span>
          </div>
          {porMes.length === 0 ? (
            <p className="texto-aux">Nada lançado em {ANO_ATUAL}.</p>
          ) : (
            <ul className="space-y-2">
              {porMes.map((x) => (
                <li key={x.m} className="grid grid-cols-[2.5rem_1fr_6.5rem] items-center gap-2">
                  <span className="text-slate-600">{MESES[x.m]}</span>
                  <span className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
                    <span className="block h-full bg-blue-600" style={{ width: `${(x.opex / maior) * 100}%` }} />
                    <span className="block h-full bg-emerald-600" style={{ width: `${(x.capex / maior) * 100}%` }} />
                  </span>
                  <span className="text-right num">{brl(x.opex + x.capex)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cartao p-3 space-y-2">
          <h3 className="secao-titulo">Maiores fornecedores ({ANO_ATUAL}, pago)</h3>
          {top.length === 0 ? (
            <p className="texto-aux">Nada pago a fornecedor no ano.</p>
          ) : (
            <ol className="space-y-1">
              {top.map(([id, v], i) => (
                <li key={id} className="flex justify-between gap-2">
                  <span className="flex min-w-0 gap-1">
                    <span className="text-slate-500">{i + 1}.</span>
                    <LinkFicha ficha={{ tipo: 'fornecedor', id }}>{fornecedores.find((f) => f.id === id)?.nome || 'Fornecedor'}</LinkFicha>
                  </span>
                  <span className="num">{brl(v)}</span>
                </li>
              ))}
            </ol>
          )}
          {semFornecedor > 0 && <p className="texto-aux">Sem fornecedor: <span className="num">{brl(semFornecedor)}</span></p>}
        </div>
        <div className="cartao p-3 space-y-2">
          <h3 className="secao-titulo">Contratos que vencem em {DIAS_ALERTA_CONTRATO} dias</h3>
          {vencendo.length === 0 ? (
            <p className="texto-aux">Nenhum.</p>
          ) : (
            <ul className="space-y-1">
              {vencendo.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <LinkFicha ficha={{ tipo: 'contrato', id: c.id }}>{nomeContrato(c)}</LinkFicha>
                  <span className="num text-slate-600">{formatDate(c.fim || '')} ({diasAte(c.fim || '')} dias)</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cartao p-3 space-y-2">
          <h3 className="secao-titulo">Desperdício e reposições</h3>
          <p>
            Licenças sem uso: <span className="num font-semibold text-amber-800">{brl(ociosos.reduce((s, o) => s + o.custoMensal, 0))}/mês</span>{' '}
            {ociosos.map((o, i) => (
              <React.Fragment key={o.licenca.id}>
                {i > 0 && ', '}
                <button type="button" onClick={() => abrirFicha({ tipo: 'software', id: o.licenca.id })} className="link">{o.licenca.nome}</button>
                <span className="text-slate-500"> ({o.livres})</span>
              </React.Fragment>
            ))}
          </p>
          <p className="text-slate-700">Próximas reposições (fim da vida útil)</p>
          {reposicoes.length === 0 ? (
            <p className="texto-aux">Nenhuma nos próximos 36 meses.</p>
          ) : (
            <ul className="space-y-1">
              {reposicoes.map((r) => (
                <li key={r.nome + r.mes} className="flex justify-between gap-2">
                  <LinkFicha ficha={r.origemId ? { tipo: 'ativo', id: r.origemId } : undefined}>{r.nome}</LinkFicha>
                  <span className="num">{rotuloMes(r.mes)} · {brl(r.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Orçamento: acompanhamento (previsto · comprometido · a pagar · realizado) e planejamento
// -----------------------------------------------------------------------------
export type AbaOrcamento = 'acompanhamento' | 'projecao';

// Seção 23: Orçamento e Projeção num item só do menu. Seção 27: o Planejamento entrou no
// Orçamento (edição na própria linha) — duas abas, uma conta só.
export const OrcamentoGestaoView: React.FC<{ abaInicial?: AbaOrcamento }> = ({ abaInicial = 'acompanhamento' }) => {
  const [aba, setAba] = useState<AbaOrcamento>(abaInicial);
  const abas = (
    <Abas
      rotulo="Orçamento e projeção"
      ativa={aba}
      onMudar={setAba}
      itens={[
        { id: 'acompanhamento' as const, rotulo: 'Orçamento' },
        { id: 'projecao' as const, rotulo: 'Projeção' },
      ]}
    />
  );
  if (aba === 'projecao') return <ProjecaoView abas={abas} />;
  return <AcompanhamentoOrcamento abas={abas} />;
};

const naturezaDoOrcamento = (o: Pick<Orcamento, 'natureza' | 'categoria'>) => o.natureza || (o.categoria === 'hardware' ? 'capex' : 'opex');

const AcompanhamentoOrcamento: React.FC<{ abas: React.ReactNode }> = ({ abas }) => {
  const { currentRole, departments, settings, contratos, licenses } = useApp();
  const { orcamentos, salvarOrcamentos, excluirOrcamento } = useCompras();
  const isAdmin = currentRole === 'ti_admin';
  const [ano, setAno] = useState(ANO_ATUAL);
  const [regime, setRegime] = useState<Regime>('competencia');
  const [natureza, setNatureza] = useState<'' | 'capex' | 'opex'>('');
  const [visao, setVisao] = useState<'linhas' | 'meses'>('linhas');
  const [editando, setEditando] = useState<Orcamento | null>(null);
  const [copiando, setCopiando] = useState(false);
  const [erro, setErro] = useState('');
  const g = useGestao(ano, regime);
  // Base "o que foi gasto" da cópia: o ano anterior na mesma conta
  const gAnterior = useGestao(ano - 1, regime);
  const mapa = settings.premissasFinanceiras?.mapaAreas;
  const linhas = g.linhasGestao.filter((l) => !natureza || l.natureza === natureza);
  const areas = useMemo(
    () => [...new Set([...departments.map((d) => d.nome), ...orcamentos.map((o) => o.area), ...contratos.map((c) => c.centroCusto || ''), ...licenses.map((l) => l.centroCusto || '')].filter(Boolean))].sort(),
    [departments, orcamentos, contratos, licenses]
  );
  // Linha da tabela → orçamento cadastrado (mesma natureza, categoria e área)
  const orcamentoDaLinha = (l: LinhaGestao) =>
    orcamentos.find(
      (o) => o.ano === ano && o.categoria === l.categoria && naturezaDoOrcamento(o) === l.natureza && areaDoOrcamento(o, departments, mapa).toLowerCase() === l.area.trim().toLowerCase()
    );
  const editar = (l: LinhaGestao) => {
    const o = orcamentoDaLinha(l);
    setEditando(
      o
        ? { ...o, meses: o.meses.length === 12 ? [...o.meses] : distribuirMensal(o.valorAnual) }
        : { id: `orc-${crypto.randomUUID()}`, ano, categoria: l.categoria, area: l.area, natureza: l.natureza, valorAnual: 0, meses: Array(12).fill(0) }
    );
  };
  const nova = () => setEditando({ id: `orc-${crypto.randomUUID()}`, ano, categoria: 'hardware', area: '', valorAnual: 0, meses: Array(12).fill(0) });
  const excluir = async (l: LinhaGestao) => {
    const o = orcamentoDaLinha(l);
    if (!o) return;
    const ok = await confirmar({
      titulo: `Excluir o orçamento de ${ROTULO_CATEGORIA[l.categoria]}${l.area ? ` · ${l.area}` : ''} em ${ano}?`,
      mensagem: 'O previsto desta linha deixa de existir; os gastos continuam aparecendo, sem previsto. Não dá para desfazer: cadastre de novo se precisar.',
      confirmar: 'Excluir',
      cancelar: 'Voltar',
      perigo: true,
    });
    if (!ok) return;
    setErro((await excluirOrcamento(o.id)) || '');
  };
  // Mês a mês: previsto (meses do orçamento) × realizado + a pagar (livro)
  const porMes = MESES.map((_, i) => {
    const previsto = g.orcamentoDoAno
      .filter((o) => !natureza || naturezaDoOrcamento(o) === natureza)
      .reduce((s, o) => s + (o.meses.length === 12 ? o.meses[i] : o.valorAnual / 12), 0);
    const usado = g.lancamentos.filter((x) => x.mes === i && x.situacao !== 'comprometido' && (!natureza || x.natureza === natureza)).reduce((s, x) => s + x.valor, 0);
    return { previsto, usado };
  });
  const soma = (ls: LinhaGestao[]) => ({
    previsto: ls.reduce((s, l) => s + l.previsto, 0),
    comprometido: ls.reduce((s, l) => s + l.comprometido, 0),
    aPagar: ls.reduce((s, l) => s + l.aPagar, 0),
    realizado: ls.reduce((s, l) => s + l.realizado, 0),
    disponivel: ls.reduce((s, l) => s + l.disponivel, 0),
    projecaoDezembro: ls.reduce((s, l) => s + l.projecaoDezembro, 0),
  });
  const grupos = (['opex', 'capex'] as const).map((n) => ({ n, ls: linhas.filter((l) => l.natureza === n) })).filter((x) => x.ls.length);
  const total = soma(linhas);
  // Coluna sem nenhum dado some (ex.: nenhuma linha com área)
  const comArea = linhas.some((l) => l.area);
  const [aberta, setAberta] = useState<LinhaGestao | null>(null);
  const passado = ano < ANO_ATUAL;

  const exportar = (excel: boolean) => {
    const cab = ['Natureza', 'Categoria', 'Área', 'Previsto', 'Comprometido', 'A pagar', 'Realizado', 'Disponível', 'Projeção até dezembro', '% usado'];
    const ls = linhas.map((l) => [l.natureza.toUpperCase(), ROTULO_CATEGORIA[l.categoria], l.area || 'Geral', l.previsto, l.comprometido, l.aPagar, l.realizado, l.disponivel, l.projecaoDezembro, l.pct !== undefined ? Math.round(l.pct * 100) : undefined]);
    if (excel) baixarExcel(`orcamento-${ano}.xls`, paraExcel(`Orçamento ${ano}`, cab, ls));
    else baixarCsv(`orcamento-${ano}.csv`, paraCsv(cab, ls));
  };

  const pctDe = (s: SomaGestao) => (s.previsto ? (s.realizado + s.aPagar + s.comprometido) / s.previsto : undefined);

  const linha = (l: LinhaGestao) => (
    <tr key={l.chave} className="cursor-pointer hover:bg-slate-50" onClick={() => setAberta(l)}>
      <td data-label="Categoria">
        <button type="button" onClick={(e) => { e.stopPropagation(); setAberta(l); }} className="link text-left">{ROTULO_CATEGORIA[l.categoria]}</button>
      </td>
      {comArea && <td data-label="Área">{l.area || 'Geral'}</td>}
      <ValoresGestao s={l} pctUso={l.pct} />
      {isAdmin && (
        <td data-label="Ações" className="col-acoes" onClick={(e) => e.stopPropagation()}>
          <span className="acoes-linha">
            <button type="button" onClick={() => editar(l)} className="btn btn-sm btn-secundario">
              {orcamentoDaLinha(l) ? <><Pencil /> Editar</> : <><Plus /> Orçar</>}
            </button>
            {orcamentoDaLinha(l) && (
              <button type="button" onClick={() => excluir(l)} aria-label={`Excluir o orçamento de ${ROTULO_CATEGORIA[l.categoria]} ${l.area}`} title="Excluir" className="btn-icone btn-icone-perigo">
                <Trash2 />
              </button>
            )}
          </span>
        </td>
      )}
    </tr>
  );

  return (
    <div className="space-y-3">
      <CabecalhoTela
        titulo="Orçamento"
        subtitulo={`Comprometido = pedido aprovado sem fatura · realizado = pago · área = departamento · clique na linha para ver os lançamentos${isAdmin ? '' : ' · só o administrador edita o previsto'}`}
        abas={abas}
        acoes={
          <>
            {isAdmin && (
              <>
                <button type="button" onClick={() => setCopiando(true)} className="btn btn-secundario"><Copy /> Copiar do ano anterior</button>
                <button type="button" onClick={nova} className="btn btn-primario"><Plus /> Nova linha</button>
              </>
            )}
            <button type="button" onClick={() => exportar(false)} className="btn btn-secundario"><Download /> CSV</button>
            <button type="button" onClick={() => exportar(true)} className="btn btn-secundario"><FileSpreadsheet /> Excel</button>
          </>
        }
        filtros={
          <>
            <SeletorAno ano={ano} onMudar={setAno} />
            <select aria-label="Regime" value={regime} onChange={(e) => setRegime(e.target.value as Regime)} className="campo campo-sm">
              <option value="competencia">Por competência</option>
              <option value="caixa">Por caixa (data do pagamento)</option>
            </select>
            <select aria-label="Natureza" value={natureza} onChange={(e) => setNatureza(e.target.value as typeof natureza)} className="campo campo-sm">
              <option value="">CAPEX e OPEX</option>
              <option value="opex">Só OPEX</option>
              <option value="capex">Só CAPEX</option>
            </select>
            <select aria-label="Visão" value={visao} onChange={(e) => setVisao(e.target.value as typeof visao)} className="campo campo-sm">
              <option value="linhas">Por categoria e área</option>
              <option value="meses">Mês a mês</option>
            </select>
          </>
        }
      />
      {erro && <p role="alert" className="erro">{erro}</p>}
      <div className="grid items-start grid-cols-2 lg:grid-cols-5 gap-3">
        <Numero rotulo="Previsto" valor={brl(total.previsto)} />
        <Numero rotulo="Comprometido" valor={brl(total.comprometido)} detalhe="pedido aprovado sem fatura" />
        <Numero rotulo="Realizado + a pagar" valor={brl(total.realizado + total.aPagar)} detalhe={`realizado (pago) ${brl(total.realizado)}`} />
        <Numero rotulo="Disponível" valor={brl(total.disponivel)} detalhe="previsto − (realizado + a pagar + comprometido)" tom={total.disponivel < 0 ? 'problema' : undefined} />
        <Numero
          rotulo="Projeção até dezembro"
          valor={brl(total.projecaoDezembro)}
          detalhe={passado ? 'ano encerrado: igual ao usado' : 'usado + recorrente que falta até 31/12'}
          tom={total.previsto && total.projecaoDezembro > total.previsto ? 'atencao' : undefined}
        />
      </div>
      {visao === 'meses' ? (
        <div className="cartao-tabela">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Mês</th>
                <th className="num">Previsto</th>
                <th className="num">Realizado + a pagar</th>
                <th className="num">Diferença</th>
                <th className="num" title="Sem os pedidos comprometidos (eles não têm mês de pagamento)">Acumulado (realizado + a pagar ÷ previsto)</th>
              </tr>
            </thead>
            <tbody>
              {porMes.map((m, i) => {
                const prevAc = porMes.slice(0, i + 1).reduce((s, x) => s + x.previsto, 0);
                const usoAc = porMes.slice(0, i + 1).reduce((s, x) => s + x.usado, 0);
                const dif = m.previsto - m.usado;
                return (
                  <tr key={MESES[i]}>
                    <td data-label="Mês">{MESES[i]}/{ano}</td>
                    <td data-label="Previsto" className="num">{brlOuTraco(m.previsto)}</td>
                    <td data-label="Realizado + a pagar" className="num">{brlOuTraco(m.usado)}</td>
                    <td data-label="Diferença" className={`num ${dif < 0 ? 'text-red-700' : ''}`}>{brlOuTraco(dif)}</td>
                    <td data-label="Acumulado" className="num">{prevAc > 0 ? pct(usoAc / prevAc) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : linhas.length === 0 ? (
        <Vazio acao={isAdmin ? <button type="button" onClick={nova} className="btn btn-sm btn-primario"><Plus /> Nova linha</button> : undefined}>
          Sem orçamento nem gastos em {ano}. {isAdmin ? 'Cadastre uma linha, copie do ano anterior ou gere a partir da Projeção.' : ''}
        </Vazio>
      ) : (
        <div className="cartao-tabela">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Categoria</th>
                {comArea && <th>Área</th>}
                <th className="num">Previsto</th>
                <th className="num">Comprometido</th>
                <th className="num">A pagar</th>
                <th className="num">Realizado</th>
                <th className="num">Disponível</th>
                <th className="num">Projeção até dez.</th>
                <th className="num">% usado</th>
                {isAdmin && <th className="col-acoes">Ações</th>}
              </tr>
            </thead>
            {grupos.map(({ n, ls }) => {
              const s = soma(ls);
              return (
                <tbody key={n}>
                  <tr className="bg-slate-50">
                    <td colSpan={comArea ? 2 : 1} className="font-semibold text-slate-900">{n === 'opex' ? 'OPEX (despesas do dia a dia)' : 'CAPEX (investimentos)'}</td>
                    <ValoresGestao s={s} pctUso={pctDe(s)} forte />
                    {isAdmin && <td />}
                  </tr>
                  {ls.map(linha)}
                </tbody>
              );
            })}
            <tfoot>
              <tr>
                <td colSpan={comArea ? 2 : 1} className="font-semibold text-slate-900">Total</td>
                <ValoresGestao s={total} pctUso={pctDe(total)} forte />
                {isAdmin && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {aberta && <JanelaRecorte linha={aberta} lancamentos={lancamentosDaLinha(g.lancamentos, aberta.chave)} ano={ano} onFechar={() => setAberta(null)} />}
      {editando && (
        <FormOrcamento
          inicial={editando}
          areas={areas}
          onClose={() => setEditando(null)}
          onSalvar={async (o) => {
            const r = await salvarOrcamentos([o]);
            if (!r) setEditando(null);
            return r;
          }}
        />
      )}
      {copiando && (
        <CopiarOrcamento
          anoDestino={ano}
          onClose={() => setCopiando(false)}
          onCopiar={async (origem, reajuste, base) => {
            // Base "gasto": realizado + a pagar do ano anterior, mês a mês, na mesma conta do Orçamento
            const fonte: Orcamento[] =
              base === 'previsto'
                ? orcamentos
                : gAnterior.linhasGestao.map((l) => {
                    const meses = Array(12).fill(0) as number[];
                    lancamentosDaLinha(gAnterior.lancamentos, l.chave)
                      .filter((x) => x.situacao !== 'comprometido')
                      .forEach((x) => (meses[x.mes] += x.valor));
                    return { id: l.chave, ano: origem, categoria: l.categoria, area: l.area, natureza: l.natureza, valorAnual: l.realizado + l.aPagar, meses };
                  });
            const existentes = new Set(orcamentos.filter((o) => o.ano === ano).map((o) => `${o.categoria}|${naturezaDoOrcamento(o)}|${o.area.trim().toLowerCase()}`));
            const novas = copiarOrcamentos(fonte, origem, ano, reajuste)
              .filter((o) => o.valorAnual > 0 && !existentes.has(`${o.categoria}|${naturezaDoOrcamento(o)}|${o.area.trim().toLowerCase()}`))
              .map((o) => ({ ...o, id: `orc-${crypto.randomUUID()}` }));
            if (novas.length === 0) return `Nada para copiar: ${ano - 1} não tem ${base === 'previsto' ? 'orçamento' : 'gasto'} ou ${ano} já tem as mesmas linhas.`;
            const r = await salvarOrcamentos(novas);
            if (!r) setCopiando(false);
            return r;
          }}
        />
      )}
    </div>
  );
};

type SomaGestao = Pick<LinhaGestao, 'previsto' | 'comprometido' | 'aPagar' | 'realizado' | 'disponivel' | 'projecaoDezembro'>;

/** Colunas de valor do orçamento; vermelho só para o que estourou (disponível negativo), projeção acima do previsto é aviso */
const ValoresGestao: React.FC<{ s: SomaGestao; pctUso?: number; forte?: boolean }> = ({ s, pctUso, forte }) => {
  const peso = forte ? 'font-semibold' : '';
  return (
    <>
      <td data-label="Previsto" className={`num ${peso}`}>{brlOuTraco(s.previsto)}</td>
      <td data-label="Comprometido" className={`num ${peso}`}>{brlOuTraco(s.comprometido)}</td>
      <td data-label="A pagar" className={`num ${peso}`}>{brlOuTraco(s.aPagar)}</td>
      <td data-label="Realizado" className={`num ${peso}`}>{brlOuTraco(s.realizado)}</td>
      <td data-label="Disponível" className={`num ${peso} ${s.disponivel < 0 ? 'text-red-700' : ''}`}>{brlOuTraco(s.disponivel)}</td>
      <td data-label="Projeção até dez." className={`num ${peso} ${s.previsto && s.projecaoDezembro > s.previsto ? 'text-amber-800' : ''}`}>{brlOuTraco(s.projecaoDezembro)}</td>
      <td data-label="% usado" className="num">{pct(pctUso)}</td>
    </>
  );
};

/** Colunas do imobilizado (saldo inicial, aquisições, baixas, depreciação, saldo final) */
const TotaisImob: React.FC<{ t: TotaisImobilizado; forte?: boolean }> = ({ t, forte }) => {
  const peso = forte ? 'font-semibold' : '';
  return (
    <>
      <td data-label="Saldo em 01/01" className={`num ${peso}`}>{brlOuTraco(t.liquidoInicial)}</td>
      <td data-label="Aquisições" className={`num ${peso}`}>{brlOuTraco(t.aquisicoes)}</td>
      <td data-label="Baixas" className={`num ${peso}`}>{brlOuTraco(t.baixasCusto - t.baixasDepAcum)}</td>
      <td data-label="Depreciação" className={`num ${peso}`}>{brlOuTraco(t.depreciacaoAno)}</td>
      <td data-label="Saldo em 31/12" className="num font-semibold">{brlOuTraco(t.liquidoFinal)}</td>
    </>
  );
};

/** Orçamento: a linha (categoria · área) abre os lançamentos daquele recorte, cada um com link para a origem */
const JanelaRecorte: React.FC<{ linha: LinhaGestao; lancamentos: Lancamento[]; ano: number; onFechar: () => void }> = ({ linha, lancamentos, ano, onFechar }) => {
  const origemDe = useOrigemDoLancamento();
  const lista = [...lancamentos].sort((a, b) => b.mes - a.mes || b.valor - a.valor);
  const falta = Math.round((linha.projecaoDezembro - (linha.realizado + linha.aPagar + linha.comprometido)) * 100) / 100;
  return (
    <Janela
      tamanho="m"
      titulo={`${ROTULO_CATEGORIA[linha.categoria]} · ${linha.area || 'Geral'}`}
      subtitulo={`${linha.natureza.toUpperCase()} · ${ano} · ${lancamentos.length} lançamento(s)`}
      icone={<ListTree className="ico" />}
      onFechar={onFechar}
    >
      <div className="space-y-2">
        {lista.length === 0 ? (
          <p className="texto-aux">Nenhum lançamento em {ano} nesta linha{linha.previsto ? ' (só o previsto)' : ''}.</p>
        ) : (
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Competência</th>
                <th>Origem</th>
                <th>Situação</th>
                <th className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((l, i) => {
                const o = origemDe(l);
                return (
                  <tr key={(l.origem?.fatura || l.origem?.pedido || l.origem?.ativo || '') + i}>
                    <td data-label="Competência" className="num">{MESES[l.mes]}/{String(ano).slice(2)}</td>
                    <td data-label="Origem"><LinkFicha ficha={o.ficha}>{o.texto}</LinkFicha></td>
                    <td data-label="Situação"><span className={`selo ${SELO_SITUACAO[l.situacao]}`}>{ROTULO_SITUACAO[l.situacao]}</span></td>
                    <td data-label="Valor" className="num">{brl(l.valor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {falta > 0.004 && (
          <p className="texto-aux">Recorrente que falta até 31/12 (projeção, ainda sem fatura): <span className="num">{brl(falta)}</span></p>
        )}
      </div>
    </Janela>
  );
};

// -----------------------------------------------------------------------------
// Projeção 12/24/36 meses (decisão 9) + gerar o orçamento do próximo ano
// -----------------------------------------------------------------------------
export const ProjecaoView: React.FC<{ abas?: React.ReactNode }> = ({ abas }) => {
  const { currentRole } = useApp();
  const { orcamentos, salvarOrcamentos } = useCompras();
  const g = useGestao(ANO_ATUAL);
  const [meses, setMeses] = useState(24);
  const [aviso, setAviso] = useState('');
  const isAdmin = currentRole === 'ti_admin';
  const detalhe = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const [mesAberto, setMesAberto] = useState<string | null>(null);
  const lista = g.projecao.meses.slice(0, meses);
  const porAno = projecaoPorAno(lista);
  const total = lista.reduce((s, m) => s + m.total, 0);
  const capex = lista.reduce((s, m) => s + m.capex, 0);
  const ate = lista[lista.length - 1]?.mes;
  const itens = g.projecao.itens.filter((i) => ate && i.mes <= ate);
  const somaCategoria = new Map<string, number>();
  itens.forEach((i) => somaCategoria.set(i.categoria, (somaCategoria.get(i.categoria) || 0) + i.valor));
  const porCategoria = [...somaCategoria.entries()].sort((a, b) => b[1] - a[1]);
  const proximo = ANO_ATUAL + 1;

  const gerarOrcamento = async () => {
    const doAno = g.projecao.itens.filter((i) => i.mes.startsWith(`${proximo}-`));
    if (!doAno.length) return setAviso(`A projeção não tem gastos em ${proximo}.`);
    const m = new Map<string, { categoria: CategoriaDespesa; natureza: 'capex' | 'opex'; meses: number[] }>();
    doAno.forEach((i) => {
      const categoria = i.categoria as CategoriaDespesa;
      const k = categoria;
      const atual = m.get(k) || { categoria, natureza: i.natureza, meses: Array(12).fill(0) };
      atual.meses[Number(i.mes.slice(5, 7)) - 1] += i.valor;
      if (i.natureza === 'capex') atual.natureza = 'capex';
      m.set(k, atual);
    });
    const existentes = orcamentos.filter((o) => o.ano === proximo && !o.area.trim());
    const ok = await confirmar({
      titulo: `Gerar o orçamento de ${proximo} a partir da projeção?`,
      mensagem: `Cria ${m.size} linha(s) gerais (sem área), uma por categoria, com o valor mês a mês da projeção.${existentes.length ? ` As ${existentes.length} linha(s) gerais que ${proximo} já tem nessas categorias são substituídas.` : ''} Depois dá para ajustar e dividir por área na aba Planejamento do Orçamento.`,
      confirmar: 'Gerar orçamento',
      cancelar: 'Voltar',
    });
    if (!ok) return;
    const linhas: Orcamento[] = [...m.values()].map((x) => {
      const ex = existentes.find((o) => o.categoria === x.categoria);
      const mesesArred = x.meses.map((v) => Math.round(v * 100) / 100);
      const anual = Math.round(mesesArred.reduce((s, v) => s + v, 0) * 100) / 100;
      return {
        id: ex?.id || `orc-${crypto.randomUUID()}`,
        ano: proximo,
        categoria: x.categoria,
        area: '',
        valorAnual: anual,
        meses: mesesArred.some((v) => v > 0) ? mesesArred : distribuirMensal(anual),
        natureza: x.natureza,
        origem: 'projecao',
        observacoes: `Gerado da projeção em ${formatDate(new Date().toISOString())}`,
      };
    });
    const falha = await salvarOrcamentos(linhas);
    setAviso(falha ? `Não foi possível gerar: ${falha}` : `Orçamento de ${proximo} gerado (${linhas.length} linhas). Ajuste em Orçamento › Planejamento.`);
  };

  const exportar = () =>
    baixarCsv(
      `projecao-${meses}-meses.csv`,
      paraCsv(
        ['Mês', 'Natureza', 'Origem', 'Item', 'Categoria', 'Valor'],
        itens.map((i) => [rotuloMes(i.mes), i.natureza.toUpperCase(), i.origem, detalhe ? i.nome : '', ROTULO_CATEGORIA[i.categoria as CategoriaDespesa] || i.categoria, i.valor])
      )
    );

  return (
    <div className="space-y-3">
      <CabecalhoTela
        titulo="Projeção de gastos"
        subtitulo="Recorrentes até o fim (com renovação e reajuste do contrato ou da premissa), reposição pelo fim da vida útil e pedidos aprovados ainda não pagos"
        abas={abas}
        acoes={
          <>
            <button type="button" onClick={exportar} className="btn btn-secundario"><Download /> CSV</button>
            {isAdmin && (
              <button type="button" onClick={gerarOrcamento} className="btn btn-primario"><Sparkles /> Gerar orçamento de {proximo}</button>
            )}
          </>
        }
        filtros={
          <select aria-label="Horizonte" value={meses} onChange={(e) => setMeses(Number(e.target.value))} className="campo campo-sm">
            <option value={12}>Próximos 12 meses</option>
            <option value={24}>Próximos 24 meses</option>
            <option value={36}>Próximos 36 meses</option>
          </select>
        }
      />
      {aviso && <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700" role="status">{aviso}</p>}
      <div className="grid items-start grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero rotulo={`Total · próximos ${meses} meses`} valor={brl(total)} detalhe={lista[0] ? `de ${rotuloMes(lista[0].mes)} a ${rotuloMes(lista[lista.length - 1].mes)}` : undefined} />
        <Numero rotulo="OPEX" valor={brl(total - capex)} />
        <Numero rotulo="CAPEX (reposição e compras)" valor={brl(capex)} />
        <Numero rotulo="Média mensal" valor={brl(lista.length ? total / lista.length : 0)} />
      </div>
      {/* Decisão 21.3-2: tabela por ano (meses em colunas, total do ano); o mês abre a composição */}
      <div className="cartao-tabela">
        <table className="tabela tabela-cartoes">
          <thead>
            <tr>
              <th>Ano</th>
              {MESES.map((m) => (
                <th key={m} className="num">{m}</th>
              ))}
              <th className="num">Total do ano</th>
            </tr>
          </thead>
          <tbody>
            {porAno.map((a) => (
              <tr key={a.ano}>
                <td data-label="Ano" className="font-semibold text-slate-900">{a.ano}</td>
                {a.meses.map((m, i) => (
                  <td key={i} data-label={MESES[i]} className="num">
                    {!m ? '' : m.total > 0.004 ? (
                      <button type="button" onClick={() => setMesAberto(m.mes)} className="link" title={`OPEX ${brl(m.opex)} · CAPEX ${brl(m.capex)}`}>
                        {brl(m.total)}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                ))}
                <td data-label="Total do ano" className="num font-semibold">{brlOuTraco(a.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid items-start grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="cartao-tabela">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Por categoria</th>
                <th className="num">Próximos {meses} meses</th>
              </tr>
            </thead>
            <tbody>
              {porCategoria.map(([cat, v]) => (
                <tr key={cat}>
                  <td data-label="Categoria">{ROTULO_CATEGORIA[cat as CategoriaDespesa] || cat}</td>
                  <td data-label="Valor" className="num">{brl(v)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="font-semibold text-slate-900">Total</td>
                <td className="num font-semibold">{brl(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="ajuda">
          Premissas: reajuste padrão de {g.premissas.reajustePadraoPct ?? 5}% ao ano (contratos com mês de reajuste usam o mês deles) · limite de capitalização {brl(g.limite)}. Altere em Configurações.
        </p>
      </div>
      {mesAberto && <JanelaMesProjecao mes={mesAberto} itens={itens.filter((i) => i.mes === mesAberto)} detalhe={detalhe} onFechar={() => setMesAberto(null)} />}
    </div>
  );
};

const GRUPOS_PROJECAO: { titulo: string; origens: string[] }[] = [
  { titulo: 'Recorrentes (contratos, softwares e linhas)', origens: ['contrato', 'licenca', 'linha'] },
  { titulo: 'Reposições (fim da vida útil)', origens: ['reposicao'] },
  { titulo: 'Pedidos aprovados ainda não pagos', origens: ['pedido'] },
];
const FICHA_DA_ORIGEM: Record<string, FichaAberta['tipo'] | undefined> = { contrato: 'contrato', licenca: 'software', reposicao: 'ativo', pedido: 'pedido' };

/** Projeção: a composição de um mês (recorrentes, reposições, pedidos), cada item com link */
const JanelaMesProjecao: React.FC<{ mes: string; itens: Projecao['itens']; detalhe: boolean; onFechar: () => void }> = ({ mes, itens, detalhe, onFechar }) => {
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return (
    <Janela tamanho="m" titulo={`Projeção de ${rotuloMes(mes)}`} subtitulo={`Total ${brl(total)}`} icone={<CalendarRange className="ico" />} onFechar={onFechar}>
      <div className="space-y-4">
        {GRUPOS_PROJECAO.map((gr) => {
          const doGrupo = itens.filter((i) => gr.origens.includes(i.origem)).sort((a, b) => b.valor - a.valor);
          if (!doGrupo.length) return null;
          return (
            <section key={gr.titulo} className="space-y-1">
              <h3 className="secao-titulo flex justify-between gap-2">
                <span>{gr.titulo}</span>
                <span className="num">{brl(doGrupo.reduce((s, i) => s + i.valor, 0))}</span>
              </h3>
              <ul className="space-y-1">
                {doGrupo.map((i, k) => {
                  const tipo = FICHA_DA_ORIGEM[i.origem];
                  return (
                    <li key={(i.origemId || i.nome) + k} className="flex justify-between gap-2">
                      {detalhe ? (
                        <LinkFicha ficha={tipo && i.origemId ? { tipo, id: i.origemId } : undefined}>{i.nome}</LinkFicha>
                      ) : (
                        <span>{ROTULO_CATEGORIA[i.categoria as CategoriaDespesa] || i.categoria}</span>
                      )}
                      <span className="num">{brl(i.valor)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Janela>
  );
};

// -----------------------------------------------------------------------------
// Patrimônio: imobilizado do ano, com fechamento imutável (decisão 8)
// -----------------------------------------------------------------------------
interface FotoImobilizado {
  totais: TotaisImobilizado;
  linhas: LinhaImobilizado[];
  limite: number;
  geradoEm: string;
}

export function useFechamentos() {
  const [lista, setLista] = useState<FechamentoImobilizado[]>([]);
  const recarregar = async () => {
    const r = await listarFechamentos();
    if (r) setLista(r);
  };
  useEffect(() => {
    let vivo = true;
    listarFechamentos().then((r) => {
      if (vivo && r) setLista(r);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return { lista, setLista, recarregar };
}

export const PatrimonioView: React.FC = () => {
  const { assets, departments, settings, currentRole, currentUser, abrirFicha } = useApp();
  const [ano, setAno] = useState(ANO_ATUAL);
  const [agrupar, setAgrupar] = useState<'grupo' | 'area'>('grupo');
  const [erro, setErro] = useState('');
  const { lista: fechamentos, setLista, recarregar } = useFechamentos();
  const isAdmin = currentRole === 'ti_admin';
  const limite = settings.premissasFinanceiras?.limiteCapitalizacao ?? 1200;
  const fechado = fechamentos.find((f) => f.ano === ano && !f.reabertoEm);
  const reaberturas = fechamentos.filter((f) => f.ano === ano && f.reabertoEm);
  const foto = fechado?.foto as FotoImobilizado | undefined;
  const vivas = useMemo(() => imobilizadoDoAno(assets, ano, settings.vidaUtil, limite), [assets, ano, settings.vidaUtil, limite]);
  const linhas = foto?.linhas || vivas;
  const totais = foto?.totais || totaisImobilizado(linhas);
  const nomeArea = (id?: string) => departments.find((d) => d.id === id)?.nome || 'Sem área';
  const grupos = imobilizadoPor(linhas, (l) => (agrupar === 'grupo' ? ROTULO_GRUPO_DEPRECIACAO[l.grupo] : nomeArea(l.setorId)));

  const exportar = (excel: boolean) => {
    const { cabecalho, linhas: ls } = csvImobilizado(linhas, nomeArea);
    if (excel) baixarExcel(`imobilizado-${ano}.xls`, paraExcel(`Imobilizado ${ano}`, cabecalho, ls));
    else baixarCsv(`imobilizado-${ano}.csv`, paraCsv(cabecalho, ls));
  };

  const fechar = async () => {
    const ok = await confirmar({
      titulo: `Fechar o imobilizado de ${ano}?`,
      mensagem: `Grava uma foto do ano (${linhas.length} equipamentos, saldo final ${brl(totais.liquidoFinal)}) que vai para a contabilidade. Correções feitas depois não mudam o ano fechado; reabrir só pelo administrador, com motivo.${ano >= ANO_ATUAL ? ' Atenção: o ano ainda não terminou.' : ''}`,
      confirmar: 'Fechar o ano',
      cancelar: 'Voltar',
    });
    if (!ok) return;
    const nova: FotoImobilizado = { totais, linhas, limite, geradoEm: new Date().toISOString() };
    try {
      await fecharImobilizado(ano, nova);
      if (supabase) await recarregar();
      else setLista((l) => [{ id: `fech-${ano}`, ano, foto: nova, fechadoPor: currentUser?.id, fechadoEm: new Date().toISOString() }, ...l]);
      setErro('');
    } catch (e) {
      setErro(`Não foi possível fechar: ${e instanceof Error ? e.message : e}`);
    }
  };

  const reabrir = async () => {
    const motivo = await pedirTexto({
      titulo: `Reabrir o imobilizado de ${ano}?`,
      mensagem: 'A foto atual fica no histórico como reaberta; os números voltam a ser calculados do cadastro até fechar de novo.',
      rotulo: 'Motivo',
      minimo: 5,
      confirmar: 'Reabrir',
      cancelar: 'Voltar',
      perigo: true,
    });
    if (motivo === null) return;
    try {
      await reabrirImobilizado(ano, motivo);
      if (supabase) await recarregar();
      else setLista((l) => l.map((f) => (f.ano === ano && !f.reabertoEm ? { ...f, reabertoEm: new Date().toISOString(), reabertoPor: currentUser?.id, reaberturaMotivo: motivo } : f)));
      setErro('');
    } catch (e) {
      setErro(`Não foi possível reabrir: ${e instanceof Error ? e.message : e}`);
    }
  };

  const comBaixa = linhas.some((l) => l.baixa);
  const anoEmCurso = ano >= ANO_ATUAL && !fechado;

  return (
    <div className="space-y-3">
      <CabecalhoTela
        titulo="Patrimônio"
        subtitulo={`Imobilizado de ${ano}: saldo inicial + aquisições − baixas − depreciação do ano = saldo final · só equipamentos CAPEX (a partir de ${brl(limite)})`}
        acoes={
          <>
            <button type="button" onClick={() => exportar(false)} className="btn btn-secundario"><Download /> CSV</button>
            <button type="button" onClick={() => exportar(true)} className="btn btn-secundario"><FileSpreadsheet /> Excel</button>
            {isAdmin && !fechado && (
              <button type="button" onClick={fechar} className="btn btn-primario"><Lock /> Fechar o ano</button>
            )}
            {isAdmin && fechado && (
              <button type="button" onClick={reabrir} className="btn btn-secundario"><LockOpen /> Reabrir</button>
            )}
          </>
        }
        filtros={
          <>
            <SeletorAno ano={ano} onMudar={setAno} anos={[ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2, ANO_ATUAL - 3, ANO_ATUAL - 4]} />
            <select aria-label="Agrupar por" value={agrupar} onChange={(e) => setAgrupar(e.target.value as typeof agrupar)} className="campo campo-sm">
              <option value="grupo">Por grupo de depreciação</option>
              <option value="area">Por área</option>
            </select>
            {fechado ? (
              <span className="selo selo-ok"><Lock aria-hidden="true" /> Fechado em {formatDate(fechado.fechadoEm)}</span>
            ) : (
              <span className="selo selo-neutro">Aberto (calculado do cadastro)</span>
            )}
          </>
        }
      />
      {erro && <p className="erro" role="alert">{erro}</p>}
      {reaberturas.length > 0 && (
        <p className="texto-aux">
          Reaberturas: {reaberturas.map((r) => `${formatDate(r.reabertoEm || '')} — ${r.reaberturaMotivo || ''}`).join(' · ')}
        </p>
      )}
      <div className="grid items-start grid-cols-2 lg:grid-cols-5 gap-3">
        <Numero rotulo={`Saldo em 01/01/${ano}`} valor={brl(totais.liquidoInicial)} detalhe={`custo ${brl(totais.custoInicial)}`} />
        <Numero rotulo="Aquisições" valor={brl(totais.aquisicoes)} />
        <Numero rotulo="Baixas (valor líquido)" valor={brl(totais.baixasCusto - totais.baixasDepAcum)} detalhe={`vendas ${brl(totais.vendas)} · ganho/perda ${brl(totais.resultadoBaixas)}`} />
        <Numero rotulo={anoEmCurso ? 'Depreciação do ano (até 31/12)' : 'Depreciação do ano'} valor={brl(totais.depreciacaoAno)} />
        <Numero
          rotulo={`Saldo em 31/12/${ano}`}
          valor={brl(totais.liquidoFinal)}
          detalhe={anoEmCurso ? `projetado (o ano não terminou) · custo ${brl(totais.custoFinal)}` : `custo ${brl(totais.custoFinal)}`}
        />
      </div>
      {linhas.length === 0 ? (
        <Vazio>Nenhum equipamento CAPEX com valor e data de compra em {ano}.</Vazio>
      ) : (
        <>
          <div className="cartao-tabela">
            <table className="tabela tabela-cartoes">
              <thead>
                <tr>
                  <th>{agrupar === 'grupo' ? 'Grupo' : 'Área'}</th>
                  <th className="num">Saldo em 01/01</th>
                  <th className="num">Aquisições</th>
                  <th className="num">Baixas</th>
                  <th className="num">Depreciação</th>
                  <th className="num">Saldo em 31/12</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((gr) => (
                  <tr key={gr.chave}>
                    <td className="font-semibold text-slate-900">{gr.chave}</td>
                    <TotaisImob t={gr.totais} />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="font-semibold text-slate-900">Total</td>
                  <TotaisImob t={totais} forte />
                </tr>
              </tfoot>
            </table>
          </div>
          <details className="cartao p-3">
            <summary className="cursor-pointer font-semibold text-slate-700">Detalhe por equipamento ({linhas.length})</summary>
            <table className="tabela tabela-cartoes mt-2">
              <thead>
                <tr>
                  <th>Patrimônio</th>
                  <th>Aquisição</th>
                  <th className="num">Custo</th>
                  <th className="num">Depreciação do ano</th>
                  {comBaixa && <th>Baixa</th>}
                  <th className="num">Saldo em 31/12</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.ativoId}>
                    <td data-label="Patrimônio">
                      <button type="button" onClick={() => abrirFicha({ tipo: 'ativo', id: l.ativoId })} className="link text-left">{l.tag}</button>
                      <span className="text-slate-600"> · {l.nome}</span>
                    </td>
                    <td data-label="Aquisição" className="num">{l.dataAquisicao ? formatDate(l.dataAquisicao) : '—'}</td>
                    <td data-label="Custo" className="num">{brlOuTraco(l.custo)}</td>
                    <td data-label="Depreciação" className="num">{brlOuTraco(l.depreciacaoAno)}</td>
                    {comBaixa && <td data-label="Baixa">{l.baixa ? `${formatDate(l.baixa.data)} · venda ${brl(l.baixa.valorVenda)}` : '—'}</td>}
                    <td data-label="Saldo em 31/12" className="num">{brlOuTraco(l.custoFinal - l.depAcumFinal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Relatórios e exportações para a contabilidade (decisão 12)
// -----------------------------------------------------------------------------
// Seção 23: o admin vê as análises cruzadas em abas, antes das exportações; Compras vê só as exportações
export const RelatoriosView: React.FC = () => {
  const { currentRole } = useApp();
  const [aba, setAba] = useState<AbaAnalise | 'exportacoes'>('pessoas');
  if (currentRole !== 'ti_admin') return <ExportacoesView />;
  const abas = (
    <Abas rotulo="Análises e relatórios" ativa={aba} onMudar={setAba} itens={[...ABAS_ANALISE, { id: 'exportacoes' as const, rotulo: 'Exportações' }]} />
  );
  return aba === 'exportacoes' ? <ExportacoesView abas={abas} /> : <AnalisesView aba={aba} abas={abas} />;
};

const ExportacoesView: React.FC<{ abas?: React.ReactNode }> = ({ abas }) => {
  const { assets, departments, settings, currentRole } = useApp();
  const [ano, setAno] = useState(ANO_ATUAL);
  const g = useGestao(ano);
  const [rateios, setRateios] = useState<Rateio[]>([]);
  const [rateiosErro, setRateiosErro] = useState(false);
  const [tentativaRateios, setTentativaRateios] = useState(0);
  const [rateando, setRateando] = useState<{ tipo: 'contrato' | 'licenca'; id: string; nome: string } | null>(null);
  const [buscaRateio, setBuscaRateio] = useState('');
  const isTI =currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  useEffect(() => {
    if (!isTI) return;
    let vivo = true;
    listarRateios().then((r) => {
      if (!vivo) return;
      if (r) {
        setRateios(r);
        setRateiosErro(false);
      } else setRateiosErro(true);
    });
    return () => {
      vivo = false;
    };
  }, [isTI, tentativaRateios]);
  const nomeDep = (id?: string) => departments.find((d) => d.id === id)?.nome || 'Sem área';
  const contas = settings.premissasFinanceiras?.contaContabil || {};
  const porArea = custoPorArea(g.lancamentos, rateios, nomeDep);

  const baixar = (nome: string, aba: string, cab: string[], ls: (string | number | undefined)[][], excel: boolean) =>
    excel ? baixarExcel(`${nome}.xls`, paraExcel(aba, cab, ls)) : baixarCsv(`${nome}.csv`, paraCsv(cab, ls));

  // Seção 27: só o que é contábil. O imobilizado sai da tela Patrimônio e os recebimentos, de Contas › A receber.
  const relatorios: { titulo: string; descricao: string; gerar: (excel: boolean) => void; so?: 'ti'; bloqueado?: boolean }[] = [
    {
      titulo: `Depreciação mês a mês de ${ano}`,
      descricao: 'Valor a lançar na contabilidade em cada mês, por grupo de depreciação.',
      so: 'ti',
      gerar: (excel) => {
        const d = depreciacaoMensal(assets, ano, settings.vidaUtil, g.limite);
        baixar(`depreciacao-${ano}`, `Depreciação ${ano}`, ['Grupo', ...MESES, 'Total'], d.map((x) => [ROTULO_GRUPO_DEPRECIACAO[x.grupo], ...x.meses, Math.round(x.meses.reduce((s, v) => s + v, 0) * 100) / 100]), excel);
      },
    },
    {
      titulo: `Lançamentos de ${ano} (CAPEX/OPEX, área e conta contábil)`,
      descricao: 'Faturas pagas e a pagar e pedidos comprometidos, por competência, com a conta contábil de cada categoria (Configurações).',
      gerar: (excel) => {
        const r = csvLancamentos(g.lancamentos, ano, contas);
        baixar(`lancamentos-${ano}`, `Lançamentos ${ano}`, r.cabecalho, r.linhas, excel);
      },
    },
    {
      titulo: `Custo por área de ${ano} (${isTI ? 'com rateio' : 'sem rateio'})`,
      descricao: isTI
        ? 'Realizado de cada área; contratos e licenças rateados entram pela porcentagem de cada área.'
        : 'Realizado de cada área, sem o rateio de contratos e licenças (o rateio é da T.I.).',
      bloqueado: isTI && rateiosErro,
      gerar: (excel) => baixar(`custo-por-area-${ano}`, `Custo por área ${ano}`, ['Área', 'Realizado'], porArea.map((a) => [a.area, a.valor]), excel),
    },
  ];

  // Rateio entre áreas: os de maior custo primeiro, com busca (escala: dezenas de contratos e licenças)
  const termo = buscaRateio.trim().toLowerCase();
  const recorrentesRateaveis = g.recorrentes
    .filter((r) => r.origem !== 'linha' && (!termo || r.nome.toLowerCase().includes(termo)))
    .sort((a, b) => b.mensal - a.mensal);
  const totalPorArea = porArea.reduce((s, a) => s + a.valor, 0);
  const AVISO_RATEIO = 'Os rateios não carregaram (falha de conexão ou de permissão). Clique em "Tentar de novo"; se continuar, recarregue a página. Os outros relatórios funcionam normalmente.';

  return (
    <div className="space-y-3">
      <CabecalhoTela
        titulo={abas ? 'Análises e relatórios' : 'Relatórios'}
        subtitulo="Exportações para a contabilidade (CSV com ; e Excel), sempre com o mesmo layout, e custo por área"
        abas={abas}
        filtros={<SeletorAno ano={ano} onMudar={setAno} anos={[ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2, ANO_ATUAL - 3]} />}
      />
      <div className="cartao divide-y divide-slate-100">
        {relatorios
          .filter((r) => !r.so || isTI)
          .map((r) => (
            <div key={r.titulo} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{r.titulo}</p>
                <p className="texto-aux">{r.descricao}</p>
                {r.bloqueado && <p className="erro" role="alert">Este relatório espera os rateios: sem eles, o custo por área sairia errado. {AVISO_RATEIO}</p>}
              </div>
              <span className="flex gap-2">
                {r.bloqueado && <button type="button" onClick={() => setTentativaRateios((n) => n + 1)} className="btn btn-sm btn-secundario">Tentar de novo</button>}
                <button type="button" disabled={r.bloqueado} onClick={() => r.gerar(false)} className="btn btn-sm btn-secundario"><Download /> CSV</button>
                <button type="button" disabled={r.bloqueado} onClick={() => r.gerar(true)} className="btn btn-sm btn-secundario"><FileSpreadsheet /> Excel</button>
              </span>
            </div>
          ))}
      </div>
      <div className="grid items-start grid-cols-1 xl:grid-cols-2 gap-3">
        {porArea.length === 0 ? (
          <div className="cartao p-3 space-y-2">
            <h3 className="secao-titulo">Custo por área ({ano}, realizado)</h3>
            <p className="texto-aux">Nada pago no ano.</p>
          </div>
        ) : (
          <div className="cartao-tabela">
            <table className="tabela tabela-cartoes">
              <thead>
                <tr>
                  <th>Custo por área ({ano}){isTI && rateiosErro ? ' · sem rateio' : ''}</th>
                  <th className="num">Realizado</th>
                </tr>
              </thead>
              <tbody>
                {porArea.map((a) => (
                  <tr key={a.area}>
                    <td data-label="Área">{a.area}</td>
                    <td data-label="Realizado" className="num">{brlOuTraco(a.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="font-semibold text-slate-900">Total</td>
                  <td className="num font-semibold">{brl(totalPorArea)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {isTI && (
          <div className="cartao p-3 space-y-2">
            <h3 className="secao-titulo">Rateio entre áreas</h3>
            <p className="ajuda">Divide o custo de um contrato ou licença entre as áreas que usam. Não é cobrança: só muda o relatório de custo por área.</p>
            {rateiosErro ? (
              <div className="space-y-2" role="alert">
                <p className="erro">{AVISO_RATEIO}</p>
                <button type="button" onClick={() => setTentativaRateios((n) => n + 1)} className="btn btn-sm btn-secundario">Tentar de novo</button>
              </div>
            ) : (
              <>
                <label className="relative block">
                  <span className="sr-only">Buscar contrato ou software</span>
                  <Search className="ico absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input type="search" value={buscaRateio} onChange={(e) => setBuscaRateio(e.target.value)} placeholder="Buscar contrato ou software…" className="campo campo-sm pl-8" />
                </label>
                {recorrentesRateaveis.length === 0 ? (
                  <p className="texto-aux">{termo ? 'Nada encontrado com essa busca.' : 'Nenhum contrato ou software com custo recorrente.'}</p>
                ) : (
                  <ul className="space-y-1 max-h-72 overflow-auto">
                    {recorrentesRateaveis.map((r) => {
                      const partes = rateios.filter((x) => x.origemTipo === r.origem && x.origemId === r.id);
                      return (
                        <li key={r.origem + r.id} className="flex items-center justify-between gap-2">
                          <span className="min-w-0">
                            <LinkFicha ficha={{ tipo: r.origem === 'contrato' ? 'contrato' : 'software', id: r.id }}>{r.nome}</LinkFicha>
                            <span className="block texto-aux">
                              <span className="num">{brl(r.mensal)}/mês</span> · {partes.length ? partes.map((p) => `${nomeDep(p.departamentoId)} ${p.percentual}%`).join(' · ') : 'sem rateio'}
                            </span>
                          </span>
                          <button type="button" onClick={() => setRateando({ tipo: r.origem as 'contrato' | 'licenca', id: r.id, nome: r.nome })} className="btn btn-sm btn-secundario">
                            <Split /> Ratear
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {rateando && (
        <JanelaRateio
          alvo={rateando}
          departamentos={departments}
          atual={rateios.filter((x) => x.origemTipo === rateando.tipo && x.origemId === rateando.id)}
          onFechar={() => setRateando(null)}
          onSalvo={(partes) => {
            setRateios((l) => [
              ...l.filter((x) => !(x.origemTipo === rateando.tipo && x.origemId === rateando.id)),
              ...partes.map((p) => ({ id: `rat-${crypto.randomUUID()}`, origemTipo: rateando.tipo, origemId: rateando.id, ...p })),
            ]);
            setRateando(null);
          }}
        />
      )}
    </div>
  );
};

const JanelaRateio: React.FC<{
  alvo: { tipo: 'contrato' | 'licenca'; id: string; nome: string };
  departamentos: { id: string; nome: string }[];
  atual: Rateio[];
  onFechar: () => void;
  onSalvo: (partes: { departamentoId: string; percentual: number }[]) => void;
}> = ({ alvo, departamentos, atual, onFechar, onSalvo }) => {
  const [partes, setPartes] = useState(atual.length ? atual.map((p) => ({ departamentoId: p.departamentoId, percentual: p.percentual })) : [{ departamentoId: '', percentual: 100 }]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const soma = partes.reduce((s, p) => s + (Number(p.percentual) || 0), 0);
  const salvar = async () => {
    const validas = partes.filter((p) => p.departamentoId && p.percentual > 0);
    if (new Set(validas.map((p) => p.departamentoId)).size !== validas.length) return setErro('Cada área aparece uma vez só.');
    if (soma > 100.0001) return setErro('O rateio passa de 100%.');
    setSalvando(true);
    try {
      await salvarRateioDe(alvo.tipo, alvo.id, validas);
      onSalvo(validas);
    } catch (e) {
      setErro(`Não foi possível salvar: ${e instanceof Error ? e.message : e}`);
    }
    setSalvando(false);
  };
  return (
    <Janela
      tamanho="p"
      titulo="Rateio entre áreas"
      subtitulo={alvo.nome}
      icone={<Split className="ico" />}
      onFechar={onFechar}
      rodape={
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onFechar} className="btn btn-secundario">Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando} className="btn btn-primario">{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      }
    >
      <div className="space-y-2">
        {partes.map((p, i) => (
          <div key={i} className="grid grid-cols-[1fr_6rem_auto] gap-2 items-center">
            <select aria-label={`Área ${i + 1}`} value={p.departamentoId} onChange={(e) => setPartes(partes.map((x, j) => (j === i ? { ...x, departamentoId: e.target.value } : x)))} className={CLASSE_CAMPO}>
              <option value="">Escolha a área…</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
            <input aria-label={`Porcentagem ${i + 1}`} type="number" min={0} max={100} step="0.01" value={p.percentual} onChange={(e) => setPartes(partes.map((x, j) => (j === i ? { ...x, percentual: Number(e.target.value) } : x)))} className={`${CLASSE_CAMPO} font-mono`} />
            <button type="button" onClick={() => setPartes(partes.filter((_, j) => j !== i))} className="btn btn-sm btn-secundario" aria-label={`Tirar a área ${i + 1}`}>Tirar</button>
          </div>
        ))}
        <button type="button" onClick={() => setPartes([...partes, { departamentoId: '', percentual: Math.max(0, 100 - soma) }])} className="btn btn-sm btn-secundario">Mais uma área</button>
        <p className={` ${soma > 100 ? 'text-red-700' : 'text-slate-600'}`}>Total: {soma.toFixed(2)}% {soma < 100 ? `(os ${(100 - soma).toFixed(2)}% restantes ficam na área do cadastro)` : ''}</p>
        {erro && <p className="erro" role="alert">{erro}</p>}
      </div>
    </Janela>
  );
};

// -----------------------------------------------------------------------------
// Gestor: custos da minha área (decisão 10 — só totais, sem detalhe)
// -----------------------------------------------------------------------------
export const CustosMinhaAreaView: React.FC = () => {
  const [ano, setAno] = useState(ANO_ATUAL);
  const [linhas, setLinhas] = useState<{ area: string; categoria: string; previsto: number; realizado: number; aPagar: number }[] | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!supabase) return setLinhas([]);
      const { data, error } = await supabase.rpc('custos_area_gestor' as never, { p_ano: ano } as never);
      if (!vivo) return;
      if (error) {
        setErro(true);
        return setLinhas([]);
      }
      setErro(false);
      setLinhas(
        ((data || []) as { area: string; categoria: string; previsto: number; realizado: number; a_pagar?: number }[]).map((l) => ({
          area: l.area,
          categoria: l.categoria,
          previsto: Number(l.previsto) || 0,
          realizado: Number(l.realizado) || 0,
          aPagar: Number(l.a_pagar) || 0,
        }))
      );
    })();
    return () => {
      vivo = false;
    };
  }, [ano, tentativa]);
  const area = linhas?.[0]?.area;
  const previsto = (linhas || []).reduce((s, l) => s + l.previsto, 0);
  const realizado = (linhas || []).reduce((s, l) => s + l.realizado, 0);
  const aPagar = (linhas || []).reduce((s, l) => s + l.aPagar, 0);
  const usado = realizado + aPagar;
  return (
    <div className="space-y-3">
      <CabecalhoTela
        titulo="Custos da minha área"
        subtitulo={`${area ? `${area} · ` : ''}orçamento de T.I. previsto × pago em ${ano}, por categoria (só totais)`}
        filtros={<SeletorAno ano={ano} onMudar={(a) => { setLinhas(null); setAno(a); }} anos={[ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2]} />}
      />
      {linhas === null ? null : erro ? (
        <div className="cartao p-3 space-y-2" role="alert">
          <p className="erro">Não foi possível carregar os custos da sua área agora.</p>
          <button type="button" className="btn btn-sm btn-secundario" onClick={() => { setErro(false); setLinhas(null); setTentativa((n) => n + 1); }}>Tentar de novo</button>
        </div>
      ) : linhas.length === 0 ? (
        <Vazio>Sem orçamento nem gasto de T.I. registrado para a sua área em {ano}.</Vazio>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Numero rotulo="Previsto" valor={brl(previsto)} />
            <Numero rotulo="Pago" valor={brl(realizado)} />
            <Numero rotulo="A pagar" valor={brl(aPagar)} />
            <Numero rotulo="Disponível" valor={brl(previsto - usado)} tom={previsto - usado < 0 ? 'problema' : undefined} />
          </div>
          <div className="cartao-tabela">
            <table className="tabela tabela-cartoes">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th className="num">Previsto</th>
                  <th className="num">Pago</th>
                  <th className="num">A pagar</th>
                  <th className="num">% usado</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.categoria}>
                    <td data-label="Categoria">{ROTULO_CATEGORIA[l.categoria as CategoriaDespesa] || l.categoria}</td>
                    <td data-label="Previsto" className="num">{brlOuTraco(l.previsto)}</td>
                    <td data-label="Pago" className="num">{brlOuTraco(l.realizado)}</td>
                    <td data-label="A pagar" className="num">{brlOuTraco(l.aPagar)}</td>
                    <td data-label="% usado" className="num">{l.previsto ? pct((l.realizado + l.aPagar) / l.previsto) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
