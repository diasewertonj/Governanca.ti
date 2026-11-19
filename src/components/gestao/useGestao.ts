/**
 * Seção 17 · Dados da Gestão de T.I. num lugar só: premissas, recorrente de hoje,
 * livro do ano (comprometido · a pagar · realizado), orçamento de gestão e projeção.
 * Todas as telas (painel, orçamento, projeção, relatórios) leem daqui.
 */
import { useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import type { Orcamento, PedidoCompra } from '../../types/index.ts';
import { CATEGORIA_DO_TIPO, despesasRecorrentes } from '../../utils/financeiro.ts';
import { comprometidoNoOrcamento, valorDoPedido } from '../../utils/compras.ts';
import {
  LIMITE_CAPITALIZACAO_PADRAO,
  lancamentosDoLivro,
  orcamentoDeGestao,
  projecaoGastos,
  recorrentesParaProjecao,
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

/** Decisão 6: por competência (padrão) ou por caixa (data do pagamento) */
export type Regime = 'competencia' | 'caixa';

export function useGestao(ano: number, regime: Regime = 'competencia', agora: Date = new Date()) {
  const { faturas, contratos, licenses, assets, departments, employees, settings } = useApp();
  const { linhas } = useRecursos();
  const { orcamentos, pedidos } = useCompras();
  const premissas: Premissas = useMemo(() => settings.premissasFinanceiras || {}, [settings.premissasFinanceiras]);
  const limite = premissas.limiteCapitalizacao ?? LIMITE_CAPITALIZACAO_PADRAO;
  const mapa = settings.premissasFinanceiras?.mapaAreas;
  const vida = settings.vidaUtil;
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth();

  const recorrentes = useMemo(() => despesasRecorrentes({ licencas: licenses, contratos, linhas }), [licenses, contratos, linhas]);

  const pedidosEmAberto = useMemo(() => pedidos.filter((p) => comprometidoNoOrcamento(p, faturas)), [pedidos, faturas]);

  // Projeção sempre de 36 meses; as telas recortam 12, 24 ou 36
  const projecao = useMemo(
    () =>
      projecaoGastos(
        {
          recorrentes: recorrentesParaProjecao(recorrentes, {
            licencas: licenses.map((l) => ({ id: l.id, dataRenovacao: l.dataRenovacao, renovacaoAutomatica: l.pagamento?.renovacaoAutomatica })),
            contratos: contratos.map((c) => ({ id: c.id, fim: c.fim, reajusteMes: c.reajusteMes, renovacaoAutomatica: c.pagamento?.renovacaoAutomatica })),
          }),
          ativos: assets,
          pedidosAprovados: pedidosEmAberto.map((p) => ({ codigo: p.codigo, titulo: p.titulo, valor: valorDoPedido(p), previstoPara: p.necessarioEm, categoria: p.categoria })),
        },
        36,
        premissas,
        vida,
        agora
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recorrentes, licenses, contratos, assets, pedidosEmAberto, premissas, vida]
  );

  const lancamentos = useMemo(
    () =>
      lancamentosDoLivro(
        {
          // Caixa: a fatura paga conta no mês em que saiu o dinheiro
          faturas: regime === 'caixa' ? faturas.map((f) => (f.status === 'paga' && f.pagoEm ? { ...f, competencia: `${f.pagoEm.slice(0, 7)}-01` } : f)) : faturas,
          contratos: contratos.map((c) => ({ ...c, departamentoId: depDoTexto(mapa, c.centroCusto) })),
          licencas: licenses.map((l) => ({ ...l, departamentoId: depDoTexto(mapa, l.centroCusto) })),
          pedidos: pedidos.map((p) => ({ id: p.id, status: p.status, categoria: p.categoria, area: p.area, departamentoId: depDoTexto(mapa, p.area), valor: valorDoPedido(p), competencia: competenciaDoPedido(p) })),
          ativos: assets,
          departamentos: departments,
          categoriaDoTipo: (t) => CATEGORIA_DO_TIPO[t as keyof typeof CATEGORIA_DO_TIPO] || 'outros',
        },
        ano,
        limite
      ),
    [faturas, contratos, licenses, pedidos, assets, departments, ano, limite, regime, mapa]
  );

  // Recorrente que ainda falta até dezembro (só no ano corrente): entra na "projeção até dezembro"
  const restanteDoAno = useMemo(() => {
    if (ano !== anoAtual) return [];
    const faltam = 11 - mesAtual;
    const nome = (texto?: string) => {
      const dep = depDoTexto(mapa, texto);
      return (dep && departments.find((d) => d.id === dep)?.nome) || (texto || '').trim();
    };
    return recorrentes.map((r) => ({ natureza: 'opex' as Natureza, categoria: r.categoria, area: nome(r.centroCusto), valor: r.mensal * faltam }));
  }, [recorrentes, ano, anoAtual, mesAtual, mapa, departments]);

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

  const colaboradoresAtivos = useMemo(() => employees.filter((e) => e.status !== 'desligado').length, [employees]);

  return { premissas, limite, vida, recorrentes, projecao, lancamentos, linhasGestao, orcamentoDoAno, colaboradoresAtivos, pedidosEmAberto };
}
