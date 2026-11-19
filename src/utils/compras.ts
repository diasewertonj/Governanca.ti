// =============================================================================
// Fase 11 · Orçamento (previsto × realizado) e pedidos de compra.
// Realizado = faturas pagas (valor efetivo) + compras de equipamento pela data de
// aquisição (as que vieram de um pedido já contam pela fatura do pedido).
// =============================================================================
import type {
  Asset,
  CategoriaDespesa,
  Contrato,
  Department,
  Fatura,
  Orcamento,
  PedidoCompra,
  SoftwareLicense,
  StatusPedido,
  TipoItemPedido,
  FormaAprovacao,
} from '../types/index.ts';
import { CATEGORIA_DO_TIPO, ROTULO_CATEGORIA, brl, valorEfetivo } from './financeiro.ts';

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const centavos = (v: number) => Math.round(v * 100) / 100;
const chaveArea = (a?: string) => (a || '').trim().toLowerCase();

/** 12 parcelas iguais; a diferença de centavos vai para dezembro */
export function distribuirMensal(anual: number): number[] {
  const parcela = Math.floor((anual / 12) * 100) / 100;
  const meses = Array(12).fill(parcela) as number[];
  meses[11] = centavos(anual - parcela * 11);
  return meses;
}

export const somaMeses = (meses: number[]) => centavos(meses.reduce((s, v) => s + (Number(v) || 0), 0));

/** "Copiar do ano anterior" com reajuste (%): mantém a proporção de cada mês */
export function copiarOrcamentos(origem: Orcamento[], anoOrigem: number, anoDestino: number, reajustePct: number): Omit<Orcamento, 'id'>[] {
  const fator = 1 + (Number(reajustePct) || 0) / 100;
  return origem
    .filter((o) => o.ano === anoOrigem)
    .map((o) => {
      const meses = (o.meses.length === 12 ? o.meses : distribuirMensal(o.valorAnual)).map((v) => centavos(v * fator));
      return { ano: anoDestino, categoria: o.categoria, area: o.area, meses, valorAnual: somaMeses(meses), observacoes: o.observacoes };
    });
}

export interface LancamentoRealizado {
  categoria: CategoriaDespesa;
  area: string;
  mes: number; // 0-11
  valor: number;
  origem: 'fatura' | 'equipamento';
}

/** Tudo o que conta como gasto no ano, com categoria e área */
export function lancamentosRealizados(
  dados: { faturas: Fatura[]; contratos: Contrato[]; licencas: SoftwareLicense[]; pedidos: PedidoCompra[]; ativos: Asset[]; departamentos: Department[] },
  ano: number
): LancamentoRealizado[] {
  const out: LancamentoRealizado[] = [];
  const prefixo = `${ano}-`;
  dados.faturas
    .filter((f) => f.status === 'paga' && f.competencia.startsWith(prefixo))
    .forEach((f) => {
      const mes = Number(f.competencia.slice(5, 7)) - 1;
      let categoria: CategoriaDespesa = 'outros';
      let area = '';
      if (f.contratoId) {
        const c = dados.contratos.find((x) => x.id === f.contratoId);
        if (c) {
          categoria = c.categoriaDespesa || CATEGORIA_DO_TIPO[c.tipo];
          area = c.centroCusto || '';
        }
      } else if (f.licencaId) {
        const l = dados.licencas.find((x) => x.id === f.licencaId);
        categoria = l?.categoriaDespesa || 'software';
        area = l?.centroCusto || '';
      } else if (f.pedidoId) {
        const p = dados.pedidos.find((x) => x.id === f.pedidoId);
        categoria = p?.categoria || 'hardware';
        area = p?.area || '';
      }
      out.push({ categoria, area, mes, valor: valorEfetivo(f), origem: 'fatura' });
    });
  dados.ativos
    .filter((a) => !a.pedidoId && (Number(a.fiscal?.valorCompra) || 0) > 0 && (a.fiscal?.dataAquisicao || '').startsWith(prefixo))
    .forEach((a) =>
      out.push({
        categoria: 'hardware',
        area: dados.departamentos.find((d) => d.id === a.setorId)?.nome || '',
        mes: Number(a.fiscal.dataAquisicao.slice(5, 7)) - 1,
        valor: Number(a.fiscal.valorCompra) || 0,
        origem: 'equipamento',
      })
    );
  return out;
}

export interface LinhaOrcamento {
  chave: string;
  orcamentoId?: string;
  categoria: CategoriaDespesa;
  area: string;
  previstoMeses: number[];
  realizadoMeses: number[];
  previsto: number;
  realizado: number;
  /** realizado ÷ previsto (sem previsto: undefined) */
  pct?: number;
  /** Projeção para dezembro no ritmo atual (só no ano corrente) */
  tendencia?: number;
}

/** Previsto × realizado por categoria e área (linhas sem orçamento também aparecem) */
export function resumoOrcamento(orcamentos: Orcamento[], lancamentos: LancamentoRealizado[], ano: number, agora: Date = new Date()): LinhaOrcamento[] {
  const linhas = new Map<string, LinhaOrcamento>();
  const pegar = (categoria: CategoriaDespesa, area: string) => {
    const chave = `${categoria}|${chaveArea(area)}`;
    let l = linhas.get(chave);
    if (!l) {
      l = { chave, categoria, area: area.trim(), previstoMeses: Array(12).fill(0), realizadoMeses: Array(12).fill(0), previsto: 0, realizado: 0 };
      linhas.set(chave, l);
    }
    return l;
  };
  orcamentos
    .filter((o) => o.ano === ano)
    .forEach((o) => {
      const l = pegar(o.categoria, o.area);
      l.orcamentoId = o.id;
      l.previstoMeses = o.meses.length === 12 ? [...o.meses] : distribuirMensal(o.valorAnual);
    });
  lancamentos.forEach((x) => {
    const l = pegar(x.categoria, x.area);
    l.realizadoMeses[x.mes] = centavos(l.realizadoMeses[x.mes] + x.valor);
  });
  const anoCorrente = agora.getFullYear() === ano;
  const mesesPassados = agora.getMonth() + 1;
  return [...linhas.values()]
    .map((l) => {
      const previsto = somaMeses(l.previstoMeses);
      const realizado = somaMeses(l.realizadoMeses);
      return {
        ...l,
        previsto,
        realizado,
        pct: previsto > 0 ? realizado / previsto : undefined,
        tendencia: anoCorrente ? centavos((realizado / mesesPassados) * 12) : undefined,
      };
    })
    .sort((a, b) => ROTULO_CATEGORIA[a.categoria].localeCompare(ROTULO_CATEGORIA[b.categoria]) || a.area.localeCompare(b.area));
}

export interface AlertaOrcamento {
  id: string;
  nivel: 'perto' | 'estourado';
  titulo: string;
  detalhe: string;
}

/** Categoria/área acima de 90% (perto) ou de 100% (estourado) do previsto no ano */
export function alertasOrcamento(linhas: LinhaOrcamento[], ano: number): AlertaOrcamento[] {
  return linhas
    .filter((l) => l.pct !== undefined && l.pct >= 0.9)
    .map((l) => ({
      id: `orc-${ano}-${l.chave}`,
      nivel: (l.pct! >= 1 ? 'estourado' : 'perto') as AlertaOrcamento['nivel'],
      titulo: `${ROTULO_CATEGORIA[l.categoria]}${l.area ? ` · ${l.area}` : ''}`,
      detalhe: `${Math.round(l.pct! * 100)}% do orçamento de ${ano} (${brl(l.realizado)} de ${brl(l.previsto)})`,
    }));
}

// -----------------------------------------------------------------------------
// Pedidos de compra
// -----------------------------------------------------------------------------
export const ROTULO_STATUS_PEDIDO: Record<StatusPedido, string> = {
  rascunho: 'Rascunho',
  em_cotacao: 'Em cotação (T.I.)',
  aguardando: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  comprado: 'Comprado',
  recebido: 'Recebido',
  cancelado: 'Cancelado',
};

export const SELO_STATUS_PEDIDO: Record<StatusPedido, string> = {
  rascunho: 'selo-neutro',
  em_cotacao: 'selo-info',
  aguardando: 'selo-atencao',
  aprovado: 'selo-info',
  recusado: 'selo-problema',
  comprado: 'selo-info',
  recebido: 'selo-ok',
  cancelado: 'selo-neutro',
};

export const ROTULO_TIPO_ITEM: Record<TipoItemPedido, string> = {
  equipamento: 'Equipamento',
  acessorio: 'Acessório do estoque',
  licenca: 'Assentos de licença',
  servico: 'Serviço',
};

/** Ordem do fluxo (para a linha do tempo); pedido "Outros" não passa pela cotação da T.I. */
// Seção 15 (fluxo enxuto): cotação → aprovação registrada → compra → recebimento
export const FLUXO_PEDIDO: StatusPedido[] = ['rascunho', 'em_cotacao', 'aprovado', 'comprado', 'recebido'];
export const fluxoDoPedido = (_p?: Pick<PedidoCompra, 'tipoPedido'>) => FLUXO_PEDIDO;

export const ROTULO_FORMA_APROVACAO: Record<FormaAprovacao, string> = {
  pessoalmente: 'pessoalmente',
  email: 'por e-mail',
  mensagem: 'por mensagem',
  sistema: 'pelo sistema',
  outro: 'outra forma',
};

/** De quem é a vez (seção 13): T.I. cota, gestor aprova, Compras aprova e compra, T.I. recebe */
export type VezPedido = 'solicitante' | 'ti_cotacao' | 'compras_cotacao' | 'gestor' | 'compras_aprovacao' | 'compras_compra' | 'recebimento' | null;
export function vezDoPedido(p: Pick<PedidoCompra, 'status' | 'gestorId' | 'aprovadoGestorEm' | 'tipoPedido'>): VezPedido {
  switch (p.status) {
    case 'rascunho':
    case 'recusado':
      return 'solicitante';
    // Em cotação (ou aguardando, do fluxo antigo): quem cota registra a aprovação
    case 'em_cotacao':
    case 'aguardando':
      return p.tipoPedido === 'outros' ? 'compras_cotacao' : 'ti_cotacao';
    case 'aprovado':
      return 'compras_compra';
    case 'comprado':
      return 'recebimento';
    default:
      return null;
  }
}

/** O pedido espera uma ação desta pessoa? (contador do menu e Precisa de atenção) */
export function esperaPorMim(p: PedidoCompra, papel: string, eu?: string): boolean {
  const ti = papel === 'ti_admin' || papel === 'ti_suporte';
  const vez = vezDoPedido(p);
  switch (vez) {
    case 'solicitante':
      return p.status === 'recusado' && !!eu && p.solicitanteId === eu;
    case 'ti_cotacao':
      return ti;
    case 'compras_cotacao':
      return papel === 'compras' || papel === 'ti_admin';
    case 'gestor':
      return !!eu && p.gestorId === eu;
    case 'compras_aprovacao':
    case 'compras_compra':
      return papel === 'compras' || papel === 'ti_admin';
    case 'recebimento':
      return ti || (papel === 'compras' && p.tipoPedido === 'outros');
    default:
      return false;
  }
}

/** Valor do pedido: o final (comprado), a cotação vencedora ou a soma estimada dos itens */
export function valorDoPedido(p: Pick<PedidoCompra, 'valorFinal' | 'cotacoes' | 'itens'>): number {
  if (p.valorFinal != null) return p.valorFinal;
  // Cotação antiga (do pedido inteiro): valor total
  const geral = p.cotacoes.find((c) => c.vencedora && !c.itemId);
  if (geral) return geral.valor;
  // Seção 14: por item, a opção escolhida (valor unitário) ou o estimado do item
  return centavos(p.itens.reduce((s, i) => s + i.quantidade * (opcaoEscolhida(p, i.id)?.valor || i.valorUnitario || 0), 0));
}

/** Opções de um item (seção 14) e a escolhida */
export const opcoesDoItem = (p: Pick<PedidoCompra, 'cotacoes'>, itemId: string) => p.cotacoes.filter((c) => c.itemId === itemId);
export const opcaoEscolhida = (p: Pick<PedidoCompra, 'cotacoes'>, itemId: string) => p.cotacoes.find((c) => c.itemId === itemId && c.vencedora);

/** Itens com opções e sem a escolhida (aprovar exige escolher) */
export function itensSemEscolha(p: Pick<PedidoCompra, 'cotacoes' | 'itens'>): string[] {
  return p.itens.filter((i) => opcoesDoItem(p, i.id).length > 0 && !opcaoEscolhida(p, i.id)).map((i) => i.descricao);
}

/** Pedido que ainda vai virar gasto (aprovado ou comprado e não pago) */
export function comprometidoNoOrcamento(p: PedidoCompra, faturas: Fatura[]): boolean {
  if (p.status === 'aprovado') return true;
  if (p.status !== 'comprado' && p.status !== 'recebido') return false;
  const f = faturas.find((x) => x.pedidoId === p.id && x.status !== 'cancelada');
  return !f || f.status !== 'paga';
}

export interface ImpactoOrcamento {
  ano: number;
  previsto: number;
  realizado: number;
  comprometido: number;
  pedido: number;
  saldoDepois: number;
  pctDepois?: number;
  semOrcamento: boolean;
}

/** O que aprovar este pedido faz com o orçamento da categoria/área no ano */
export function impactoNoOrcamento(
  p: PedidoCompra,
  linhas: LinhaOrcamento[],
  pedidos: PedidoCompra[],
  faturas: Fatura[],
  ano: number
): ImpactoOrcamento {
  const linha = linhas.find((l) => l.categoria === p.categoria && chaveArea(l.area) === chaveArea(p.area));
  const previsto = linha?.previsto || 0;
  const realizado = linha?.realizado || 0;
  const comprometido = centavos(
    pedidos
      .filter((x) => x.id !== p.id && x.categoria === p.categoria && chaveArea(x.area) === chaveArea(p.area))
      .filter((x) => comprometidoNoOrcamento(x, faturas))
      .reduce((s, x) => s + valorDoPedido(x), 0)
  );
  const pedido = valorDoPedido(p);
  const saldoDepois = centavos(previsto - realizado - comprometido - pedido);
  return {
    ano,
    previsto,
    realizado,
    comprometido,
    pedido,
    saldoDepois,
    pctDepois: previsto > 0 ? (realizado + comprometido + pedido) / previsto : undefined,
    semOrcamento: !linha || previsto === 0,
  };
}

/** O que falta para cada situação andar (texto curto para a lista e o Precisa de atenção) */
export function proximoPasso(p: Pick<PedidoCompra, 'status' | 'gestorId' | 'aprovadoGestorEm' | 'tipoPedido' | 'gestorNome'>): string {
  switch (vezDoPedido(p)) {
    case 'solicitante':
      return p.status === 'recusado' ? 'ajustar e reenviar, ou cancelar' : 'enviar o pedido';
    case 'ti_cotacao':
      return 'a T.I. cota e registra a aprovação';
    case 'compras_cotacao':
      return 'Compras cota e registra a aprovação';
    case 'gestor':
      return `aprovação do gestor${p.gestorNome ? ` (${p.gestorNome})` : ''}`;
    case 'compras_aprovacao':
      return 'aprovação de Compras';
    case 'compras_compra':
      return 'Compras registrar a compra';
    case 'recebimento':
      return p.tipoPedido === 'outros' ? 'registrar o recebimento' : 'a T.I. registrar o recebimento';
    default:
      return '';
  }
}
