/**
 * Exportar inventário: equipamentos, acessórios do estoque, softwares e linhas, com as
 * colunas escolhidas (Básico, Financeiro, Completo ou avulsas). Uma aba por tipo no Excel.
 * Fora da T.I. (admin/suporte) as colunas financeiras saem vazias.
 */
import type { Asset, Contrato, Department, Employee, ItemEstoque, LinhaTelefonica, SoftwareLicense, VidaUtil } from '../types/index.ts';
import { garantiaEfetiva } from './contratos.ts';
import { fonteCustoLicenca } from './financeiro.ts';
import { depreciacao, grupoDoAtivo, ROTULO_GRUPO_DEPRECIACAO } from './patrimonio.ts';
import { naturezaDoAtivo } from './gestaoFinanceira.ts';
import { licencaAtiva } from './licencas.ts';

export type TipoInventario = 'equipamentos' | 'acessorios' | 'softwares' | 'linhas';
export type NivelColuna = 'basico' | 'financeiro' | 'completo';

export const ROTULO_TIPO_INVENTARIO: Record<TipoInventario, string> = {
  equipamentos: 'Equipamentos',
  acessorios: 'Acessórios (estoque)',
  softwares: 'Softwares e assinaturas',
  linhas: 'Linhas e celulares',
};

export const ROTULO_STATUS_ATIVO: Record<string, string> = {
  em_uso: 'Em uso',
  disponivel: 'Em estoque',
  manutencao: 'Em manutenção',
  descartado: 'Baixado',
};
const ROTULO_CATEGORIA_ATIVO: Record<string, string> = {
  hardware: 'Computador ou servidor',
  periferico: 'Periférico',
  telefonia: 'Celular',
  software: 'Software',
};

export interface Contexto {
  pessoas: Employee[];
  areas: Department[];
  contratos: Contrato[];
  vida?: VidaUtil;
  limite: number;
  /** false = colunas financeiras vazias */
  veValores: boolean;
  agora?: Date;
}

type Valor = string | number | undefined;
export interface Coluna<T> {
  chave: string;
  rotulo: string;
  nivel: NivelColuna;
  financeira?: boolean;
  valor: (item: T, c: Contexto) => Valor;
}

const nomePessoa = (c: Contexto, id?: string) => (id ? c.pessoas.find((p) => p.id === id)?.nome || '' : '');
const nomeArea = (c: Contexto, id?: string) => (id ? c.areas.find((a) => a.id === id)?.nome || '' : '');
const dia = (d?: string) => (d ? d.slice(0, 10) : '');
const n = (v: unknown) => (Number(v) > 0 ? Number(v) : undefined);

export const COLUNAS_EQUIPAMENTO: Coluna<Asset>[] = [
  { chave: 'tag', rotulo: 'Patrimônio', nivel: 'basico', valor: (a) => a.tag },
  { chave: 'nome', rotulo: 'Nome', nivel: 'basico', valor: (a) => a.nome },
  { chave: 'categoria', rotulo: 'Categoria', nivel: 'basico', valor: (a) => ROTULO_CATEGORIA_ATIVO[a.categoria] || a.categoria },
  { chave: 'marca', rotulo: 'Marca e modelo', nivel: 'basico', valor: (a) => [a.marca, a.modelo].filter(Boolean).join(' ') },
  { chave: 'serie', rotulo: 'Número de série', nivel: 'basico', valor: (a) => a.serialNumber },
  { chave: 'status', rotulo: 'Situação', nivel: 'basico', valor: (a) => ROTULO_STATUS_ATIVO[a.status] || a.status },
  { chave: 'pessoa', rotulo: 'Com quem está', nivel: 'basico', valor: (a, c) => nomePessoa(c, a.custodianteId) },
  { chave: 'area', rotulo: 'Área', nivel: 'basico', valor: (a, c) => nomeArea(c, a.setorId) },
  { chave: 'compra', rotulo: 'Data de compra', nivel: 'financeiro', valor: (a) => dia(a.fiscal?.dataAquisicao) },
  { chave: 'valor', rotulo: 'Valor de compra (R$)', nivel: 'financeiro', financeira: true, valor: (a) => n(a.fiscal?.valorCompra) },
  { chave: 'fornecedor', rotulo: 'Fornecedor', nivel: 'financeiro', valor: (a) => a.fiscal?.fornecedor || '' },
  { chave: 'nf', rotulo: 'Nota fiscal', nivel: 'financeiro', valor: (a) => a.fiscal?.numeroNF || '' },
  { chave: 'natureza', rotulo: 'CAPEX ou OPEX', nivel: 'financeiro', financeira: true, valor: (a, c) => naturezaDoAtivo(a, c.limite).toUpperCase() },
  { chave: 'grupo', rotulo: 'Grupo de depreciação', nivel: 'financeiro', valor: (a) => ROTULO_GRUPO_DEPRECIACAO[grupoDoAtivo(a)] },
  { chave: 'depAcum', rotulo: 'Depreciação acumulada (R$)', nivel: 'financeiro', financeira: true, valor: (a, c) => depreciacao(a, c.vida, c.agora).acumulada },
  { chave: 'valorAtual', rotulo: 'Valor atual (R$)', nivel: 'financeiro', financeira: true, valor: (a, c) => depreciacao(a, c.vida, c.agora).valorAtual },
  { chave: 'garantia', rotulo: 'Garantia até', nivel: 'completo', valor: (a, c) => dia(garantiaEfetiva(a, c.contratos, c.agora).fim || a.fiscal?.dataGarantia) },
  { chave: 'local', rotulo: 'Localização', nivel: 'completo', valor: (a) => a.localizacaoFisica },
  { chave: 'so', rotulo: 'Sistema operacional', nivel: 'completo', valor: (a) => a.sistemaOperacional || '' },
  { chave: 'obs', rotulo: 'Observações', nivel: 'completo', valor: (a) => a.observacoes || '' },
];

export const COLUNAS_ACESSORIO: Coluna<ItemEstoque>[] = [
  { chave: 'nome', rotulo: 'Item', nivel: 'basico', valor: (i) => i.nome },
  { chave: 'marca', rotulo: 'Marca e modelo', nivel: 'basico', valor: (i) => [i.marca, i.modelo].filter(Boolean).join(' ') },
  { chave: 'quantidade', rotulo: 'Quantidade', nivel: 'basico', valor: (i) => i.quantidade },
  { chave: 'minimo', rotulo: 'Mínimo', nivel: 'basico', valor: (i) => i.minimo },
  { chave: 'status', rotulo: 'Situação', nivel: 'basico', valor: (i) => (i.ativo ? 'Ativo' : 'Desativado') },
  { chave: 'unitario', rotulo: 'Custo unitário (R$)', nivel: 'financeiro', financeira: true, valor: (i) => n(i.valorUnitario) },
  { chave: 'total', rotulo: 'Custo total (R$)', nivel: 'financeiro', financeira: true, valor: (i) => (n(i.valorUnitario) ? i.quantidade * Number(i.valorUnitario) : undefined) },
  { chave: 'local', rotulo: 'Localização', nivel: 'completo', valor: (i) => i.localizacao || '' },
  { chave: 'obs', rotulo: 'Observações', nivel: 'completo', valor: (i) => i.observacoes || '' },
];

export const COLUNAS_SOFTWARE: Coluna<SoftwareLicense>[] = [
  { chave: 'nome', rotulo: 'Software', nivel: 'basico', valor: (l) => l.nome },
  { chave: 'fornecedor', rotulo: 'Fornecedor', nivel: 'basico', valor: (l) => l.fornecedor || '' },
  { chave: 'status', rotulo: 'Situação', nivel: 'basico', valor: (l) => (licencaAtiva(l) ? 'Ativa' : 'Inativa') },
  { chave: 'assentos', rotulo: 'Assentos', nivel: 'basico', valor: (l) => l.assentosTotais },
  { chave: 'emUso', rotulo: 'Em uso', nivel: 'basico', valor: (l) => l.assentosAlocados },
  { chave: 'mensal', rotulo: 'Custo mensal (R$)', nivel: 'financeiro', financeira: true, valor: (l, c) => fonteCustoLicenca(l, c.contratos, c.agora).mensalDaLicenca || undefined },
  { chave: 'anual', rotulo: 'Custo anual (R$)', nivel: 'financeiro', financeira: true, valor: (l, c) => fonteCustoLicenca(l, c.contratos, c.agora).mensalDaLicenca * 12 || undefined },
  { chave: 'forma', rotulo: 'Cobrança', nivel: 'financeiro', valor: (l, c) => fonteCustoLicenca(l, c.contratos, c.agora).origem },
  { chave: 'renovacao', rotulo: 'Renovação', nivel: 'financeiro', valor: (l, c) => dia(fonteCustoLicenca(l, c.contratos, c.agora).renovacao) },
  { chave: 'contrato', rotulo: 'Contrato ou chave', nivel: 'completo', valor: (l) => l.chaveContrato || '' },
];

export const COLUNAS_LINHA: Coluna<LinhaTelefonica>[] = [
  { chave: 'numero', rotulo: 'Número', nivel: 'basico', valor: (l) => l.numero },
  { chave: 'tipo', rotulo: 'Tipo', nivel: 'basico', valor: (l) => (l.tipo === 'movel' ? 'Móvel' : 'Fixa') },
  { chave: 'status', rotulo: 'Situação', nivel: 'basico', valor: (l) => ({ ativa: 'Ativa', suspensa: 'Suspensa', cancelada: 'Cancelada' })[l.status] },
  { chave: 'pessoa', rotulo: 'Com quem está', nivel: 'basico', valor: (l, c) => nomePessoa(c, l.colaboradorId) },
  { chave: 'plano', rotulo: 'Plano', nivel: 'basico', valor: (l) => l.plano || '' },
  { chave: 'mensal', rotulo: 'Custo mensal (R$)', nivel: 'financeiro', financeira: true, valor: (l) => n(l.valorMensal) },
  { chave: 'centro', rotulo: 'Centro de custo', nivel: 'financeiro', valor: (l) => l.centroCusto || '' },
  { chave: 'chip', rotulo: 'Chip', nivel: 'completo', valor: (l) => l.chip || '' },
  { chave: 'franquia', rotulo: 'Franquia', nivel: 'completo', valor: (l) => l.franquia || '' },
];

export const COLUNAS_POR_TIPO = {
  equipamentos: COLUNAS_EQUIPAMENTO,
  acessorios: COLUNAS_ACESSORIO,
  softwares: COLUNAS_SOFTWARE,
  linhas: COLUNAS_LINHA,
} as const;

const ORDEM_NIVEL: NivelColuna[] = ['basico', 'financeiro', 'completo'];
/** Colunas de um nível: o nível e os anteriores */
export function colunasDoNivel<T>(cols: Coluna<T>[], nivel: NivelColuna): string[] {
  const ate = ORDEM_NIVEL.indexOf(nivel);
  return cols.filter((c) => ORDEM_NIVEL.indexOf(c.nivel) <= ate).map((c) => c.chave);
}

/** Cabeçalho e linhas de uma aba, só com as colunas escolhidas */
export function montarAba<T>(cols: Coluna<T>[], escolhidas: string[], itens: T[], c: Contexto) {
  const usadas = cols.filter((col) => escolhidas.includes(col.chave));
  return {
    cabecalho: usadas.map((col) => col.rotulo),
    linhas: itens.map((it) => usadas.map((col) => (col.financeira && !c.veValores ? '' : col.valor(it, c)))),
  };
}

/** Totais para a faixa da lista: quantidade, custo de compra e valor atual (equipamentos sem baixa) */
export function totaisEquipamentos(lista: Asset[], vida?: VidaUtil, agora: Date = new Date()) {
  let custo = 0;
  let atual = 0;
  let semValor = 0;
  for (const a of lista) {
    const v = Number(a.fiscal?.valorCompra) || 0;
    if (!v) semValor++;
    custo += v;
    atual += depreciacao(a, vida, agora).valorAtual;
  }
  return { qtd: lista.length, custo: Math.round(custo * 100) / 100, atual: Math.round(atual * 100) / 100, semValor };
}
