/**
 * Seção 17 · Gestão financeira de T.I. — regras únicas usadas por todas as telas:
 * natureza CAPEX/OPEX e imobilizado por ano (saldo inicial, aquisições, baixas,
 * depreciação do ano, saldo final). Projeção 12–36 meses entra neste mesmo módulo.
 */
import type { Asset, CategoriaDespesa, GrupoDepreciacao, VidaUtil } from '../types/index.ts';
import { depreciacao, grupoDoAtivo } from './patrimonio.ts';

export type Natureza = 'capex' | 'opex';

/** Decisão 4: limite padrão de capitalização (editável nas premissas) */
export const LIMITE_CAPITALIZACAO_PADRAO = 1200;

const c = (v: number) => Math.round(v * 100) / 100;

type AtivoNatureza = Pick<Asset, 'fiscal'> & Partial<Pick<Asset, 'categoria' | 'nome' | 'modelo' | 'grupoDepreciacao'>> & {
  natureza?: Natureza | null;
  naturezaManual?: boolean;
};

/** Equipamento: ajuste manual vence; senão CAPEX se deprecia e vale ≥ limite */
export function naturezaDoAtivo(a: AtivoNatureza, limite = LIMITE_CAPITALIZACAO_PADRAO): Natureza {
  if (a.naturezaManual && a.natureza) return a.natureza;
  const valor = Number(a.fiscal?.valorCompra) || 0;
  return grupoDoAtivo(a) !== 'nao_deprecia' && valor >= limite ? 'capex' : 'opex';
}

/**
 * Lançamento (fatura ou item de pedido): ajuste manual vence; hardware com valor
 * unitário ≥ limite e licença perpétua ≥ limite são CAPEX; o resto é OPEX.
 */
export function naturezaDoLancamento(
  l: { categoria: CategoriaDespesa; valorUnitario: number; perpetua?: boolean; natureza?: Natureza | null; naturezaManual?: boolean },
  limite = LIMITE_CAPITALIZACAO_PADRAO
): Natureza {
  if (l.naturezaManual && l.natureza) return l.natureza;
  if (l.valorUnitario < limite) return 'opex';
  if (l.categoria === 'hardware') return 'capex';
  if (l.perpetua && (l.categoria === 'software' || l.categoria === 'ia')) return 'capex';
  return 'opex';
}

// -----------------------------------------------------------------------------
// Imobilizado por ano
// -----------------------------------------------------------------------------
type AtivoImobilizado = Pick<Asset, 'id' | 'tag' | 'nome' | 'fiscal' | 'status'> &
  Partial<Pick<Asset, 'categoria' | 'modelo' | 'grupoDepreciacao' | 'setorId' | 'baixas'>>;

export interface LinhaImobilizado {
  ativoId: string;
  tag: string;
  nome: string;
  grupo: GrupoDepreciacao;
  setorId?: string;
  dataAquisicao?: string;
  custo: number;
  /** Situação em 1º/jan */
  noInicio: boolean;
  custoInicial: number;
  depAcumInicial: number;
  aquisicao: number;
  depreciacaoAno: number;
  baixa?: { data: string; custo: number; depAcum: number; valorVenda: number; resultado: number };
  /** Situação em 31/dez */
  custoFinal: number;
  depAcumFinal: number;
}

export interface TotaisImobilizado {
  custoInicial: number;
  depAcumInicial: number;
  liquidoInicial: number;
  aquisicoes: number;
  baixasCusto: number;
  baixasDepAcum: number;
  vendas: number;
  resultadoBaixas: number;
  depreciacaoAno: number;
  custoFinal: number;
  depAcumFinal: number;
  liquidoFinal: number;
}

/** Baixa vigente (não estornada) do ativo, se houver */
function baixaVigente(a: AtivoImobilizado) {
  return (a.baixas || []).find((b) => !(b as { estornadaEm?: string }).estornadaEm);
}

/**
 * Movimento do imobilizado no ano: só entram equipamentos CAPEX com valor e data de
 * compra. Depreciação linear do cadastro (mesma da ficha do ativo).
 */
export function imobilizadoDoAno(ativos: AtivoImobilizado[], ano: number, vida?: VidaUtil, limite = LIMITE_CAPITALIZACAO_PADRAO): LinhaImobilizado[] {
  const inicio = `${ano}-01-01`;
  const fimAnoAnterior = `${ano - 1}-12-31`;
  const fim = `${ano}-12-31`;
  const out: LinhaImobilizado[] = [];
  ativos.forEach((a) => {
    const aquisicao = a.fiscal?.dataAquisicao;
    const custo = Number(a.fiscal?.valorCompra) || 0;
    if (!aquisicao || !custo || aquisicao > fim) return;
    if (naturezaDoAtivo(a, limite) !== 'capex') return;
    const b = baixaVigente(a);
    const dataBaixa = b?.dataBaixa?.slice(0, 10);
    if (dataBaixa && dataBaixa < inicio) return; // saiu antes do ano
    const noInicio = aquisicao < inicio;
    const depAcumInicial = noInicio ? depreciacao(a, vida, fimAnoAnterior).acumulada : 0;
    const baixouNoAno = !!dataBaixa && dataBaixa <= fim;
    const depAteFim = depreciacao(a, vida, baixouNoAno ? dataBaixa! : fim).acumulada;
    const linha: LinhaImobilizado = {
      ativoId: a.id,
      tag: a.tag,
      nome: a.nome,
      grupo: grupoDoAtivo(a),
      setorId: a.setorId,
      dataAquisicao: aquisicao,
      custo,
      noInicio,
      custoInicial: noInicio ? custo : 0,
      depAcumInicial,
      aquisicao: noInicio ? 0 : custo,
      depreciacaoAno: c(depAteFim - depAcumInicial),
      custoFinal: baixouNoAno ? 0 : custo,
      depAcumFinal: baixouNoAno ? 0 : depAteFim,
    };
    if (baixouNoAno) {
      const venda = Number(b!.valorVenda) || 0;
      linha.baixa = { data: dataBaixa!, custo, depAcum: depAteFim, valorVenda: venda, resultado: c(venda - (custo - depAteFim)) };
    }
    out.push(linha);
  });
  return out.sort((x, y) => x.grupo.localeCompare(y.grupo) || x.tag.localeCompare(y.tag));
}

export function totaisImobilizado(linhas: LinhaImobilizado[]): TotaisImobilizado {
  const s = (f: (l: LinhaImobilizado) => number) => c(linhas.reduce((t, l) => t + f(l), 0));
  const custoInicial = s((l) => l.custoInicial);
  const depAcumInicial = s((l) => l.depAcumInicial);
  const custoFinal = s((l) => l.custoFinal);
  const depAcumFinal = s((l) => l.depAcumFinal);
  return {
    custoInicial,
    depAcumInicial,
    liquidoInicial: c(custoInicial - depAcumInicial),
    aquisicoes: s((l) => l.aquisicao),
    baixasCusto: s((l) => l.baixa?.custo || 0),
    baixasDepAcum: s((l) => l.baixa?.depAcum || 0),
    vendas: s((l) => l.baixa?.valorVenda || 0),
    resultadoBaixas: s((l) => l.baixa?.resultado || 0),
    depreciacaoAno: s((l) => l.depreciacaoAno),
    custoFinal,
    depAcumFinal,
    liquidoFinal: c(custoFinal - depAcumFinal),
  };
}

// -----------------------------------------------------------------------------
// Projeção de gastos (decisão 9: 24 meses padrão; reajuste do contrato ou 5% a.a.)
// -----------------------------------------------------------------------------
export interface Premissas {
  limiteCapitalizacao?: number;
  reajustePadraoPct?: number;
  /** Custo de reposição por categoria de equipamento (sem valor: o de compra) */
  reposicao?: Record<string, number>;
}

export interface ItemRecorrente {
  origem: 'licenca' | 'contrato' | 'linha';
  id: string;
  nome: string;
  categoria: CategoriaDespesa;
  mensal: number;
  /** Fim da vigência (sem fim: indeterminado) */
  fim?: string;
  renova: boolean;
  /** Reajuste anual em % (sem índice no contrato: premissa padrão) */
  reajustePct?: number;
  /** Mês do reajuste (1–12); sem mês, no aniversário do início da projeção */
  reajusteMes?: number;
}

export interface MesProjecao {
  mes: string; // AAAA-MM
  opex: number;
  capex: number;
  total: number;
}

export interface Projecao {
  meses: MesProjecao[];
  /** Detalhe para o relatório: o que compõe cada valor */
  itens: { mes: string; natureza: Natureza; origem: string; nome: string; categoria: CategoriaDespesa | string; valor: number }[];
}

const mesIso = (base: Date, soma: number) => {
  const d = new Date(base.getFullYear(), base.getMonth() + soma, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Gasto previsto mês a mês, a partir do mês seguinte a `agora`:
 * OPEX recorrente (com fim, renovação e reajuste), CAPEX de reposição pelo fim da
 * vida útil e pedidos aprovados ainda não pagos.
 */
export function projecaoGastos(
  dados: {
    recorrentes: ItemRecorrente[];
    ativos: AtivoImobilizado[];
    pedidosAprovados: { codigo: string; titulo: string; valor: number; previstoPara?: string; categoria?: CategoriaDespesa; natureza?: Natureza }[];
  },
  meses = 24,
  premissas: Premissas = {},
  vida?: VidaUtil,
  agora: Date = new Date()
): Projecao {
  const limite = premissas.limiteCapitalizacao ?? LIMITE_CAPITALIZACAO_PADRAO;
  const padrao = premissas.reajustePadraoPct ?? 5;
  const lista = Array.from({ length: meses }, (_, i) => mesIso(agora, i + 1));
  const itens: Projecao['itens'] = [];

  dados.recorrentes.forEach((r) => {
    const pct = (r.reajustePct ?? padrao) / 100;
    let valor = r.mensal;
    lista.forEach((mes, i) => {
      if (r.fim && mes > r.fim.slice(0, 7) && !r.renova) return;
      const numMes = Number(mes.slice(5, 7));
      const reajusta = r.reajusteMes ? numMes === r.reajusteMes && i > 0 : i > 0 && i % 12 === 0;
      if (reajusta) valor = c(valor * (1 + pct));
      if (valor > 0) itens.push({ mes, natureza: 'opex', origem: r.origem, nome: r.nome, categoria: r.categoria, valor });
    });
  });

  dados.ativos.forEach((a) => {
    if (a.status === 'descartado' || baixaVigente(a)) return;
    if (naturezaDoAtivo(a, limite) !== 'capex') return;
    const d = depreciacao(a, vida, agora);
    const quando = d.zeraEm?.slice(0, 7);
    if (!quando || !lista.includes(quando)) return;
    const valor = premissas.reposicao?.[a.categoria || ''] ?? d.valorCompra;
    if (valor > 0) itens.push({ mes: quando, natureza: 'capex', origem: 'reposicao', nome: `${a.tag} · ${a.nome}`, categoria: 'hardware', valor });
  });

  dados.pedidosAprovados.forEach((p) => {
    const mes = p.previstoPara && lista.includes(p.previstoPara.slice(0, 7)) ? p.previstoPara.slice(0, 7) : lista[0];
    const categoria = p.categoria || 'hardware';
    const natureza = p.natureza || naturezaDoLancamento({ categoria, valorUnitario: p.valor }, limite);
    if (p.valor > 0) itens.push({ mes, natureza, origem: 'pedido', nome: `${p.codigo} · ${p.titulo}`, categoria, valor: p.valor });
  });

  const porMes = lista.map((mes) => {
    const doMes = itens.filter((x) => x.mes === mes);
    const opex = c(doMes.filter((x) => x.natureza === 'opex').reduce((s, x) => s + x.valor, 0));
    const capex = c(doMes.filter((x) => x.natureza === 'capex').reduce((s, x) => s + x.valor, 0));
    return { mes, opex, capex, total: c(opex + capex) };
  });
  return { meses: porMes, itens };
}

/**
 * Ponte cadastro → projeção: o mesmo custo recorrente da tela Custos recorrentes,
 * com fim de vigência, renovação e mês de reajuste de cada origem.
 */
export function recorrentesParaProjecao(
  linhas: { origem: 'licenca' | 'contrato' | 'linha'; id: string; nome: string; categoria: CategoriaDespesa; mensal: number }[],
  dados: {
    licencas: { id: string; dataRenovacao?: string; renovacaoAutomatica?: boolean }[];
    contratos: { id: string; fim?: string; reajusteMes?: number; renovacaoAutomatica?: boolean }[];
  }
): ItemRecorrente[] {
  return linhas.map((l) => {
    if (l.origem === 'contrato') {
      const ct = dados.contratos.find((x) => x.id === l.id);
      return { ...l, fim: ct?.fim, renova: !ct?.fim || !!ct?.renovacaoAutomatica, reajusteMes: ct?.reajusteMes || undefined };
    }
    if (l.origem === 'licenca') {
      const lic = dados.licencas.find((x) => x.id === l.id);
      // Licença: renova por padrão (assinatura); só para quando a renovação automática foi desligada
      return { ...l, fim: lic?.dataRenovacao, renova: lic?.renovacaoAutomatica !== false };
    }
    return { ...l, renova: true };
  });
}

// -----------------------------------------------------------------------------
// Orçamento de gestão: previsto · comprometido · a pagar · realizado · disponível
// -----------------------------------------------------------------------------
export type Situacao = 'comprometido' | 'a_pagar' | 'realizado';

/** Um lançamento do "livro" único, já classificado */
export interface Lancamento {
  situacao: Situacao;
  natureza: Natureza;
  categoria: CategoriaDespesa;
  /** Departamento (decisão 7); vazio = sem área */
  area: string;
  mes: number; // 0–11, pela competência
  valor: number;
}

export interface LinhaGestao {
  chave: string;
  natureza: Natureza;
  categoria: CategoriaDespesa;
  area: string;
  previsto: number;
  comprometido: number;
  aPagar: number;
  realizado: number;
  /** previsto − (realizado + a pagar + comprometido) */
  disponivel: number;
  /** realizado + a pagar + comprometido + recorrente que falta até dezembro */
  projecaoDezembro: number;
  pct?: number;
}

/**
 * Junta orçamento, lançamentos e o recorrente restante do ano (vindo da projeção)
 * por natureza + categoria + área. Linhas sem orçamento também aparecem.
 */
export function orcamentoDeGestao(
  orcamentos: { natureza?: Natureza | null; categoria: CategoriaDespesa; area: string; valorAnual: number }[],
  lancamentos: Lancamento[],
  restanteDoAno: { natureza: Natureza; categoria: CategoriaDespesa; area: string; valor: number }[] = []
): LinhaGestao[] {
  const m = new Map<string, LinhaGestao>();
  const pegar = (natureza: Natureza, categoria: CategoriaDespesa, area: string) => {
    const chave = `${natureza}|${categoria}|${area.trim().toLowerCase()}`;
    let l = m.get(chave);
    if (!l) {
      l = { chave, natureza, categoria, area: area.trim(), previsto: 0, comprometido: 0, aPagar: 0, realizado: 0, disponivel: 0, projecaoDezembro: 0 };
      m.set(chave, l);
    }
    return l;
  };
  orcamentos.forEach((o) => {
    const nat = o.natureza || (o.categoria === 'hardware' ? 'capex' : 'opex');
    const l = pegar(nat, o.categoria, o.area);
    l.previsto = c(l.previsto + (Number(o.valorAnual) || 0));
  });
  lancamentos.forEach((x) => {
    const l = pegar(x.natureza, x.categoria, x.area);
    if (x.situacao === 'realizado') l.realizado = c(l.realizado + x.valor);
    else if (x.situacao === 'a_pagar') l.aPagar = c(l.aPagar + x.valor);
    else l.comprometido = c(l.comprometido + x.valor);
  });
  const restante = new Map<string, number>();
  restanteDoAno.forEach((r) => {
    const l = pegar(r.natureza, r.categoria, r.area);
    restante.set(l.chave, c((restante.get(l.chave) || 0) + r.valor));
  });
  return [...m.values()]
    .map((l) => {
      const usado = c(l.realizado + l.aPagar + l.comprometido);
      return {
        ...l,
        disponivel: c(l.previsto - usado),
        projecaoDezembro: c(usado + (restante.get(l.chave) || 0)),
        pct: l.previsto > 0 ? usado / l.previsto : undefined,
      };
    })
    .sort((a, b) => a.natureza.localeCompare(b.natureza) || a.categoria.localeCompare(b.categoria) || a.area.localeCompare(b.area));
}

type FaturaLivro = {
  id: string;
  status: 'a_pagar' | 'paga' | 'cancelada';
  competencia: string;
  valor: number;
  valorPago?: number;
  licencaId?: string;
  contratoId?: string;
  pedidoId?: string;
  ativoId?: string;
  natureza?: Natureza | null;
  naturezaManual?: boolean;
  departamentoId?: string;
  categoriaDespesa?: CategoriaDespesa | null;
};
type OrigemLivro = { id: string; categoriaDespesa?: CategoriaDespesa | null; centroCusto?: string; departamentoId?: string };

/**
 * O "livro" único do ano: faturas pagas (realizado) e a pagar, pedidos aprovados
 * ainda sem fatura (comprometido) e equipamentos comprados sem pedido nem fatura
 * (realizado CAPEX/OPEX pela regra). Área = departamento; sem ele, o texto legado.
 */
export function lancamentosDoLivro(
  dados: {
    faturas: FaturaLivro[];
    contratos: (OrigemLivro & { tipo?: string })[];
    licencas: OrigemLivro[];
    pedidos: { id: string; status: string; categoria?: CategoriaDespesa; area?: string; departamentoId?: string; valor: number; competencia?: string }[];
    ativos: (AtivoNatureza & { id: string; setorId?: string; pedidoId?: string })[];
    departamentos: { id: string; nome: string }[];
    categoriaDoTipo?: (tipo: string) => CategoriaDespesa;
  },
  ano: number,
  limite = LIMITE_CAPITALIZACAO_PADRAO
): Lancamento[] {
  const nomeDep = (id?: string) => (id ? dados.departamentos.find((d) => d.id === id)?.nome || '' : '');
  const area = (depId?: string, legado?: string) => nomeDep(depId) || (legado || '').trim();
  const prefixo = `${ano}-`;
  const out: Lancamento[] = [];
  const comFatura = new Set<string>();
  const ativosComFatura = new Set<string>();

  dados.faturas.forEach((f) => {
    if (f.pedidoId) comFatura.add(f.pedidoId);
    if (f.ativoId) ativosComFatura.add(f.ativoId);
    if (f.status === 'cancelada' || !f.competencia.startsWith(prefixo)) return;
    let categoria: CategoriaDespesa = f.categoriaDespesa || 'outros';
    let ar = nomeDep(f.departamentoId);
    if (f.contratoId) {
      const ct = dados.contratos.find((x) => x.id === f.contratoId);
      categoria = f.categoriaDespesa || ct?.categoriaDespesa || (ct?.tipo && dados.categoriaDoTipo ? dados.categoriaDoTipo(ct.tipo) : 'outros');
      ar = ar || area(ct?.departamentoId, ct?.centroCusto);
    } else if (f.licencaId) {
      const l = dados.licencas.find((x) => x.id === f.licencaId);
      categoria = f.categoriaDespesa || l?.categoriaDespesa || 'software';
      ar = ar || area(l?.departamentoId, l?.centroCusto);
    } else if (f.pedidoId) {
      const p = dados.pedidos.find((x) => x.id === f.pedidoId);
      categoria = f.categoriaDespesa || p?.categoria || 'hardware';
      ar = ar || area(p?.departamentoId, p?.area);
    }
    const valor = f.status === 'paga' && f.valorPago != null ? Number(f.valorPago) : Number(f.valor);
    out.push({
      situacao: f.status === 'paga' ? 'realizado' : 'a_pagar',
      natureza: naturezaDoLancamento({ categoria, valorUnitario: valor, natureza: f.natureza, naturezaManual: f.naturezaManual }, limite),
      categoria,
      area: ar,
      mes: Number(f.competencia.slice(5, 7)) - 1,
      valor: c(valor),
    });
  });

  const anoCorrenteMes = (iso?: string) => (iso && iso.startsWith(prefixo) ? Number(iso.slice(5, 7)) - 1 : null);
  dados.pedidos
    .filter((p) => (p.status === 'aprovado' || p.status === 'comprado' || p.status === 'recebido') && !comFatura.has(p.id))
    .forEach((p) => {
      const mes = anoCorrenteMes(p.competencia);
      if (mes === null || !(p.valor > 0)) return;
      const categoria = p.categoria || 'hardware';
      out.push({ situacao: 'comprometido', natureza: naturezaDoLancamento({ categoria, valorUnitario: p.valor }, limite), categoria, area: area(p.departamentoId, p.area), mes, valor: c(p.valor) });
    });

  dados.ativos
    .filter((a) => !a.pedidoId && !ativosComFatura.has(a.id))
    .forEach((a) => {
      const mes = anoCorrenteMes(a.fiscal?.dataAquisicao);
      const valor = Number(a.fiscal?.valorCompra) || 0;
      if (mes === null || !valor) return;
      out.push({ situacao: 'realizado', natureza: naturezaDoAtivo(a, limite), categoria: 'hardware', area: nomeDep(a.setorId), mes, valor: c(valor) });
    });
  return out;
}

// -----------------------------------------------------------------------------
// Exportações para a contabilidade (mesmo layout todo mês; CSV com ;)
// -----------------------------------------------------------------------------
type Celula = string | number | undefined;

export function csvImobilizado(linhas: LinhaImobilizado[], area: (setorId?: string) => string = () => ''): { cabecalho: string[]; linhas: Celula[][] } {
  return {
    cabecalho: ['Patrimônio', 'Equipamento', 'Grupo', 'Área', 'Aquisição', 'Custo inicial', 'Dep. acumulada inicial', 'Aquisições', 'Depreciação do ano', 'Data da baixa', 'Custo baixado', 'Dep. acumulada baixada', 'Valor de venda', 'Ganho/perda', 'Custo final', 'Dep. acumulada final', 'Líquido final'],
    linhas: linhas.map((l) => [
      l.tag,
      l.nome,
      l.grupo,
      area(l.setorId),
      l.dataAquisicao,
      l.custoInicial,
      l.depAcumInicial,
      l.aquisicao,
      l.depreciacaoAno,
      l.baixa?.data,
      l.baixa?.custo,
      l.baixa?.depAcum,
      l.baixa?.valorVenda,
      l.baixa?.resultado,
      l.custoFinal,
      l.depAcumFinal,
      c(l.custoFinal - l.depAcumFinal),
    ]),
  };
}

/** Depreciação mês a mês do ano (para o lançamento contábil mensal), por grupo */
export function depreciacaoMensal(ativos: AtivoImobilizado[], ano: number, vida?: VidaUtil, limite = LIMITE_CAPITALIZACAO_PADRAO): { grupo: GrupoDepreciacao; meses: number[] }[] {
  const fimDoMes = (m: number) => new Date(ano, m + 1, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const porGrupo = new Map<GrupoDepreciacao, number[]>();
  ativos.forEach((a) => {
    if (!a.fiscal?.dataAquisicao || !(Number(a.fiscal?.valorCompra) > 0) || naturezaDoAtivo(a, limite) !== 'capex') return;
    const baixa = baixaVigente(a)?.dataBaixa?.slice(0, 10);
    const grupo = grupoDoAtivo(a);
    const meses = porGrupo.get(grupo) || Array(12).fill(0);
    let anterior = depreciacao(a, vida, `${ano - 1}-12-31`).acumulada;
    for (let m = 0; m < 12; m++) {
      const ate = iso(fimDoMes(m));
      if (baixa && baixa < ate.slice(0, 8) + '01') break; // já baixado antes deste mês
      const atual = depreciacao(a, vida, baixa && baixa < ate ? baixa : ate).acumulada;
      meses[m] = c(meses[m] + atual - anterior);
      anterior = atual;
    }
    porGrupo.set(grupo, meses);
  });
  return [...porGrupo.entries()].map(([grupo, meses]) => ({ grupo, meses }));
}

/** Lançamentos do ano por competência com natureza, área e conta contábil */
export function csvLancamentos(lancs: Lancamento[], ano: number, contaContabil: Partial<Record<CategoriaDespesa, string>> = {}): { cabecalho: string[]; linhas: Celula[][] } {
  return {
    cabecalho: ['Competência', 'Situação', 'Natureza', 'Categoria', 'Conta contábil', 'Área', 'Valor'],
    linhas: lancs.map((l) => [`${String(l.mes + 1).padStart(2, '0')}/${ano}`, l.situacao, l.natureza.toUpperCase(), l.categoria, contaContabil[l.categoria], l.area, l.valor]),
  };
}

// -----------------------------------------------------------------------------
// Painel executivo
// -----------------------------------------------------------------------------
export interface IndicadoresExecutivos {
  opexAno: number;
  capexAno: number;
  totalAno: number;
  previstoAno: number;
  pctOrcamento?: number;
  custoPorColaborador?: number;
  projecao12m: number;
}

export function indicadoresExecutivos(lancs: Lancamento[], orcamentoAnual: number, colaboradoresAtivos: number, projecao: Projecao): IndicadoresExecutivos {
  const usados = lancs.filter((l) => l.situacao !== 'comprometido');
  const opexAno = c(usados.filter((l) => l.natureza === 'opex').reduce((s, l) => s + l.valor, 0));
  const capexAno = c(usados.filter((l) => l.natureza === 'capex').reduce((s, l) => s + l.valor, 0));
  const totalAno = c(opexAno + capexAno);
  return {
    opexAno,
    capexAno,
    totalAno,
    previstoAno: orcamentoAnual,
    pctOrcamento: orcamentoAnual > 0 ? totalAno / orcamentoAnual : undefined,
    custoPorColaborador: colaboradoresAtivos > 0 ? c(opexAno / colaboradoresAtivos) : undefined,
    projecao12m: c(projecao.meses.slice(0, 12).reduce((s, m) => s + m.total, 0)),
  };
}

/** Totais por chave (grupo, área ou local) para o relatório e a exportação */
export function imobilizadoPor(linhas: LinhaImobilizado[], chave: (l: LinhaImobilizado) => string): { chave: string; totais: TotaisImobilizado }[] {
  const m = new Map<string, LinhaImobilizado[]>();
  linhas.forEach((l) => m.set(chave(l), [...(m.get(chave(l)) || []), l]));
  return [...m.entries()].map(([k, ls]) => ({ chave: k, totais: totaisImobilizado(ls) }));
}
