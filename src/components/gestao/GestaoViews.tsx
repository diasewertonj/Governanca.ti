/**
 * Seção 17 · Gestão de T.I.: Painel executivo, Orçamento (acompanhamento e
 * planejamento), Projeção, Patrimônio (imobilizado por ano, com fechamento) e
 * Relatórios/exportações. Tudo lê do mesmo livro (useGestao) — nada é somado à parte.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Lock, LockOpen, Sparkles, Split } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import type { CategoriaDespesa, FechamentoImobilizado, Orcamento, Rateio } from '../../types/index.ts';
import { assentosOciosos, baixarCsv, baixarExcel, brl, paraCsv, paraExcel, ROTULO_CATEGORIA, valorPatrimonio } from '../../utils/financeiro.ts';
import { distribuirMensal } from '../../utils/compras.ts';
import { diasAte, formatDate } from '../../utils/formatters.ts';
import { nomeContrato } from '../../utils/contratos.ts';
import { ROTULO_GRUPO_DEPRECIACAO } from '../../utils/patrimonio.ts';
import {
  csvImobilizado,
  csvLancamentos,
  custoPorArea,
  depreciacaoMensal,
  imobilizadoDoAno,
  imobilizadoPor,
  indicadoresExecutivos,
  totaisImobilizado,
  type LinhaGestao,
  type LinhaImobilizado,
  type TotaisImobilizado,
} from '../../utils/gestaoFinanceira.ts';
import { fecharImobilizado, listarFechamentos, listarRateios, reabrirImobilizado, salvarRateioDe } from '../../services/financeiroDb.ts';
import { supabase } from '../../services/supabase.ts';
import { useGestao, type Regime } from './useGestao.ts';
import { useRecebimentos, ROTULO_TIPO_RECEBIMENTO } from '../financeiro/RecebimentosView.tsx';
import { OrcamentoView } from '../compras/OrcamentoView.tsx';
import { Abas } from '../ui/Abas.tsx';
import { confirmar, pedirTexto } from '../ui/dialogo.tsx';
import { Janela } from '../ui/Janela.tsx';
import { CabecalhoTela, Vazio } from '../ui/Tela.tsx';
import { CLASSE_CAMPO } from '../comum/campos.ts';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (aaaamm: string) => `${MESES[Number(aaaamm.slice(5, 7)) - 1]}/${aaaamm.slice(2, 4)}`;
const pct = (v?: number) => (v === undefined ? '—' : `${Math.round(v * 100)}%`);
const ANO_ATUAL = new Date().getFullYear();

const Numero: React.FC<{ rotulo: string; valor: string; detalhe?: React.ReactNode; tom?: 'atencao' | 'problema' }> = ({ rotulo, valor, detalhe, tom }) => (
  <div className="cartao p-3 min-w-0">
    <p className="texto-aux">{rotulo}</p>
    <p className={`text-lg font-semibold font-mono ${tom === 'problema' ? 'text-red-700' : tom === 'atencao' ? 'text-amber-800' : 'text-slate-900'}`}>{valor}</p>
    {detalhe && <p className="texto-aux">{detalhe}</p>}
  </div>
);

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
  const { faturas, contratos, licenses, assets, fornecedores, settings } = useApp();
  const { estoque } = useRecursos();
  const g = useGestao(ANO_ATUAL);
  const fornecedorDe = useFornecedorDaFatura();
  const mes = new Date().getMonth();
  const orcadoAno = g.orcamentoDoAno.reduce((s, o) => s + o.valorAnual, 0);
  const ind = indicadoresExecutivos(g.lancamentos, orcadoAno, g.colaboradoresAtivos, g.projecao);
  const usados = g.lancamentos.filter((l) => l.situacao !== 'comprometido');
  const doMes = usados.filter((l) => l.mes === mes).reduce((s, l) => s + l.valor, 0);
  const comprometido = g.lancamentos.filter((l) => l.situacao === 'comprometido').reduce((s, l) => s + l.valor, 0);
  const patrimonio = useMemo(() => valorPatrimonio(assets, estoque, settings.vidaUtil), [assets, estoque, settings.vidaUtil]);
  const ociosos = assentosOciosos(licenses, contratos);
  const porMes = MESES.map((_, m) => ({
    opex: usados.filter((l) => l.mes === m && l.natureza === 'opex').reduce((s, l) => s + l.valor, 0),
    capex: usados.filter((l) => l.mes === m && l.natureza === 'capex').reduce((s, l) => s + l.valor, 0),
  }));
  const maior = Math.max(1, ...porMes.map((m) => m.opex + m.capex));
  const top = useMemo(() => {
    const m = new Map<string, number>();
    faturas
      .filter((f) => f.status === 'paga' && f.competencia.startsWith(`${ANO_ATUAL}-`))
      .forEach((f) => {
        const id = fornecedorDe(f) || '';
        m.set(id, (m.get(id) || 0) + (f.valorPago ?? f.valor));
      });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faturas]);
  const vencendo = contratos
    .filter((c) => c.status !== 'encerrado' && c.fim && diasAte(c.fim) >= 0 && diasAte(c.fim) <= 90)
    .sort((a, b) => (a.fim || '').localeCompare(b.fim || ''));
  const reposicoes = g.projecao.itens.filter((i) => i.origem === 'reposicao').slice(0, 8);

  return (
    <div className="space-y-4">
      <CabecalhoTela titulo="Painel executivo" subtitulo={`Custo de T.I. em ${ANO_ATUAL} (faturas pagas e a pagar, por competência) · para apresentar à diretoria`} />
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Numero rotulo={`Custo de T.I. em ${ANO_ATUAL}`} valor={brl(ind.totalAno)} detalhe={`OPEX ${brl(ind.opexAno)} · CAPEX ${brl(ind.capexAno)}`} />
        <Numero rotulo={`Custo em ${MESES[mes]}`} valor={brl(doMes)} />
        <Numero
          rotulo="Orçamento usado"
          valor={pct(ind.pctOrcamento)}
          detalhe={orcadoAno ? `de ${brl(orcadoAno)} · comprometido ${brl(comprometido)}` : 'sem orçamento no ano'}
          tom={ind.pctOrcamento !== undefined && ind.pctOrcamento >= 1 ? 'problema' : ind.pctOrcamento !== undefined && ind.pctOrcamento >= 0.9 ? 'atencao' : undefined}
        />
        <Numero rotulo="OPEX por colaborador (ano)" valor={ind.custoPorColaborador !== undefined ? brl(ind.custoPorColaborador) : '—'} detalhe={`${g.colaboradoresAtivos} colaboradores ativos`} />
        <Numero rotulo="Projeção 12 meses" valor={brl(ind.projecao12m)} detalhe={<button type="button" className="link" onClick={() => onNavigate('projecao')}>ver projeção</button>} />
        <Numero rotulo="Patrimônio (valor atual)" valor={brl(patrimonio.totalAtual)} detalhe={`custo ${brl(patrimonio.total)}`} />
      </div>

      <div className="grid items-start grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="cartao p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="secao-titulo">Mês a mês ({ANO_ATUAL})</h3>
            <span className="texto-aux">
              <span className="inline-block w-2.5 h-2.5 bg-blue-600 rounded-sm align-middle" /> OPEX{' '}
              <span className="inline-block w-2.5 h-2.5 bg-emerald-600 rounded-sm align-middle ml-2" /> CAPEX
            </span>
          </div>
          <ul className="space-y-2">
            {porMes.map((m, i) => (
              <li key={i} className="grid grid-cols-[2.5rem_1fr_6.5rem] items-center gap-2">
                <span className="text-slate-600">{MESES[i]}</span>
                <span className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
                  <span className="block h-full bg-blue-600" style={{ width: `${(m.opex / maior) * 100}%` }} />
                  <span className="block h-full bg-emerald-600" style={{ width: `${(m.capex / maior) * 100}%` }} />
                </span>
                <span className="text-right num">{brl(m.opex + m.capex)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="cartao p-3 space-y-2">
          <h3 className="secao-titulo">Maiores fornecedores ({ANO_ATUAL}, pago)</h3>
          {top.length === 0 ? (
            <p className="texto-aux">Nada pago no ano.</p>
          ) : (
            <ol className="space-y-1">
              {top.map(([id, v], i) => (
                <li key={id || i} className="flex justify-between gap-2">
                  <span className="truncate">{i + 1}. {fornecedores.find((f) => f.id === id)?.nome || 'Sem fornecedor'}</span>
                  <span className="num">{brl(v)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="cartao p-3 space-y-2">
          <h3 className="secao-titulo">Contratos que vencem em 90 dias</h3>
          {vencendo.length === 0 ? (
            <p className="texto-aux">Nenhum.</p>
          ) : (
            <ul className="space-y-1">
              {vencendo.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span className="truncate">{nomeContrato(c)}</span>
                  <span className="text-slate-600">{formatDate(c.fim || '')} ({diasAte(c.fim || '')} dias)</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cartao p-3 space-y-2">
          <h3 className="secao-titulo">Desperdício e reposições</h3>
          <p className="">
            Licenças sem uso: <span className="num font-semibold text-amber-800">{brl(ociosos.reduce((s, o) => s + o.custoMensal, 0))}/mês</span>{' '}
            <span className="text-slate-500">{ociosos.map((o) => `${o.licenca.nome} (${o.livres})`).join(', ') || ''}</span>
          </p>
          <p className="text-slate-700">Próximas reposições (fim da vida útil)</p>
          {reposicoes.length === 0 ? (
            <p className="texto-aux">Nenhuma nos próximos 36 meses.</p>
          ) : (
            <ul className="space-y-1">
              {reposicoes.map((r) => (
                <li key={r.nome + r.mes} className="flex justify-between gap-2">
                  <span className="truncate">{r.nome}</span>
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
export const OrcamentoGestaoView: React.FC = () => {
  const [aba, setAba] = useState<'acompanhamento' | 'planejamento'>('acompanhamento');
  const abas = (
    <Abas
      rotulo="Orçamento"
      ativa={aba}
      onMudar={setAba}
      itens={[
        { id: 'acompanhamento' as const, rotulo: 'Acompanhamento' },
        { id: 'planejamento' as const, rotulo: 'Planejamento (linhas)' },
      ]}
    />
  );
  if (aba === 'planejamento') return <OrcamentoView abas={abas} />;
  return <AcompanhamentoOrcamento abas={abas} />;
};

const AcompanhamentoOrcamento: React.FC<{ abas: React.ReactNode }> = ({ abas }) => {
  const [ano, setAno] = useState(ANO_ATUAL);
  const [regime, setRegime] = useState<Regime>('competencia');
  const [natureza, setNatureza] = useState<'' | 'capex' | 'opex'>('');
  const g = useGestao(ano, regime);
  const linhas = g.linhasGestao.filter((l) => !natureza || l.natureza === natureza);
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

  const exportar = (excel: boolean) => {
    const cab = ['Natureza', 'Categoria', 'Área', 'Previsto', 'Comprometido', 'A pagar', 'Realizado', 'Disponível', 'Projeção até dezembro', '% usado'];
    const ls = linhas.map((l) => [l.natureza.toUpperCase(), ROTULO_CATEGORIA[l.categoria], l.area || 'Geral', l.previsto, l.comprometido, l.aPagar, l.realizado, l.disponivel, l.projecaoDezembro, l.pct !== undefined ? Math.round(l.pct * 100) : undefined]);
    if (excel) baixarExcel(`orcamento-${ano}.xls`, paraExcel(`Orçamento ${ano}`, cab, ls));
    else baixarCsv(`orcamento-${ano}.csv`, paraCsv(cab, ls));
  };

  const Linha: React.FC<{ l: LinhaGestao }> = ({ l }) => (
    <tr>
      <td data-label="Categoria">{ROTULO_CATEGORIA[l.categoria]}</td>
      <td data-label="Área">{l.area || 'Geral'}</td>
      <td data-label="Previsto" className="num">{brl(l.previsto)}</td>
      <td data-label="Comprometido" className="num">{brl(l.comprometido)}</td>
      <td data-label="A pagar" className="num">{brl(l.aPagar)}</td>
      <td data-label="Realizado" className="num">{brl(l.realizado)}</td>
      <td data-label="Disponível" className={`num ${l.disponivel < 0 ? 'text-red-700' : ''}`}>{brl(l.disponivel)}</td>
      <td data-label="Projeção dez." className={`num ${l.previsto && l.projecaoDezembro > l.previsto ? 'text-amber-800' : ''}`}>{brl(l.projecaoDezembro)}</td>
      <td data-label="% usado" className="num">{pct(l.pct)}</td>
    </tr>
  );

  return (
    <div className="space-y-3">
      <CabecalhoTela
        titulo="Orçamento"
        subtitulo="Previsto × comprometido (pedido aprovado sem fatura) × a pagar × realizado · área = departamento · projeção até dezembro = usado + recorrente que falta"
        abas={abas}
        acoes={
          <>
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
          </>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Numero rotulo="Previsto" valor={brl(total.previsto)} />
        <Numero rotulo="Comprometido" valor={brl(total.comprometido)} />
        <Numero rotulo="Realizado + a pagar" valor={brl(total.realizado + total.aPagar)} />
        <Numero rotulo="Disponível" valor={brl(total.disponivel)} tom={total.disponivel < 0 ? 'problema' : undefined} />
        <Numero rotulo="Projeção até dezembro" valor={brl(total.projecaoDezembro)} tom={total.previsto && total.projecaoDezembro > total.previsto ? 'atencao' : undefined} />
      </div>
      {linhas.length === 0 ? (
        <Vazio>Sem orçamento nem gastos em {ano}. Cadastre as linhas na aba Planejamento ou gere a partir da Projeção.</Vazio>
      ) : (
        <div className="cartao-tabela">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Área</th>
                <th className="num">Previsto</th>
                <th className="num">Comprometido</th>
                <th className="num">A pagar</th>
                <th className="num">Realizado</th>
                <th className="num">Disponível</th>
                <th className="num">Projeção dez.</th>
                <th className="num">% usado</th>
              </tr>
            </thead>
            {grupos.map(({ n, ls }) => {
              const s = soma(ls);
              return (
                <tbody key={n}>
                  <tr className="bg-slate-50">
                    <td colSpan={2} className="font-semibold text-slate-900">{n === 'opex' ? 'OPEX (despesas do dia a dia)' : 'CAPEX (investimentos)'}</td>
                    <td className="num font-semibold">{brl(s.previsto)}</td>
                    <td className="num font-semibold">{brl(s.comprometido)}</td>
                    <td className="num font-semibold">{brl(s.aPagar)}</td>
                    <td className="num font-semibold">{brl(s.realizado)}</td>
                    <td className="num font-semibold">{brl(s.disponivel)}</td>
                    <td className="num font-semibold">{brl(s.projecaoDezembro)}</td>
                    <td className="num">{s.previsto ? pct((s.realizado + s.aPagar + s.comprometido) / s.previsto) : '—'}</td>
                  </tr>
                  {ls.map((l) => (
                    <Linha key={l.chave} l={l} />
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Projeção 12/24/36 meses (decisão 9) + gerar o orçamento do próximo ano
// -----------------------------------------------------------------------------
export const ProjecaoView: React.FC = () => {
  const { currentRole } = useApp();
  const { orcamentos, salvarOrcamentos } = useCompras();
  const g = useGestao(ANO_ATUAL);
  const [meses, setMeses] = useState(24);
  const [aviso, setAviso] = useState('');
  const isAdmin = currentRole === 'ti_admin';
  const detalhe = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const lista = g.projecao.meses.slice(0, meses);
  const maior = Math.max(1, ...lista.map((m) => m.total));
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero rotulo={`Total em ${meses} meses`} valor={brl(total)} />
        <Numero rotulo="OPEX" valor={brl(total - capex)} />
        <Numero rotulo="CAPEX (reposição e compras)" valor={brl(capex)} />
        <Numero rotulo="Média mensal" valor={brl(lista.length ? total / lista.length : 0)} />
      </div>
      <div className="grid items-start grid-cols-1 xl:grid-cols-[2fr_1fr] gap-3">
        <div className="cartao p-3 space-y-2">
          <h3 className="secao-titulo">Mês a mês</h3>
          {lista.map((m) => (
            <div key={m.mes} className="grid grid-cols-[3.5rem_1fr_6.5rem] items-center gap-2">
              <span className="text-slate-600">{rotuloMes(m.mes)}</span>
              <span className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
                <span className="block h-full bg-blue-600" style={{ width: `${(m.opex / maior) * 100}%` }} />
                <span className="block h-full bg-emerald-600" style={{ width: `${(m.capex / maior) * 100}%` }} />
              </span>
              <span className="text-right num">{brl(m.total)}</span>
            </div>
          ))}
        </div>
        <div className="cartao p-3 space-y-2">
          <h3 className="secao-titulo">Por categoria</h3>
          <ul className="space-y-1">
            {porCategoria.map(([cat, v]) => (
              <li key={cat} className="flex justify-between gap-2">
                <span>{ROTULO_CATEGORIA[cat as CategoriaDespesa] || cat}</span>
                <span className="num">{brl(v)}</span>
              </li>
            ))}
          </ul>
          <p className="ajuda">
            Premissas: reajuste padrão de {g.premissas.reajustePadraoPct ?? 5}% ao ano (contratos com mês de reajuste usam o mês deles) · limite de capitalização {brl(g.limite)}. Altere em Configurações.
          </p>
        </div>
      </div>
    </div>
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
  const { assets, departments, settings, currentRole, currentUser } = useApp();
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

  const Totais = ({ t }: { t: TotaisImobilizado }) => (
    <>
      <td className="num">{brl(t.liquidoInicial)}</td>
      <td className="num">{brl(t.aquisicoes)}</td>
      <td className="num">{brl(t.baixasCusto - t.baixasDepAcum)}</td>
      <td className="num">{brl(t.depreciacaoAno)}</td>
      <td className="num font-semibold">{brl(t.liquidoFinal)}</td>
    </>
  );

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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Numero rotulo={`Saldo em 1º/jan`} valor={brl(totais.liquidoInicial)} detalhe={`custo ${brl(totais.custoInicial)}`} />
        <Numero rotulo="Aquisições" valor={brl(totais.aquisicoes)} />
        <Numero rotulo="Baixas (valor líquido)" valor={brl(totais.baixasCusto - totais.baixasDepAcum)} detalhe={`vendas ${brl(totais.vendas)} · ganho/perda ${brl(totais.resultadoBaixas)}`} />
        <Numero rotulo="Depreciação do ano" valor={brl(totais.depreciacaoAno)} />
        <Numero rotulo="Saldo em 31/dez" valor={brl(totais.liquidoFinal)} detalhe={`custo ${brl(totais.custoFinal)}`} />
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
                  <th className="num">Saldo inicial</th>
                  <th className="num">Aquisições</th>
                  <th className="num">Baixas</th>
                  <th className="num">Depreciação</th>
                  <th className="num">Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((gr) => (
                  <tr key={gr.chave}>
                    <td className="font-semibold text-slate-900">{gr.chave}</td>
                    <Totais t={gr.totais} />
                  </tr>
                ))}
              </tbody>
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
                  <th>Baixa</th>
                  <th className="num">Líquido final</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.ativoId}>
                    <td data-label="Patrimônio">{l.tag} · {l.nome}</td>
                    <td data-label="Aquisição">{l.dataAquisicao ? formatDate(l.dataAquisicao) : '—'}</td>
                    <td data-label="Custo" className="num">{brl(l.custo)}</td>
                    <td data-label="Depreciação" className="num">{brl(l.depreciacaoAno)}</td>
                    <td data-label="Baixa">{l.baixa ? `${formatDate(l.baixa.data)} · venda ${brl(l.baixa.valorVenda)}` : '—'}</td>
                    <td data-label="Líquido final" className="num">{brl(l.custoFinal - l.depAcumFinal)}</td>
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
export const RelatoriosView: React.FC = () => {
  const { assets, departments, settings, currentRole } = useApp();
  const [ano, setAno] = useState(ANO_ATUAL);
  const g = useGestao(ano);
  const { lista: recebimentos } = useRecebimentos();
  const { lista: fechamentos } = useFechamentos();
  const [rateios, setRateios] = useState<Rateio[]>([]);
  const [rateando, setRateando] = useState<{ tipo: 'contrato' | 'licenca'; id: string; nome: string } | null>(null);
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  useEffect(() => {
    if (!isTI) return;
    let vivo = true;
    listarRateios().then((r) => {
      if (vivo && r) setRateios(r);
    });
    return () => {
      vivo = false;
    };
  }, [isTI]);
  const nomeDep = (id?: string) => departments.find((d) => d.id === id)?.nome || 'Sem área';
  const fechado = fechamentos.find((f) => f.ano === ano && !f.reabertoEm);
  const contas = settings.premissasFinanceiras?.contaContabil || {};
  const porArea = custoPorArea(g.lancamentos, rateios, nomeDep);

  const baixar = (nome: string, aba: string, cab: string[], ls: (string | number | undefined)[][], excel: boolean) =>
    excel ? baixarExcel(`${nome}.xls`, paraExcel(aba, cab, ls)) : baixarCsv(`${nome}.csv`, paraCsv(cab, ls));

  const relatorios: { titulo: string; descricao: string; gerar: (excel: boolean) => void; so?: 'ti' }[] = [
    {
      titulo: `Imobilizado de ${ano}${fechado ? ' (fechado)' : ''}`,
      descricao: 'Saldo inicial, aquisições, baixas com valor de venda e ganho/perda, depreciação do ano e saldo final por equipamento.',
      so: 'ti',
      gerar: (excel) => {
        const linhas = (fechado?.foto as FotoImobilizado | undefined)?.linhas || imobilizadoDoAno(assets, ano, settings.vidaUtil, g.limite);
        const r = csvImobilizado(linhas, nomeDep);
        baixar(`imobilizado-${ano}`, `Imobilizado ${ano}`, r.cabecalho, r.linhas, excel);
      },
    },
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
      titulo: `Recebimentos de ${ano}`,
      descricao: 'Vendas de equipamento, ressarcimentos, créditos de fornecedor e devoluções, previstos e recebidos.',
      gerar: (excel) =>
        baixar(
          `recebimentos-${ano}`,
          `Recebimentos ${ano}`,
          ['Tipo', 'Descrição', 'Área', 'Valor previsto', 'Previsto para', 'Situação', 'Recebido em', 'Valor recebido'],
          recebimentos
            .filter((r) => (r.recebidoEm || r.previstoPara || r.criadoEm).startsWith(`${ano}`))
            .map((r) => [ROTULO_TIPO_RECEBIMENTO[r.tipo], r.descricao, nomeDep(r.departamentoId), r.valor, r.previstoPara, r.status, r.recebidoEm, r.valorRecebido]),
          excel
        ),
    },
    {
      titulo: `Custo por área de ${ano} (com rateio)`,
      descricao: 'Realizado de cada área; contratos e licenças rateados entram pela porcentagem de cada área.',
      gerar: (excel) => baixar(`custo-por-area-${ano}`, `Custo por área ${ano}`, ['Área', 'Realizado'], porArea.map((a) => [a.area, a.valor]), excel),
    },
  ];

  const recorrentesRateaveis = g.recorrentes.filter((r) => r.origem !== 'linha');

  return (
    <div className="space-y-3">
      <CabecalhoTela
        titulo="Relatórios"
        subtitulo="Exportações para a contabilidade (CSV com ; e Excel), sempre com o mesmo layout, e custo por área"
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
              </div>
              <span className="flex gap-2">
                <button type="button" onClick={() => r.gerar(false)} className="btn btn-sm btn-secundario"><Download /> CSV</button>
                <button type="button" onClick={() => r.gerar(true)} className="btn btn-sm btn-secundario"><FileSpreadsheet /> Excel</button>
              </span>
            </div>
          ))}
      </div>
      <div className="grid items-start grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="cartao p-3 space-y-2">
          <h3 className="secao-titulo">Custo por área ({ano}, realizado)</h3>
          {porArea.length === 0 ? (
            <p className="texto-aux">Nada pago no ano.</p>
          ) : (
            <ul className="space-y-1">
              {porArea.map((a) => (
                <li key={a.area} className="flex justify-between gap-2">
                  <span>{a.area}</span>
                  <span className="num">{brl(a.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {isTI && (
          <div className="cartao p-3 space-y-2">
            <h3 className="secao-titulo">Rateio entre áreas</h3>
            <p className="ajuda">Divide o custo de um contrato ou licença entre as áreas que usam. Não é cobrança: só muda o relatório de custo por área.</p>
            <ul className="space-y-1 max-h-72 overflow-auto">
              {recorrentesRateaveis.map((r) => {
                const partes = rateios.filter((x) => x.origemTipo === r.origem && x.origemId === r.id);
                return (
                  <li key={r.origem + r.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {r.nome}
                      <span className="block text-slate-500">{partes.length ? partes.map((p) => `${nomeDep(p.departamentoId)} ${p.percentual}%`).join(' · ') : 'sem rateio'}</span>
                    </span>
                    <button type="button" onClick={() => setRateando({ tipo: r.origem as 'contrato' | 'licenca', id: r.id, nome: r.nome })} className="btn btn-sm btn-secundario">
                      <Split /> Ratear
                    </button>
                  </li>
                );
              })}
            </ul>
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
  const [linhas, setLinhas] = useState<{ area: string; categoria: string; previsto: number; realizado: number }[] | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!supabase) return setLinhas([]);
      const { data, error } = await supabase.rpc('custos_da_minha_area' as never, { p_ano: ano } as never);
      if (!vivo) return;
      setLinhas(error ? [] : ((data || []) as { area: string; categoria: string; previsto: number; realizado: number }[]).map((l) => ({ ...l, previsto: Number(l.previsto) || 0, realizado: Number(l.realizado) || 0 })));
    })();
    return () => {
      vivo = false;
    };
  }, [ano]);
  const area = linhas?.[0]?.area;
  const previsto = (linhas || []).reduce((s, l) => s + l.previsto, 0);
  const realizado = (linhas || []).reduce((s, l) => s + l.realizado, 0);
  return (
    <div className="space-y-3">
      <CabecalhoTela
        titulo="Custos da minha área"
        subtitulo={`${area ? `${area} · ` : ''}orçamento de T.I. previsto × pago em ${ano}, por categoria (só totais)`}
        filtros={<SeletorAno ano={ano} onMudar={setAno} anos={[ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2]} />}
      />
      {linhas === null ? null : linhas.length === 0 ? (
        <Vazio>Sem orçamento nem gasto de T.I. registrado para a sua área em {ano}.</Vazio>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Numero rotulo="Previsto" valor={brl(previsto)} />
            <Numero rotulo="Pago" valor={brl(realizado)} />
            <Numero rotulo="Disponível" valor={brl(previsto - realizado)} tom={previsto - realizado < 0 ? 'problema' : undefined} />
          </div>
          <div className="cartao-tabela">
            <table className="tabela tabela-cartoes">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th className="num">Previsto</th>
                  <th className="num">Pago</th>
                  <th className="num">% usado</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.categoria}>
                    <td data-label="Categoria">{ROTULO_CATEGORIA[l.categoria as CategoriaDespesa] || l.categoria}</td>
                    <td data-label="Previsto" className="num">{brl(l.previsto)}</td>
                    <td data-label="Pago" className="num">{brl(l.realizado)}</td>
                    <td data-label="% usado" className="num">{l.previsto ? pct(l.realizado / l.previsto) : '—'}</td>
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
