/**
 * Financeiro (um item no menu) com abas Contas a pagar, Despesas e Compras (seção 9.4).
 * Despesas: período escolhido pela pessoa, filtros combináveis, realizado × previsto,
 * comparação com o período anterior, evolução mês a mês, agrupamento, detalhe clicável e CSV.
 * O período é o mesmo em Despesas e Compras (trocar de aba não perde a escolha).
 *
 * Realizado = faturas pagas cuja competência cai no período.
 * Previsto  = custo recorrente de cada mês do período (contratos vigentes naquele mês,
 *             softwares com cobrança própria, linhas avulsas) — o que se espera gastar.
 * Seção 21: previsto e realizado são comparados no mesmo recorte (competências até o mês
 * corrente); o previsto dos meses seguintes do período aparece à parte, como "a vencer".
 */
import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import type { CategoriaDespesa, Fatura } from '../../types/index.ts';
import { formatDate, isoLocal } from '../../utils/formatters.ts';
import { statusExibido, ROTULO_STATUS_FATURA, rotuloCompetencia } from '../../utils/faturas.ts';
import { contratoEmVigorNoPeriodo, fimDoMes, nomeContrato } from '../../utils/contratos.ts';
import {
  CATEGORIA_DO_TIPO,
  ROTULO_CATEGORIA,
  assentosOciosos,
  baixarCsv,
  brl,
  formaCobrancaDe,
  mensalDaLicenca,
  mensalDoContrato,
  paraCsv,
  previstoRealizadoAteHoje,
  somarPor,
  valorEfetivo,
} from '../../utils/financeiro.ts';
import { ComprasView } from './ComprasView.tsx';
import { Abas } from '../ui/Abas.tsx';
import { CabecalhoTela, Vazio } from '../ui/Tela.tsx';

type Atalho = 'este_mes' | 'mes_anterior' | 'ult3' | 'ult6' | 'ult12' | 'este_ano' | 'ano_anterior' | 'personalizado';
const ROTULO_ATALHO: Record<Atalho, string> = {
  este_mes: 'Este mês',
  mes_anterior: 'Mês anterior',
  ult3: 'Últimos 3 meses',
  ult6: 'Últimos 6 meses',
  ult12: 'Últimos 12 meses',
  este_ano: 'Este ano',
  ano_anterior: 'Ano anterior',
  personalizado: 'De / até (escolher)',
};

/** Competências (1º dia) do mês de `de` até o mês de `ate` */
function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  const [a1, m1] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  for (let d = new Date(a1, m1 - 1, 1); d <= new Date(a2, m2 - 1, 1); d.setMonth(d.getMonth() + 1)) out.push(isoLocal(d));
  return out;
}

function periodoDoAtalho(a: Atalho, hoje = new Date()): { de: string; ate: string } {
  const y = hoje.getFullYear();
  const m = hoje.getMonth();
  const ini = (yy: number, mm: number) => isoLocal(new Date(yy, mm, 1));
  const fim = (yy: number, mm: number) => isoLocal(new Date(yy, mm + 1, 0));
  switch (a) {
    case 'mes_anterior':
      return { de: ini(y, m - 1), ate: fim(y, m - 1) };
    case 'ult3':
      return { de: ini(y, m - 2), ate: fim(y, m) };
    case 'ult6':
      return { de: ini(y, m - 5), ate: fim(y, m) };
    case 'ult12':
      return { de: ini(y, m - 11), ate: fim(y, m) };
    case 'este_ano':
      return { de: ini(y, 0), ate: fim(y, 11) };
    case 'ano_anterior':
      return { de: ini(y - 1, 0), ate: fim(y - 1, 11) };
    default:
      return { de: ini(y, m), ate: fim(y, m) };
  }
}

/** Período anterior de mesmo tamanho (em meses) */
function periodoAnterior(de: string, ate: string) {
  const n = mesesEntre(de, ate).length;
  const [a, m] = de.split('-').map(Number);
  return { de: isoLocal(new Date(a, m - 1 - n, 1)), ate: isoLocal(new Date(a, m - 1, 0)) };
}

const SELO_FATURA = { a_pagar: 'selo-atencao', vencida: 'selo-problema', paga: 'selo-ok', cancelada: 'selo-neutro' } as const;

interface Origem {
  tipo: 'contrato' | 'licenca' | 'linha';
  id: string;
  nome: string;
  fornecedorId?: string;
  categoria: CategoriaDespesa;
  area?: string;
}

/**
 * Seção 17: "Custos do período" (lado técnico; antes "Custos recorrentes"): o que a T.I.
 * custa e as compras de equipamento. Contas a pagar e Orçamento ficam no Financeiro e na Gestão de T.I.
 */
export const FinanceiroView: React.FC = () => {
  const [aba, setAba] = useState<'despesas' | 'compras'>('despesas');
  // Período em comum entre Despesas e Compras
  const [atalho, setAtalho] = useState<Atalho>('ult6');
  const [deManual, setDeManual] = useState('');
  const [ateManual, setAteManual] = useState('');
  const periodo =
    atalho === 'personalizado' && deManual && ateManual && deManual <= ateManual
      ? { de: deManual, ate: ateManual }
      : periodoDoAtalho(atalho === 'personalizado' ? 'este_mes' : atalho);

  const abas = (
    <Abas
      rotulo="Custos do período"
      ativa={aba}
      onMudar={setAba}
      itens={[
        { id: 'despesas' as const, rotulo: 'Recorrentes' },
        { id: 'compras' as const, rotulo: 'Compras de equipamento' },
      ]}
    />
  );
  const filtroPeriodo = (
    <>
      <select aria-label="Período" value={atalho} onChange={(e) => setAtalho(e.target.value as Atalho)} className="campo campo-sm">
        {Object.entries(ROTULO_ATALHO).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      {atalho === 'personalizado' && (
        <>
          <input aria-label="De" title="De" type="date" value={deManual} onChange={(e) => setDeManual(e.target.value)} className="campo campo-sm" />
          <input aria-label="Até" title="Até" type="date" value={ateManual} min={deManual || undefined} onChange={(e) => setAteManual(e.target.value)} className="campo campo-sm" />
        </>
      )}
    </>
  );
  if (aba === 'compras') return <ComprasView abas={abas} periodo={periodo} filtroPeriodo={filtroPeriodo} />;
  return <DespesasView abas={abas} periodo={periodo} filtroPeriodo={filtroPeriodo} />;
};

export const DespesasView: React.FC<{
  abas?: React.ReactNode;
  /** Período escolhido no Financeiro (o mesmo de Compras) */
  periodo: { de: string; ate: string };
  /** Seletor de período (atalhos ou de/até), montado pelo Financeiro */
  filtroPeriodo: React.ReactNode;
}> = ({ abas, periodo, filtroPeriodo }) => {
  const { licenses, contratos, faturas, fornecedores, abrirFicha } = useApp();
  const { linhas } = useRecursos();
  const [fFornecedor, setFFornecedor] = useState('');
  const [fCategoria, setFCategoria] = useState('');
  const [fArea, setFArea] = useState('');
  const [fOrigem, setFOrigem] = useState<'' | Origem['tipo']>('');
  const [agrupar, setAgrupar] = useState<'categoria' | 'fornecedor' | 'area' | 'origem'>('categoria');

  const meses = mesesEntre(periodo.de, periodo.ate);
  const anterior = periodoAnterior(periodo.de, periodo.ate);

  const nomeForn = (id?: string) => fornecedores.find((f) => f.id === id)?.nome || 'Sem fornecedor';

  // De onde vem cada fatura (contrato ou software) com fornecedor, categoria e área
  const origemDaFatura = (f: Fatura): Origem | undefined => {
    if (f.contratoId) {
      const c = contratos.find((x) => x.id === f.contratoId);
      if (!c) return undefined;
      return { tipo: 'contrato', id: c.id, nome: nomeContrato(c), fornecedorId: c.fornecedorId, categoria: c.categoriaDespesa || CATEGORIA_DO_TIPO[c.tipo], area: c.centroCusto };
    }
    const l = licenses.find((x) => x.id === f.licencaId);
    if (!l) return undefined;
    return { tipo: 'licenca', id: l.id, nome: l.nome, fornecedorId: l.fornecedorId, categoria: l.categoriaDespesa || 'software', area: l.centroCusto };
  };

  const passa = (o?: Origem) =>
    !!o &&
    (!fFornecedor || o.fornecedorId === fFornecedor) &&
    (!fCategoria || o.categoria === fCategoria) &&
    (!fArea || (o.area || '') === fArea) &&
    (!fOrigem || o.tipo === fOrigem);

  // Previsto de um mês: recorrentes vigentes naquele mês
  const previstoDoMes = (comp: string): { origem: Origem; valor: number }[] => {
    const ate = fimDoMes(comp);
    const itens: { origem: Origem; valor: number }[] = [];
    contratos
      .filter((c) => contratoEmVigorNoPeriodo(c, comp, ate))
      .forEach((c) =>
        itens.push({
          origem: { tipo: 'contrato', id: c.id, nome: nomeContrato(c), fornecedorId: c.fornecedorId, categoria: c.categoriaDespesa || CATEGORIA_DO_TIPO[c.tipo], area: c.centroCusto },
          valor: mensalDoContrato(c),
        })
      );
    licenses
      // licença inativada conta até o mês em que foi inativada
      .filter((l) => (l.status !== 'inativa' || (!!l.inativadaEm && l.inativadaEm.slice(0, 10) >= comp)) && formaCobrancaDe(l, contratos) === 'propria')
      .forEach((l) =>
        itens.push({
          origem: { tipo: 'licenca', id: l.id, nome: l.nome, fornecedorId: l.fornecedorId, categoria: l.categoriaDespesa || 'software', area: l.centroCusto },
          valor: mensalDaLicenca(l),
        })
      );
    linhas
      .filter((ln) => ln.status === 'ativa' && !ln.contratoId && ln.valorMensal)
      .forEach((ln) => itens.push({ origem: { tipo: 'linha', id: ln.id, nome: ln.numero, categoria: 'telefonia', area: ln.centroCusto }, valor: ln.valorMensal || 0 }));
    return itens.filter((i) => passa(i.origem));
  };

  const dados = useMemo(() => {
    const dentro = (f: Fatura, de: string, ate: string) => f.competencia >= de.slice(0, 8) + '01' && f.competencia <= ate;
    const doPeriodo = faturas.filter((f) => f.status !== 'cancelada' && dentro(f, periodo.de, periodo.ate) && passa(origemDaFatura(f)));
    const pagas = doPeriodo.filter((f) => f.status === 'paga');
    const realizado = pagas.reduce((s, f) => s + valorEfetivo(f), 0);
    const realizadoAnterior = faturas
      .filter((f) => f.status === 'paga' && dentro(f, anterior.de, anterior.ate) && passa(origemDaFatura(f)))
      .reduce((s, f) => s + valorEfetivo(f), 0);
    const porMes = meses.map((comp) => ({
      comp,
      realizado: pagas.filter((f) => f.competencia === comp).reduce((s, f) => s + valorEfetivo(f), 0),
      previsto: previstoDoMes(comp).reduce((s, i) => s + i.valor, 0),
    }));
    const previsto = porMes.reduce((s, m) => s + m.previsto, 0);
    const aPagar = doPeriodo.filter((f) => f.status === 'a_pagar').reduce((s, f) => s + valorEfetivo(f), 0);
    const chave = (o: Origem) =>
      agrupar === 'categoria' ? ROTULO_CATEGORIA[o.categoria] : agrupar === 'fornecedor' ? nomeForn(o.fornecedorId) : agrupar === 'area' ? o.area || 'Sem área' : o.tipo === 'contrato' ? 'Contratos' : o.tipo === 'licenca' ? 'Softwares' : 'Linhas';
    const grupos = somarPor(pagas, (f) => chave(origemDaFatura(f) as Origem), (f) => valorEfetivo(f));
    // Mesmo recorte para comparar: competências até o mês corrente; o resto do previsto fica "a vencer"
    const ateHoje = previstoRealizadoAteHoje(porMes);
    return { doPeriodo, realizado, realizadoAnterior, porMes, previsto, aPagar, grupos, ateHoje };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faturas, contratos, licenses, linhas, periodo.de, periodo.ate, fFornecedor, fCategoria, fArea, fOrigem, agrupar]);

  const variacao = dados.realizadoAnterior ? ((dados.realizado - dados.realizadoAnterior) / dados.realizadoAnterior) * 100 : undefined;
  const maior = Math.max(1, ...dados.porMes.map((m) => Math.max(m.realizado, m.previsto)));
  const areas = [...new Set([...contratos.map((c) => c.centroCusto), ...licenses.map((l) => l.centroCusto), ...linhas.map((l) => l.centroCusto)].filter(Boolean))] as string[];
  const ociosos = assentosOciosos(licenses, contratos).filter((o) =>
    passa({ tipo: 'licenca', id: o.licenca.id, nome: o.licenca.nome, fornecedorId: o.licenca.fornecedorId, categoria: o.licenca.categoriaDespesa || 'software', area: o.licenca.centroCusto })
  );

  const abrirOrigem = (o?: Origem) => {
    if (!o) return;
    if (o.tipo === 'contrato') abrirFicha({ tipo: 'contrato', id: o.id });
    else if (o.tipo === 'licenca') abrirFicha({ tipo: 'software', id: o.id });
  };

  const exportar = () =>
    baixarCsv(
      `despesas-${periodo.de}-a-${periodo.ate}.csv`,
      paraCsv(
        ['Competência', 'Origem', 'Tipo', 'Fornecedor', 'Categoria', 'Área', 'Valor (R$)', 'Situação', 'Vencimento', 'Pago em'],
        dados.doPeriodo.map((f) => {
          const o = origemDaFatura(f);
          return [f.competencia.slice(0, 7), o?.nome, o?.tipo, nomeForn(o?.fornecedorId), o ? ROTULO_CATEGORIA[o.categoria] : '', o?.area || '', valorEfetivo(f), statusExibido(f), f.vencimento, f.pagoEm || ''];
        })
      )
    );

  const limpar = () => {
    setFFornecedor('');
    setFCategoria('');
    setFArea('');
    setFOrigem('');
  };
  const temFiltro = !!(fFornecedor || fCategoria || fArea || fOrigem);
  // Coluna sem nenhum dado some
  const comArea = dados.doPeriodo.some((f) => origemDaFatura(f)?.area);

  return (
    <div className="space-y-4">
      {/* Período e filtros */}
      <CabecalhoTela
        titulo="Custos do período"
        subtitulo={`${formatDate(periodo.de)} a ${formatDate(periodo.ate)} (${meses.length} ${meses.length === 1 ? 'mês' : 'meses'}) · comparado com ${formatDate(anterior.de)} a ${formatDate(anterior.ate)}`}
        acoes={
          <button type="button" onClick={exportar} className="btn btn-secundario">
            <Download /> Exportar CSV
          </button>
        }
        abas={abas}
        filtros={
          <>
            {filtroPeriodo}
            <select aria-label="Fornecedor" value={fFornecedor} onChange={(e) => setFFornecedor(e.target.value)} className="campo campo-sm">
              <option value="">Todos os fornecedores</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
            <select aria-label="Categoria" value={fCategoria} onChange={(e) => setFCategoria(e.target.value)} className="campo campo-sm">
              <option value="">Todas as categorias</option>
              {Object.entries(ROTULO_CATEGORIA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select aria-label="Área" value={fArea} onChange={(e) => setFArea(e.target.value)} className="campo campo-sm">
              <option value="">Todas as áreas</option>
              {areas.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select aria-label="Origem" value={fOrigem} onChange={(e) => setFOrigem(e.target.value as typeof fOrigem)} className="campo campo-sm">
              <option value="">Todas as origens</option>
              <option value="contrato">Contratos</option>
              <option value="licenca">Softwares</option>
              <option value="linha">Linhas avulsas</option>
            </select>
            {temFiltro && <button type="button" onClick={limpar} className="btn btn-sm btn-secundario">Limpar filtros</button>}
          </>
        }
      />
      {/* Números do período: previsto e realizado no mesmo recorte (até hoje); o resto do previsto é "a vencer" */}
      <div className="grid items-start grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="cartao p-3">
          <p className="texto-aux">Realizado até hoje (pago)</p>
          <p className="text-lg font-semibold num text-slate-900">{brl(dados.realizado)}</p>
          {variacao !== undefined && (
            <p className="texto-aux">
              {variacao > 0 ? '+' : ''}
              {variacao.toFixed(0)}% vs período anterior ({brl(dados.realizadoAnterior)})
            </p>
          )}
        </div>
        <div className="cartao p-3">
          <p className="texto-aux">Previsto até hoje (recorrente)</p>
          <p className="text-lg font-semibold num text-slate-900">{brl(dados.ateHoje.previsto)}</p>
          <p className="texto-aux">
            realizado − previsto: <span className="num">{brl(dados.ateHoje.diferenca)}</span>
            {dados.ateHoje.aVencer > 0 && (
              <>
                {' '}· a vencer no período: <span className="num">{brl(dados.ateHoje.aVencer)}</span>
              </>
            )}
          </p>
        </div>
        <div className="cartao p-3">
          <p className="texto-aux">A pagar no período</p>
          <p className="text-lg font-semibold num text-slate-900">{brl(dados.aPagar)}</p>
          <p className="texto-aux">faturas lançadas e ainda não pagas</p>
        </div>
        <div className="cartao p-3">
          <p className="texto-aux">Assentos sem uso (por mês)</p>
          <p className="text-lg font-semibold num text-amber-800">{brl(ociosos.reduce((s, o) => s + o.custoMensal, 0))}</p>
          {/* Seção 19: lista em até 2 linhas (o resto no texto de ajuda) para o cartão não esticar a linha dos indicadores */}
          <p className="texto-aux line-clamp-2" title={ociosos.map((o) => `${o.licenca.nome} (${o.livres})`).join(', ')}>
            {ociosos.map((o) => `${o.licenca.nome} (${o.livres})`).join(', ') || 'nenhum'}
          </p>
        </div>
      </div>

      <div className="grid items-start grid-cols-1 xl:grid-cols-2 gap-3">
        {/* Mês a mês */}
        <div className="cartao p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="secao-titulo">Mês a mês</h3>
            <span className="texto-aux">
              <span className="inline-block w-2.5 h-2.5 bg-emerald-600 rounded-sm align-middle" /> realizado{' '}
              <span className="inline-block w-2.5 h-2.5 bg-slate-300 rounded-sm align-middle ml-2" /> previsto
            </span>
          </div>
          <ul className="space-y-2">
            {dados.porMes.map((m) => (
              <li key={m.comp} className="grid grid-cols-[5.5rem_1fr_7rem] items-center gap-2">
                <span className="text-slate-600">{rotuloCompetencia(m.comp)}</span>
                <span className="space-y-0.5">
                  <span className="block h-2 bg-emerald-600 rounded-full" style={{ width: `${(m.realizado / maior) * 100}%` }} />
                  <span className="block h-2 bg-slate-300 rounded-full" style={{ width: `${(m.previsto / maior) * 100}%` }} />
                </span>
                <span className="text-right font-mono">
                  {brl(m.realizado)}
                  <span className="block text-slate-500">{brl(m.previsto)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Agrupamento do realizado */}
        <div className="cartao p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="secao-titulo">Realizado por</h3>
            <select value={agrupar} onChange={(e) => setAgrupar(e.target.value as typeof agrupar)} aria-label="Agrupar por" className="campo campo-sm">
              <option value="categoria">Categoria</option>
              <option value="fornecedor">Fornecedor</option>
              <option value="area">Área / centro de custo</option>
              <option value="origem">Origem</option>
            </select>
          </div>
          {dados.grupos.length === 0 ? (
            <p className="texto-aux">Nada pago neste período com estes filtros.</p>
          ) : (
            <ul className="space-y-2">
              {dados.grupos.map((g) => (
                <li key={g.chave} className="">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-800">{g.chave}</span>
                    <span className="font-mono font-semibold">
                      {brl(g.total)} <span className="text-slate-500 font-normal">({dados.realizado ? ((g.total / dados.realizado) * 100).toFixed(0) : 0}%)</span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${dados.realizado ? (g.total / dados.realizado) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Detalhe */}
      <div className="cartao-tabela">
        <h3 className="secao-titulo px-3 pt-3">Faturas do período ({dados.doPeriodo.length})</h3>
        {dados.doPeriodo.length === 0 ? (
          <div className="p-3">
            <Vazio
              titulo="Nenhuma fatura no período"
              acao={
                temFiltro ? (
                  <button type="button" onClick={limpar} className="btn btn-sm btn-secundario">
                    Limpar filtros
                  </button>
                ) : undefined
              }
            >
              {temFiltro ? 'Nenhuma fatura no período com estes filtros.' : 'Nenhuma fatura de contrato ou software lançada para estas competências.'}
            </Vazio>
          </div>
        ) : (
          <table className="tabela tabela-cartoes mt-2">
            <thead>
              <tr>
                <th>Competência</th>
                <th>Origem</th>
                <th>Fornecedor</th>
                <th className="hidden xl:table-cell">Categoria</th>
                {comArea && <th className="hidden xl:table-cell">Área</th>}
                <th className="num">Valor</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {[...dados.doPeriodo]
                .sort((a, b) => b.competencia.localeCompare(a.competencia))
                .map((f) => {
                  const o = origemDaFatura(f);
                  const st = statusExibido(f);
                  return (
                    <tr key={f.id}>
                      <td data-label="Competência">{rotuloCompetencia(f.competencia)}</td>
                      <td data-label="Origem">
                        {o && o.tipo !== 'linha' ? (
                          <button type="button" onClick={() => abrirOrigem(o)} className="link text-left">{o.nome}</button>
                        ) : (
                          o?.nome || '—'
                        )}
                      </td>
                      <td data-label="Fornecedor">
                        {o?.fornecedorId ? (
                          <button type="button" onClick={() => abrirFicha({ tipo: 'fornecedor', id: o.fornecedorId! })} className="link text-left">{nomeForn(o.fornecedorId)}</button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td data-label="Categoria" className="hidden xl:table-cell">{o ? ROTULO_CATEGORIA[o.categoria] : '—'}</td>
                      {comArea && <td data-label="Área" className="hidden xl:table-cell">{o?.area || '—'}</td>}
                      <td data-label="Valor" className="num">{brl(valorEfetivo(f))}</td>
                      <td data-label="Situação">
                        <span className={`selo ${SELO_FATURA[st]}`}>{ROTULO_STATUS_FATURA[st]}</span>
                        {f.pagoEm && <span className="block text-slate-500">em {formatDate(f.pagoEm)}</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
