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
import { comprometidoNoOrcamento, valorDoPedido } from '../../utils/compras.ts';
import {
  type ItemRecorrente,
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
          pedidosAprovados: pedidosEmAberto.map((p) => ({ codigo: p.codigo, titulo: p.titulo, valor: valorDoPedido(p), previstoPara: p.necessarioEm, categoria: p.categoria })),
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

  // "Projeção até dezembro" (só no ano corrente): sai da própria projeção mês a mês, com fim de
  // contrato, renovação e reajuste. O mês corrente entra se ainda não foi faturado; competência
  // que já tem fatura lançada (a pagar ou paga) não conta de novo, pois já está nos lançamentos.
  const restanteDoAno = useMemo(() => {
    if (ano !== anoAtual) return [];
    const mesCorrente = `${ano}-${String(mesAtual + 1).padStart(2, '0')}`;
    const nome = (r: RecorrenteGestao) => {
      const dep = r.departamentoId || depDoTexto(mapa, r.centroCusto);
      return (dep && departments.find((d) => d.id === dep)?.nome) || (r.centroCusto || '').trim();
    };
    const faturado = (r: RecorrenteGestao, mes: string) =>
      faturas.some(
        (f) =>
          f.status !== 'cancelada' &&
          f.competencia.startsWith(mes) &&
          (r.origem === 'contrato' ? f.contratoId === r.id : r.origem === 'licenca' ? f.licencaId === r.id : false)
      );
    const porChave = new Map(recorrentes.map((r) => [`${r.origem}|${r.id}`, r]));
    const out: { natureza: Natureza; categoria: CategoriaDespesa; area: string; valor: number }[] = [];
    projecao.itens.forEach((i) => {
      if (!i.origemId || i.natureza !== 'opex' || !i.mes.startsWith(`${ano}-`) || i.mes <= mesCorrente) return;
      const r = porChave.get(`${i.origem}|${i.origemId}`);
      if (!r || faturado(r, i.mes)) return;
      out.push({ natureza: 'opex', categoria: r.categoria, area: nome(r), valor: i.valor });
    });
    recorrentesProj.forEach((r) => {
      if (r.mensal <= 0 || faturado(r, mesCorrente)) return;
      if (r.fim && r.fim.slice(0, 7) < mesCorrente && !r.renova) return;
      out.push({ natureza: 'opex', categoria: r.categoria, area: nome(r), valor: r.mensal });
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

  const colaboradoresAtivos = useMemo(() => employees.filter((e) => e.status !== 'desligado').length, [employees]);

  return { premissas, limite, vida, recorrentes, projecao, lancamentos, linhasGestao, orcamentoDoAno, colaboradoresAtivos, pedidosEmAberto };
}
