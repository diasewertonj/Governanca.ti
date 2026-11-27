/**
 * Seção 17 · Dados da Gestão de T.I. num lugar só: premissas, recorrente de hoje,
 * livro do ano (comprometido · a pagar · realizado), orçamento de gestão e projeção.
 * Todas as telas (painel, orçamento, projeção, relatórios) leem daqui.
 */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import { recorrenteResumo, type RecorrenteResumo } from '../../services/financeiroDb.ts';
import type { CategoriaDespesa, Orcamento, PedidoCompra } from '../../types/index.ts';
import { CATEGORIA_DO_TIPO, despesasRecorrentes, type LinhaDespesa } from '../../utils/financeiro.ts';
import { alertasOrcamento, comprometidoNoOrcamento, valorDoPedido, type AlertaOrcamento, type LinhaOrcamento } from '../../utils/compras.ts';
import {
  type ItemRecorrente,
  LIMITE_CAPITALIZACAO_PADRAO,
  lancamentosDoLivro,
  orcamentoDeGestao,
  projecaoGastos,
  recorrentesParaProjecao,
  recorrenteRestante,
  type Natureza,
  type Premissas,
} from '../../utils/gestaoFinanceira.ts';

/** Mês de competência do pedido para o livro (aprovação; sem ela, criação) */
const competenciaDoPedido = (p: PedidoCompra) => p.aprovadoEm || p.dataCompra || p.criadoEm;

/** Departamento de um texto de área antigo, pelo mapa das premissas (decisão 7) */
const depDoTexto = (mapa: Record<string, string> | undefined, texto?: string) => (texto && mapa ? mapa[texto.trim().toLowerCase()] : undefined);

/** Área do orçamento: departamento (decisão 7); sem ele, o mapa; sem mapa, o texto antigo */
export const areaDoOrcamento = (o: Pick<Orcamento, 'area' | 'departamentoId'>, departamentos: { id: string; nome: string }[], mapa?: Record<string, string>) => {
  const dep = o.departamentoId || depDoTexto(mapa, o.area);
  return (dep && departamentos.find((d) => d.id === dep)?.nome) || o.area.trim();
};

/** Linha de custo recorrente; `departamentoId` vem do resumo do banco (Compras) */
type RecorrenteGestao = LinhaDespesa & { departamentoId?: string };

/** Decisão 6: por competência (padrão) ou por caixa (data do pagamento) */
export type Regime = 'competencia' | 'caixa';

export function useGestao(ano: number, regime: Regime = 'competencia', agora: Date = new Date()) {
  const { faturas, contratos: contratosApp, licenses: licensesApp, assets, departments, employees, settings, currentRole } = useApp();
  const { linhas } = useRecursos();
  const { orcamentos, pedidos } = useCompras();
  const premissas: Premissas = useMemo(() => settings.premissasFinanceiras || {}, [settings.premissasFinanceiras]);
  const limite = premissas.limiteCapitalizacao ?? LIMITE_CAPITALIZACAO_PADRAO;
  const mapa = settings.premissasFinanceiras?.mapaAreas;
  const vida = settings.vidaUtil;
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth();

  // Compras não lê contratos, licenças nem linhas (RLS): o resumo sem dados de pagamento vem de uma função do banco
  const ehCompras = currentRole === 'compras';
  const [resumo, setResumo] = useState<RecorrenteResumo[] | null>(null);
  useEffect(() => {
    if (!ehCompras) return;
    let vivo = true;
    recorrenteResumo().then((r) => {
      if (vivo) setResumo(r);
    });
    return () => {
      vivo = false;
    };
  }, [ehCompras]);
  const doResumo = ehCompras ? resumo : null;
  const contratos = contratosApp;
  const licenses = licensesApp;

  const recorrentes: RecorrenteGestao[] = useMemo(
    () =>
      doResumo
        ? doResumo
            .filter((r) => r.recorrente)
            .map((r) => ({
              origem: r.origem,
              id: r.id,
              nome: r.nome,
              fornecedorId: r.fornecedorId,
              categoria: ((r.categoriaDespesa || (r.tipo && CATEGORIA_DO_TIPO[r.tipo as keyof typeof CATEGORIA_DO_TIPO])) || (r.origem === 'licenca' ? 'software' : r.origem === 'linha' ? 'telefonia' : 'outros')) as CategoriaDespesa,
              centroCusto: r.centroCusto,
              departamentoId: r.departamentoId,
              mensal: r.mensal,
            }))
        : despesasRecorrentes({ licencas: licenses, contratos, linhas }),
    [doResumo, licenses, contratos, linhas]
  );

  // Recorrente com vigência, renovação e reajuste (alimenta a projeção)
  const recorrentesProj: ItemRecorrente[] = useMemo(
    () =>
      doResumo
        ? recorrentes.map((r) => {
            const x = doResumo.find((d) => d.origem === r.origem && d.id === r.id);
            return { ...r, fim: x?.fim, renova: x?.renova !== false, reajusteMes: x?.reajusteMes || undefined };
          })
        : recorrentesParaProjecao(recorrentes, {
            licencas: licenses.map((l) => ({ id: l.id, dataRenovacao: l.dataRenovacao, renovacaoAutomatica: l.pagamento?.renovacaoAutomatica })),
            contratos: contratos.map((c) => ({ id: c.id, fim: c.fim, reajusteMes: c.reajusteMes, renovacaoAutomatica: c.pagamento?.renovacaoAutomatica })),
          }),
    [doResumo, recorrentes, licenses, contratos]
  );

  const pedidosEmAberto = useMemo(() => pedidos.filter((p) => comprometidoNoOrcamento(p, faturas)), [pedidos, faturas]);

  // Projeção sempre de 36 meses; as telas recortam 12, 24 ou 36
  const projecao = useMemo(
    () =>
      projecaoGastos(
        {
          recorrentes: recorrentesProj,
          ativos: assets,
          pedidosAprovados: pedidosEmAberto.map((p) => ({ id: p.id, codigo: p.codigo, titulo: p.titulo, valor: valorDoPedido(p), previstoPara: p.necessarioEm, categoria: p.categoria })),
        },
        36,
        premissas,
        vida,
        agora
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recorrentesProj, assets, pedidosEmAberto, premissas, vida]
  );

  // Origens para classificar faturas (categoria e área): as do cadastro; para Compras, as do resumo
  const origensLivro = useMemo(() => {
    const dep = (texto?: string, id?: string) => id || depDoTexto(mapa, texto);
    if (doResumo) {
      const de = (o: 'contrato' | 'licenca') =>
        doResumo.filter((r) => r.origem === o).map((r) => ({ id: r.id, tipo: r.tipo, categoriaDespesa: r.categoriaDespesa as CategoriaDespesa | undefined, centroCusto: r.centroCusto, departamentoId: dep(r.centroCusto, r.departamentoId) }));
      return { contratos: de('contrato'), licencas: de('licenca') };
    }
    return {
      contratos: contratos.map((c) => ({ ...c, departamentoId: depDoTexto(mapa, c.centroCusto) })),
      licencas: licenses.map((l) => ({ ...l, departamentoId: depDoTexto(mapa, l.centroCusto) })),
    };
  }, [doResumo, contratos, licenses, mapa]);

  const lancamentos = useMemo(
    () =>
      lancamentosDoLivro(
        {
          // Caixa: a fatura paga conta no mês em que saiu o dinheiro
          faturas: regime === 'caixa' ? faturas.map((f) => (f.status === 'paga' && f.pagoEm ? { ...f, competencia: `${f.pagoEm.slice(0, 7)}-01` } : f)) : faturas,
          contratos: origensLivro.contratos,
          licencas: origensLivro.licencas,
          pedidos: pedidos.map((p) => ({ id: p.id, status: p.status, categoria: p.categoria, area: p.area, departamentoId: depDoTexto(mapa, p.area), valor: valorDoPedido(p), competencia: competenciaDoPedido(p) })),
          ativos: assets,
          departamentos: departments,
          categoriaDoTipo: (t) => CATEGORIA_DO_TIPO[t as keyof typeof CATEGORIA_DO_TIPO] || 'outros',
        },
        ano,
        limite
      ),
    [faturas, origensLivro, pedidos, assets, departments, ano, limite, regime, mapa]
  );

  // "Projeção até dezembro" = usado + recorrente que falta (utils/gestaoFinanceira › recorrenteRestante):
  // sai da própria projeção mês a mês, com fim de contrato, renovação e reajuste; o mês corrente
  // entra se ainda não foi faturado; ano futuro usa os meses dele que a projeção cobre.
  const restanteDoAno = useMemo(() => {
    const nome = (r: RecorrenteGestao) => {
      const dep = r.departamentoId || depDoTexto(mapa, r.centroCusto);
      return (dep && departments.find((d) => d.id === dep)?.nome) || (r.centroCusto || '').trim();
    };
    const porChave = new Map(recorrentes.map((r) => [`${r.origem}|${r.id}`, r]));
    const out: { natureza: Natureza; categoria: CategoriaDespesa; area: string; valor: number }[] = [];
    recorrenteRestante({ projecao, recorrentes: recorrentesProj, faturas }, ano, new Date(anoAtual, mesAtual, 15)).forEach(({ recorrente, valor }) => {
      const r = porChave.get(`${recorrente.origem}|${recorrente.id}`);
      if (r) out.push({ natureza: 'opex', categoria: r.categoria, area: nome(r), valor });
    });
    return out;
  }, [recorrentes, recorrentesProj, projecao, faturas, ano, anoAtual, mesAtual, mapa, departments]);

  const orcamentoDoAno = useMemo(() => orcamentos.filter((o) => o.ano === ano), [orcamentos, ano]);

  const linhasGestao = useMemo(
    () =>
      orcamentoDeGestao(
        orcamentoDoAno.map((o) => ({ natureza: o.natureza, categoria: o.categoria, area: areaDoOrcamento(o, departments, mapa), valorAnual: o.valorAnual })),
        lancamentos,
        restanteDoAno
      ),
    [orcamentoDoAno, lancamentos, restanteDoAno, departments, mapa]
  );

  // Seção 29: usuário externo (só acessa o sistema) não conta como colaborador
  const colaboradoresAtivos = useMemo(() => employees.filter((e) => e.status !== 'desligado' && e.tipoVinculo !== 'externo').length, [employees]);

  return { premissas, limite, vida, recorrentes, projecao, lancamentos, linhasGestao, orcamentoDoAno, colaboradoresAtivos, pedidosEmAberto };
}

/**
 * Seção 27: orçamento do ano corrente por categoria × área, na MESMA conta do Acompanhamento
 * (pago + a pagar + comprometido). Alimenta os alertas de 90%/100% e o impacto do pedido.
 * `realizado` = pago + a pagar (o impacto soma os comprometidos à parte, sem o próprio pedido).
 */
export function useOrcamentoAtual(agora: Date = new Date()) {
  const ano = agora.getFullYear();
  const { equipeCompras } = useCompras();
  const g = useGestao(ano, 'competencia', agora);
  return useMemo(() => {
    if (!equipeCompras) return { ano, linhas: [] as LinhaOrcamento[], alertas: [] as AlertaOrcamento[] };
    const chave = (l: { categoria: string; area: string }) => `${l.categoria}|${l.area.trim().toLowerCase()}`;
    const m = new Map<string, LinhaOrcamento & { comprometido: number }>();
    g.linhasGestao.forEach((l) => {
      const k = chave(l);
      const x = m.get(k) || { chave: k, categoria: l.categoria, area: l.area, previstoMeses: [], realizadoMeses: [], previsto: 0, realizado: 0, comprometido: 0 };
      x.previsto += l.previsto;
      x.realizado += l.realizado + l.aPagar;
      x.comprometido += l.comprometido;
      m.set(k, x);
    });
    const linhas: LinhaOrcamento[] = [...m.values()].map(({ comprometido, ...x }) => ({ ...x, pct: x.previsto > 0 ? (x.realizado + comprometido) / x.previsto : undefined }));
    const usados = [...m.values()].map(({ comprometido, ...x }) => ({ ...x, realizado: x.realizado + comprometido, pct: x.previsto > 0 ? (x.realizado + comprometido) / x.previsto : undefined }));
    return { ano, linhas, alertas: alertasOrcamento(usados, ano) };
  }, [equipeCompras, g.linhasGestao, ano]);
}
