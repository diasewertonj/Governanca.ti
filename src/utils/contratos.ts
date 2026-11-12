// =============================================================================
// Fase 8 · Contratos: vigência, cobertura dos ativos e itens cobertos.
// Datas sempre como 'AAAA-MM-DD' locais (comparação de texto já ordena certo).
// =============================================================================
import type { Asset, Contrato, ItemContrato, PeriodicidadeContrato, TipoContrato } from '../types/index.ts';
import { diasAte, getWarrantyStatus, isoLocal, type WarrantyStatus } from './formatters.ts';

/** Antecedência do alerta "contrato vence em N dias" */
export const DIAS_ALERTA_CONTRATO = 60;

export const ROTULO_TIPO_CONTRATO: Record<TipoContrato, string> = {
  suporte: 'Suporte',
  garantia_estendida: 'Garantia estendida',
  manutencao: 'Manutenção',
  locacao: 'Locação',
  licenciamento: 'Licenciamento',
  outro: 'Outro',
};

export const ROTULO_PERIODICIDADE: Record<PeriodicidadeContrato, string> = {
  mensal: 'Mensal',
  anual: 'Anual',
  unico: 'Pagamento único',
};

/** Tipos de contrato que estendem a garantia do equipamento */
export const TIPOS_QUE_COBREM: TipoContrato[] = ['suporte', 'garantia_estendida'];

export type SituacaoContrato = 'vigente' | 'vencendo' | 'encerrado' | 'a_iniciar';

/** Situação do contrato hoje e dias até o fim (quando há fim) */
export function situacaoContrato(
  c: Pick<Contrato, 'inicio' | 'fim'>,
  agora: Date = new Date()
): { situacao: SituacaoContrato; dias?: number } {
  const dias = c.fim ? diasAte(c.fim, agora) : undefined;
  if (dias !== undefined && dias < 0) return { situacao: 'encerrado', dias };
  if (dias !== undefined && dias <= DIAS_ALERTA_CONTRATO) return { situacao: 'vencendo', dias };
  if (c.inicio > isoLocal(agora)) return { situacao: 'a_iniciar', dias };
  return { situacao: 'vigente', dias };
}

/** Em vigor hoje: já começou e não terminou */
export function contratoVigente(c: Pick<Contrato, 'inicio' | 'fim'>, agora: Date = new Date()): boolean {
  const hoje = isoLocal(agora);
  return c.inicio <= hoje && (!c.fim || c.fim >= hoje);
}

/**
 * Contratos vigentes de suporte ou garantia estendida que cobrem o ativo, do
 * fim mais distante para o mais próximo. Contrato sem data de fim não entra:
 * sem data não há como estender a garantia (o formulário exige o fim nesses tipos).
 */
export function contratosQueCobrem(ativoId: string, contratos: Contrato[], agora: Date = new Date()): Contrato[] {
  return contratos
    .filter(
      (c) =>
        Boolean(c.fim) &&
        TIPOS_QUE_COBREM.includes(c.tipo) &&
        contratoVigente(c, agora) &&
        c.itens.some((i) => i.ativoId === ativoId)
    )
    .sort((a, b) => (b.fim as string).localeCompare(a.fim as string));
}

/** Fim da cobertura: a data maior entre a garantia de fábrica e os contratos que cobrem o ativo */
export function fimCoberturaEfetiva(
  asset: Pick<Asset, 'id' | 'fiscal'>,
  contratos: Contrato[],
  agora: Date = new Date()
): string | undefined {
  const fabrica = asset.fiscal?.dataGarantia || undefined;
  const contrato = contratosQueCobrem(asset.id, contratos, agora)[0]?.fim;
  if (!contrato) return fabrica;
  if (!fabrica) return contrato;
  return contrato > fabrica ? contrato : fabrica;
}

/** Situação da garantia considerando a cobertura dos contratos (alertas, filtros e selos) */
export function garantiaEfetiva(
  asset: Pick<Asset, 'id' | 'fiscal'>,
  contratos: Contrato[],
  agora: Date = new Date()
): WarrantyStatus & { fim?: string } {
  const fim = fimCoberturaEfetiva(asset, contratos, agora);
  return { ...getWarrantyStatus(fim, agora), fim };
}

const chaveItem = (i: ItemContrato) => (i.ativoId ? `a:${i.ativoId}` : `l:${i.licencaId}`);

/** O que entrou e o que saiu da lista de itens cobertos (para gravar só a diferença) */
export function diferencaItens(antes: ItemContrato[], depois: ItemContrato[]) {
  const chavesAntes = new Set(antes.map(chaveItem));
  const chavesDepois = new Set(depois.map(chaveItem));
  return {
    novos: depois.filter((i) => !chavesAntes.has(chaveItem(i))),
    removidos: antes.filter((i) => !chavesDepois.has(chaveItem(i))),
  };
}

/** Ex.: "20 ativos · 1 licença" */
export function resumoItens(itens: ItemContrato[]): string {
  const ativos = itens.filter((i) => i.ativoId).length;
  const licencas = itens.length - ativos;
  const partes = [
    ativos ? `${ativos} ${ativos === 1 ? 'ativo' : 'ativos'}` : '',
    licencas ? `${licencas} ${licencas === 1 ? 'licença' : 'licenças'}` : '',
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'Nenhum item';
}

/** Nome curto do contrato: número e descrição (ex.: "#CT-88 · Dell ProSupport") */
export const nomeContrato = (c: Pick<Contrato, 'numero' | 'descricao'>) =>
  c.numero ? `${c.numero} · ${c.descricao}` : c.descricao;
