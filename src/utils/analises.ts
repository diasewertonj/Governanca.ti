// =============================================================================
// Seção 23 · Análises cruzadas da Gestão de T.I. (só o admin)
// Custo por pessoa, desperdício, custo por área (licença rateada pelo uso),
// por fornecedor e equipamentos (idade e manutenção).
// Equipamento entra pelo VALOR DE COMPRA (decisão do dono: sem depreciação).
// =============================================================================
import type { Asset, CategoriaDespesa, Contrato, Employee, LinhaTelefonica, SoftwareLicense, VidaUtil } from '../types/index.ts';
import { assentosOciosos, fonteCustoLicenca } from './financeiro.ts';
import type { Lancamento } from './gestaoFinanceira.ts';
import { anosDeVida, grupoDoAtivo } from './patrimonio.ts';

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Equipamento que ainda conta (não descartado, não software) */
export const equipamentoVigente = (a: Asset) => a.status !== 'descartado' && a.categoria !== 'software';
/** Linha que ainda custa */
const linhaVigente = (l: LinhaTelefonica) => l.status !== 'cancelada';
const licencaVigente = (l: SoftwareLicense) => l.status !== 'inativa';

/** Custo mensal de um assento (a licença ou a parte dela no contrato, dividida pelos assentos) */
export function mensalPorAssento(l: SoftwareLicense, contratos: Contrato[], agora?: Date): number {
  if (!licencaVigente(l) || !l.assentosTotais) return 0;
  return fonteCustoLicenca(l, contratos, agora).mensalDaLicenca / l.assentosTotais;
}

/** Área de um equipamento: a de quem está com ele; sem ninguém, a do cadastro */
export function areaDoEquipamento(a: Asset, pessoas: Map<string, Employee>): string {
  return (a.custodianteId && pessoas.get(a.custodianteId)?.setorId) || a.setorId || '';
}

// --- 1. Custo por pessoa ------------------------------------------------------
export interface CustoPessoa {
  pessoa: Employee;
  equipamentos: Asset[];
  valorEquipamentos: number;
  licencas: { licenca: SoftwareLicense; mensal: number }[];
  mensalLicencas: number;
  linhas: LinhaTelefonica[];
  mensalLinhas: number;
  /** Licenças + linhas, por mês */
  mensalTotal: number;
}

export function custoPorPessoa(
  pessoas: Employee[],
  d: { ativos: Asset[]; licencas: SoftwareLicense[]; linhas: LinhaTelefonica[]; contratos: Contrato[]; agora?: Date }
): CustoPessoa[] {
  const porAssento = new Map(d.licencas.map((l) => [l.id, mensalPorAssento(l, d.contratos, d.agora)]));
  return pessoas.map((p) => {
    const equipamentos = d.ativos.filter((a) => equipamentoVigente(a) && a.custodianteId === p.id);
    const licencas = d.licencas
      .filter((l) => licencaVigente(l) && (l.colaboradoresIds || []).includes(p.id))
      .map((licenca) => ({ licenca, mensal: porAssento.get(licenca.id) || 0 }));
    const linhas = d.linhas.filter((l) => linhaVigente(l) && l.colaboradorId === p.id);
    const mensalLicencas = r2(licencas.reduce((s, l) => s + l.mensal, 0));
    const mensalLinhas = r2(linhas.reduce((s, l) => s + (l.valorMensal || 0), 0));
    return {
      pessoa: p,
      equipamentos,
      valorEquipamentos: r2(equipamentos.reduce((s, a) => s + (a.fiscal?.valorCompra || 0), 0)),
      licencas,
      mensalLicencas,
      linhas,
      mensalLinhas,
      mensalTotal: r2(mensalLicencas + mensalLinhas),
    };
  });
}

/** Média por cargo: "quanto custa equipar um analista" (só quem não está desligado) */
export function mediaPorCargo(linhas: CustoPessoa[]) {
  const m = new Map<string, CustoPessoa[]>();
  linhas
    .filter((l) => l.pessoa.status !== 'desligado')
    .forEach((l) => {
      const k = l.pessoa.cargo?.trim() || 'Sem cargo';
      m.set(k, [...(m.get(k) || []), l]);
    });
  return [...m.entries()]
    .map(([cargo, ls]) => ({
      cargo,
      pessoas: ls.length,
      equipamentos: r2(ls.reduce((s, l) => s + l.valorEquipamentos, 0) / ls.length),
      mensal: r2(ls.reduce((s, l) => s + l.mensalTotal, 0) / ls.length),
    }))
    .sort((a, b) => b.equipamentos + b.mensal * 12 - (a.equipamentos + a.mensal * 12));
}

// --- 2. Desperdício -----------------------------------------------------------
export function desperdicio(d: { pessoas: Employee[]; ativos: Asset[]; licencas: SoftwareLicense[]; linhas: LinhaTelefonica[]; contratos: Contrato[]; agora?: Date }) {
  const desligados = custoPorPessoa(
    d.pessoas.filter((p) => p.status === 'desligado'),
    d
  ).filter((c) => c.equipamentos.length || c.licencas.length || c.linhas.length);
  const assentosLivres = assentosOciosos(d.licencas, d.contratos);
  const linhasSemPessoa = d.linhas.filter((l) => l.status === 'ativa' && !l.colaboradorId);
  const emEstoque = d.ativos.filter((a) => a.status === 'disponivel' && a.categoria !== 'software');
  const mensal = {
    desligados: r2(desligados.reduce((s, c) => s + c.mensalTotal, 0)),
    assentosLivres: r2(assentosLivres.reduce((s, o) => s + o.custoMensal, 0)),
    linhasSemPessoa: r2(linhasSemPessoa.reduce((s, l) => s + (l.valorMensal || 0), 0)),
  };
  return {
    desligados,
    assentosLivres,
    linhasSemPessoa,
    emEstoque,
    valorEmEstoque: r2(emEstoque.reduce((s, a) => s + (a.fiscal?.valorCompra || 0), 0)),
    mensal,
    mensalTotal: r2(mensal.desligados + mensal.assentosLivres + mensal.linhasSemPessoa),
  };
}

// --- 3. Custo por área (licença rateada pelo uso) -------------------------------
export interface CustoArea {
  area: string;
  /** Pago + a pagar no ano (comprometido fica fora) */
  despesas: number;
  /** Parte das despesas que veio de licenças, pelo uso (quem tem o assento paga) */
  peloUso: number;
  pessoas: number;
  porPessoa?: number;
  /** Valor de compra dos equipamentos com a área */
  equipamentos: number;
}

/** Pessoas que usam o que a despesa paga: a licença, ou as licenças cobertas pelo contrato */
function usuariosDaDespesa(l: Lancamento, licencas: Map<string, SoftwareLicense>, contratos: Map<string, Contrato>): string[] {
  if (l.origem?.licenca) return licencas.get(l.origem.licenca)?.colaboradoresIds || [];
  const c = l.origem?.contrato ? contratos.get(l.origem.contrato) : undefined;
  if (!c) return [];
  return [...new Set((c.itens || []).flatMap((i) => (i.licencaId ? licencas.get(i.licencaId)?.colaboradoresIds || [] : [])))];
}

export function custoPorAreaPeloUso(
  lancamentos: Lancamento[],
  d: { pessoas: Employee[]; ativos: Asset[]; licencas: SoftwareLicense[]; contratos: Contrato[] }
): CustoArea[] {
  const pessoas = new Map(d.pessoas.map((p) => [p.id, p]));
  const licencas = new Map(d.licencas.map((l) => [l.id, l]));
  const contratos = new Map(d.contratos.map((c) => [c.id, c]));
  const m = new Map<string, CustoArea>();
  const linha = (area: string) => {
    if (!m.has(area)) m.set(area, { area, despesas: 0, peloUso: 0, pessoas: 0, equipamentos: 0 });
    return m.get(area) as CustoArea;
  };
  lancamentos
    .filter((l) => l.situacao !== 'comprometido')
    .forEach((l) => {
      const areas = usuariosDaDespesa(l, licencas, contratos)
        .map((id) => pessoas.get(id)?.setorId)
        .filter((a): a is string => !!a);
      if (!areas.length) {
        linha(l.area || '').despesas += l.valor;
        return;
      }
      const parte = l.valor / areas.length;
      areas.forEach((a) => {
        const x = linha(a);
        x.despesas += parte;
        x.peloUso += parte;
      });
    });
  d.pessoas.filter((p) => p.status !== 'desligado').forEach((p) => (linha(p.setorId || '').pessoas += 1));
  d.ativos.filter(equipamentoVigente).forEach((a) => (linha(areaDoEquipamento(a, pessoas)).equipamentos += a.fiscal?.valorCompra || 0));
  return [...m.values()]
    .map((x) => ({
      ...x,
      despesas: r2(x.despesas),
      peloUso: r2(x.peloUso),
      equipamentos: r2(x.equipamentos),
      porPessoa: x.pessoas ? r2(x.despesas / x.pessoas) : undefined,
    }))
    .filter((x) => x.despesas || x.pessoas || x.equipamentos)
    .sort((a, b) => b.despesas - a.despesas);
}

// --- 4. Por fornecedor ----------------------------------------------------------
export interface CustoFornecedor {
  fornecedorId: string;
  total: number;
  pago: number;
  aPagar: number;
  porCategoria: Partial<Record<CategoriaDespesa, number>>;
  contratos: number;
  licencas: number;
}

export function custoPorFornecedor(
  lancamentos: Lancamento[],
  fornecedorDaFatura: (faturaId: string) => string,
  d: { contratos: Contrato[]; licencas: SoftwareLicense[] }
): CustoFornecedor[] {
  const m = new Map<string, CustoFornecedor>();
  lancamentos
    .filter((l) => l.situacao !== 'comprometido' && l.origem?.fatura)
    .forEach((l) => {
      const id = fornecedorDaFatura(l.origem?.fatura as string);
      if (!m.has(id)) m.set(id, { fornecedorId: id, total: 0, pago: 0, aPagar: 0, porCategoria: {}, contratos: 0, licencas: 0 });
      const x = m.get(id) as CustoFornecedor;
      x.total += l.valor;
      if (l.situacao === 'realizado') x.pago += l.valor;
      else x.aPagar += l.valor;
      x.porCategoria[l.categoria] = (x.porCategoria[l.categoria] || 0) + l.valor;
    });
  return [...m.values()]
    .map((x) => ({
      ...x,
      total: r2(x.total),
      pago: r2(x.pago),
      aPagar: r2(x.aPagar),
      contratos: d.contratos.filter((c) => c.fornecedorId === x.fornecedorId && c.status !== 'encerrado').length,
      licencas: d.licencas.filter((l) => l.fornecedorId === x.fornecedorId && licencaVigente(l)).length,
    }))
    .sort((a, b) => b.total - a.total);
}

// --- 5. Equipamentos: idade e manutenção -------------------------------------------
export interface SituacaoEquipamento {
  ativo: Asset;
  idadeMeses?: number;
  vidaAnos: number;
  /** AAAA-MM-DD em que a vida útil termina */
  fimVida?: string;
  manutencoes: number;
  custoManutencao: number;
  /** Custo de manutenção ÷ valor de compra */
  pctDoValor?: number;
  alerta?: 'vida' | 'manutencao';
}

/** A partir de quanto da compra a manutenção sugere trocar */
export const LIMITE_MANUTENCAO = 0.5;

const mesesEntre = (de: string, ate: Date) => {
  const d = new Date(`${de.slice(0, 10)}T00:00:00`);
  return (ate.getFullYear() - d.getFullYear()) * 12 + (ate.getMonth() - d.getMonth()) - (ate.getDate() < d.getDate() ? 1 : 0);
};

export function situacaoEquipamentos(ativos: Asset[], vida?: VidaUtil, agora: Date = new Date()): SituacaoEquipamento[] {
  return ativos.filter(equipamentoVigente).map((a) => {
    const compra = a.fiscal?.dataAquisicao;
    const vidaAnos = anosDeVida(grupoDoAtivo(a), vida);
    let fimVida: string | undefined;
    if (compra && vidaAnos) {
      const f = new Date(`${compra.slice(0, 10)}T00:00:00`);
      f.setFullYear(f.getFullYear() + vidaAnos);
      fimVida = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
    }
    const validas = (a.historicoManutencao || []).filter((m) => m.status !== 'cancelada');
    const custoManutencao = r2(validas.filter((m) => !m.cobertoGarantia).reduce((s, m) => s + (m.custo || 0), 0));
    const valor = a.fiscal?.valorCompra || 0;
    const pctDoValor = valor > 0 ? custoManutencao / valor : undefined;
    const hoje = agora.toISOString().slice(0, 10);
    const alerta = pctDoValor !== undefined && pctDoValor >= LIMITE_MANUTENCAO ? 'manutencao' : fimVida && fimVida <= hoje ? 'vida' : undefined;
    return { ativo: a, idadeMeses: compra ? Math.max(0, mesesEntre(compra, agora)) : undefined, vidaAnos, fimVida, manutencoes: validas.length, custoManutencao, pctDoValor, alerta };
  });
}

/** Modelos que mais vão para a manutenção */
export function manutencaoPorModelo(linhas: SituacaoEquipamento[]) {
  const m = new Map<string, { modelo: string; unidades: number; manutencoes: number; custo: number }>();
  linhas.forEach((l) => {
    const modelo = [l.ativo.marca, l.ativo.modelo].filter(Boolean).join(' ').trim() || l.ativo.nome;
    const x = m.get(modelo) || { modelo, unidades: 0, manutencoes: 0, custo: 0 };
    x.unidades += 1;
    x.manutencoes += l.manutencoes;
    x.custo = r2(x.custo + l.custoManutencao);
    m.set(modelo, x);
  });
  return [...m.values()].filter((x) => x.manutencoes > 0).sort((a, b) => b.manutencoes / b.unidades - a.manutencoes / a.unidades || b.custo - a.custo);
}
