/**
 * Seção 6 · Telas do menu: Vencimentos, Contas a pagar, Despesas e Conciliar fornecedores.
 * Tudo calculado a partir da fonte única (utils/financeiro.ts); nada é digitado duas vezes.
 */
import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import type { CategoriaDespesa, Fatura } from '../../types/index.ts';
import { formatDate } from '../../utils/formatters.ts';
import { statusExibido } from '../../utils/faturas.ts';
import { nomeContrato } from '../../utils/contratos.ts';
import { normalizar } from '../../utils/processos.ts';
import {
  ROTULO_CATEGORIA,
  ROTULO_VENCIMENTO,
  assentosOciosos,
  baixarCsv,
  brl,
  despesasRecorrentes,
  listarVencimentos,
  nomesParecidos,
  pagoPorMes,
  paraCsv,
  pendenciasConciliacao,
  somarPor,
  type TipoVencimento,
  type Vencimento,
} from '../../utils/financeiro.ts';
import { FaturasSecao } from './FaturasSecao.tsx';
import { FornecedorFormModal } from '../fornecedores/FornecedorFormModal.tsx';

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
export const VencimentosView: React.FC = () => {
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
      <Topo titulo="Vencimentos" sub="Garantias, contratos, prazos de cancelamento, renovações, faturas, estoque baixo e recursos de desligados">
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
    <div className="space-y-6">
      <Topo titulo="Contas a pagar" sub="Todas as faturas de contratos e softwares, num lugar só">
        <span className="text-xs text-slate-600">
          Total na lista: <span className="font-mono font-semibold text-slate-900">{brl(total)}</span>
        </span>
      </Topo>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar origem ou documento..." aria-label="Buscar" className="w-full sm:w-64 text-sm sm:text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg" />
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
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Competência" className={CAMPO_FILTRO} />
        <button type="button" onClick={exportar} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>
      <FaturasSecao listaGlobal={lista} />
    </div>
  );
};

// -----------------------------------------------------------------------------
// Despesas
// -----------------------------------------------------------------------------
export const DespesasView: React.FC = () => {
  const { licenses, contratos, faturas, fornecedores } = useApp();
  const { linhas } = useRecursos();
  const [agrupar, setAgrupar] = useState<'categoria' | 'fornecedor' | 'area'>('categoria');
  const itens = despesasRecorrentes({ licencas: licenses, contratos, linhas });
  const totalMensal = itens.reduce((s, i) => s + i.mensal, 0);
  const nomeForn = (id?: string) => fornecedores.find((f) => f.id === id)?.nome || 'Sem fornecedor';
  const grupos = somarPor(
    itens,
    (i) => (agrupar === 'categoria' ? ROTULO_CATEGORIA[i.categoria as CategoriaDespesa] : agrupar === 'fornecedor' ? nomeForn(i.fornecedorId) : i.centroCusto || 'Sem área'),
    (i) => i.mensal
  );
  const meses = pagoPorMes(faturas, 12);
  const maiorMes = Math.max(1, ...meses.map((m) => m.total));
  const ociosos = assentosOciosos(licenses, contratos);
  const custoOcioso = ociosos.reduce((s, o) => s + o.custoMensal, 0);

  const exportar = () =>
    baixarCsv(
      'despesas-recorrentes.csv',
      paraCsv(
        ['Origem', 'Nome', 'Fornecedor', 'Categoria', 'Área', 'Mensal (R$)', 'Anual (R$)'],
        itens.map((i) => [i.origem, i.nome, nomeForn(i.fornecedorId), ROTULO_CATEGORIA[i.categoria], i.centroCusto || '', i.mensal, i.mensal * 12])
      )
    );

  return (
    <div className="space-y-6">
      <Topo titulo="Despesas" sub="Custo recorrente de hoje (softwares, contratos e linhas) e o que foi pago mês a mês">
        <button type="button" onClick={exportar} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </Topo>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Custo mensal recorrente</p>
          <p className="text-lg font-semibold font-mono text-slate-900">{brl(totalMensal)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Custo anual estimado</p>
          <p className="text-lg font-semibold font-mono text-slate-900">{brl(totalMensal * 12)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Assentos sem uso (por mês)</p>
          <p className="text-lg font-semibold font-mono text-amber-800">{brl(custoOcioso)}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Custo mensal por</h3>
          <select value={agrupar} onChange={(e) => setAgrupar(e.target.value as typeof agrupar)} aria-label="Agrupar por" className={CAMPO_FILTRO}>
            <option value="categoria">Categoria</option>
            <option value="fornecedor">Fornecedor</option>
            <option value="area">Área / centro de custo</option>
          </select>
        </div>
        {grupos.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhuma despesa recorrente.</p>
        ) : (
          <ul className="space-y-2">
            {grupos.map((g) => (
              <li key={g.chave} className="text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-800">{g.chave}</span>
                  <span className="font-mono font-semibold text-slate-900">{brl(g.total)}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${totalMensal ? (g.total / totalMensal) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Pago por mês (últimos 12)</h3>
        <ul className="space-y-1.5">
          {meses.map((m) => (
            <li key={m.mes} className="grid grid-cols-[4.5rem_1fr_6.5rem] items-center gap-2 text-xs">
              <span className="text-slate-600">{m.mes.slice(5)}/{m.mes.slice(0, 4)}</span>
              <span className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <span className="block h-full bg-emerald-600 rounded-full" style={{ width: `${(m.total / maiorMes) * 100}%` }} />
              </span>
              <span className="font-mono text-right text-slate-900">{brl(m.total)}</span>
            </li>
          ))}
        </ul>
      </div>

      {ociosos.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl p-4 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">Assentos pagos sem uso</h3>
          <ul className="space-y-1 text-xs">
            {ociosos.map((o) => (
              <li key={o.licenca.id} className="flex justify-between gap-2">
                <span>{o.licenca.nome} · {o.livres} livre(s)</span>
                <span className="font-mono">{brl(o.custoMensal)}/mês</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Conciliar fornecedores (admin): texto antigo → cadastro
// -----------------------------------------------------------------------------
export const ConciliarView: React.FC = () => {
  const { licenses, assets, fornecedores, editarLicenca, editarAtivo } = useApp();
  const pendencias = pendenciasConciliacao(licenses, assets);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [criarPara, setCriarPara] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const chave = (p: { tipo: string; id: string }) => `${p.tipo}:${p.id}`;

  const ligar = async (p: (typeof pendencias)[number], fornecedorId: string) => {
    if (!fornecedorId) return setErro('Escolha o fornecedor.');
    const falha =
      p.tipo === 'licenca'
        ? await editarLicenca(p.id, { fornecedorId })
        : await editarAtivo(p.id, { fornecedorId });
    setErro(falha ? `Não foi possível ligar ${p.nome}: ${falha}` : '');
  };

  // Liga de uma vez todas as pendências com o mesmo texto
  const ligarTodosIguais = async (texto: string, fornecedorId: string) => {
    for (const p of pendencias.filter((x) => x.textoFornecedor.toLowerCase() === texto.toLowerCase())) await ligar(p, fornecedorId);
  };

  return (
    <div className="space-y-6">
      <Topo titulo="Conciliar fornecedores" sub="Cadastros antigos com o fornecedor digitado em texto. Escolha o fornecedor certo do cadastro (ou crie) — nada é criado sozinho." />
      {erro && <p className="text-xs font-medium text-red-700" role="alert">{erro}</p>}
      {pendencias.length === 0 ? (
        <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-xl p-4">Nenhuma pendência: todos os cadastros usam o fornecedor do cadastro.</p>
      ) : (
        <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden">
          <table className="tabela-cartoes w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <th className="py-2 px-3">Cadastro</th>
                <th className="py-2 px-3">Texto antigo</th>
                <th className="py-2 px-3">Fornecedor do cadastro</th>
                <th className="py-2 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {pendencias.map((p) => {
                const sugestao = nomesParecidos(p.textoFornecedor, fornecedores)[0];
                const valor = escolha[chave(p)] ?? sugestao?.id ?? '';
                const iguais = pendencias.filter((x) => x.textoFornecedor.toLowerCase() === p.textoFornecedor.toLowerCase()).length;
                return (
                  <tr key={chave(p)}>
                    <td data-label="Cadastro" className="py-2 px-3">
                      <span className="font-medium text-slate-900">{p.nome}</span>
                      <span className="block text-slate-500">{p.tipo === 'licenca' ? 'Software' : 'Equipamento'}</span>
                    </td>
                    <td data-label="Texto antigo" className="py-2 px-3">{p.textoFornecedor}</td>
                    <td data-label="Fornecedor do cadastro" className="py-2 px-3">
                      <select value={valor} onChange={(e) => setEscolha({ ...escolha, [chave(p)]: e.target.value })} aria-label={`Fornecedor de ${p.nome}`} className={CAMPO_FILTRO}>
                        <option value="">Escolha…</option>
                        {fornecedores.filter((f) => f.ativo).map((f) => (
                          <option key={f.id} value={f.id}>{f.nome}</option>
                        ))}
                      </select>
                      {sugestao && !escolha[chave(p)] && <span className="block text-slate-500 mt-0.5">Sugerido pelo nome parecido</span>}
                    </td>
                    <td data-label="Ação" className="py-2 px-3 text-right">
                      <span className="inline-flex flex-wrap justify-end gap-1.5">
                        <button type="button" onClick={() => ligar(p, valor)} className="px-2 py-1 text-xs font-semibold text-white bg-blue-600 rounded-md">Ligar</button>
                        {iguais > 1 && (
                          <button type="button" onClick={() => ligarTodosIguais(p.textoFornecedor, valor)} className="px-2 py-1 text-xs font-medium text-blue-700 border border-blue-200 rounded-md">
                            Ligar os {iguais} iguais
                          </button>
                        )}
                        <button type="button" onClick={() => setCriarPara(chave(p))} className="px-2 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-md">Criar fornecedor</button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {criarPara && (
        <FornecedorFormModal
          nomeInicial={pendencias.find((p) => chave(p) === criarPara)?.textoFornecedor}
          onClose={() => setCriarPara(null)}
          onSalvo={(f) => {
            const p = pendencias.find((x) => chave(x) === criarPara);
            setCriarPara(null);
            if (p) void ligarTodosIguais(p.textoFornecedor, f.id);
          }}
        />
      )}
    </div>
  );
};
