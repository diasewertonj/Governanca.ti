// =============================================================================
// Fase 8 · Faturas de licenças e contratos (lógica pura, testada).
// Competência = 1º dia do mês ('AAAA-MM-01'); datas locais 'AAAA-MM-DD'.
// =============================================================================
import type { Fatura, PeriodicidadeContrato, StatusFatura } from '../types/index.ts';
import { diasAte, isoLocal } from './formatters.ts';

/** Antecedência do alerta "fatura vence em N dias" */
export const DIAS_ALERTA_FATURA = 7;

/** Dia do mês sugerido para o vencimento de uma fatura nova */
export const DIA_VENCIMENTO_PADRAO = 10;

/** A fatura é de uma licença OU de um contrato */
export type AlvoFatura = { licencaId: string; contratoId?: never } | { contratoId: string; licencaId?: never };

export type StatusExibidoFatura = StatusFatura | 'vencida';

export const ROTULO_STATUS_FATURA: Record<StatusExibidoFatura, string> = {
  a_pagar: 'A pagar',
  vencida: 'Vencida',
  paga: 'Paga',
  cancelada: 'Cancelada',
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'AAAA-MM-DD' -> competência do mês ('AAAA-MM-01') */
export const competenciaDe = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Competência somada de N meses (N pode ser negativo) */
export function somarMeses(competencia: string, meses: number): string {
  const [ano, mes] = competencia.split('-').map(Number);
  const total = ano * 12 + (mes - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

/** Ex.: '2026-11-01' -> 'nov/2026' */
export function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number);
  return `${MESES[mes - 1] ?? '?'}/${ano}`;
}

/** Faturas de uma licença ou de um contrato, da competência mais recente para a mais antiga */
export function faturasDoAlvo(faturas: Fatura[], alvo: AlvoFatura): Fatura[] {
  return faturas
    .filter((f) => (alvo.licencaId ? f.licencaId === alvo.licencaId : f.contratoId === alvo.contratoId))
    .sort((a, b) => b.competencia.localeCompare(a.competencia) || b.criadoEm.localeCompare(a.criadoEm));
}

/**
 * Competência da próxima fatura: a seguinte à última não cancelada (um mês
 * depois; um ano depois na cobrança anual). Sem faturas, o mês atual.
 */
export function proximaCompetencia(
  faturas: Pick<Fatura, 'competencia' | 'status'>[],
  periodicidade: PeriodicidadeContrato,
  agora: Date = new Date()
): string {
  const ultima = faturas
    .filter((f) => f.status !== 'cancelada')
    .map((f) => f.competencia)
    .sort()
    .pop();
  if (!ultima) return competenciaDe(isoLocal(agora));
  return somarMeses(ultima, periodicidade === 'anual' ? 12 : 1);
}

/** Vencimento sugerido: dia 10 do mês da competência, mas nunca antes de hoje */
export const vencimentoSugerido = (competencia: string, agora: Date = new Date()) => {
  const sugerido = `${competencia.slice(0, 8)}${String(DIA_VENCIMENTO_PADRAO).padStart(2, '0')}`;
  const hoje = isoLocal(agora);
  return sugerido < hoje ? hoje : sugerido;
};

/** Status para a tela: "vencida" quando está a pagar e o vencimento já passou */
export function statusExibido(f: Pick<Fatura, 'status' | 'vencimento'>, agora: Date = new Date()): StatusExibidoFatura {
  if (f.status === 'a_pagar' && f.vencimento < isoLocal(agora)) return 'vencida';
  return f.status;
}

/** Total pago no ano (pela data de pagamento) */
export function totalPagoNoAno(faturas: Pick<Fatura, 'status' | 'pagoEm' | 'valor'>[], ano: number): number {
  return faturas
    .filter((f) => f.status === 'paga' && f.pagoEm?.startsWith(`${ano}-`))
    .reduce((soma, f) => soma + f.valor, 0);
}

/** Faturas a pagar já vencidas e as que vencem nos próximos 7 dias (quadro do Início) */
export function resumoFaturasAPagar(faturas: Pick<Fatura, 'status' | 'vencimento'>[], agora: Date = new Date()) {
  const aPagar = faturas.filter((f) => f.status === 'a_pagar').map((f) => diasAte(f.vencimento, agora));
  return {
    vencidas: aPagar.filter((d) => d < 0).length,
    vencemEmBreve: aPagar.filter((d) => d >= 0 && d <= DIAS_ALERTA_FATURA).length,
  };
}

/** Competências para escolher no formulário: de `antes` meses atrás até `depois` meses à frente */
export function opcoesCompetencia(centro: string, antes = 24, depois = 12): string[] {
  return Array.from({ length: antes + depois + 1 }, (_, i) => somarMeses(centro, depois - i));
}

/**
 * Confere a fatura antes de gravar (o banco confere de novo). Devolve a
 * mensagem do primeiro problema ou null.
 */
export function validarFatura(
  f: Pick<Fatura, 'id' | 'competencia' | 'valor' | 'vencimento' | 'status' | 'pagoEm'>,
  doMesmoAlvo: Pick<Fatura, 'id' | 'competencia' | 'status'>[]
): string | null {
  if (!f.competencia) return 'Informe a competência.';
  if (!Number.isFinite(f.valor)) return 'Informe o valor.';
  if (f.valor < 0) return 'O valor não pode ser negativo.';
  if (!f.vencimento) return 'Informe o vencimento.';
  if (f.status === 'paga' && !f.pagoEm) return 'Fatura paga precisa da data de pagamento.';
  const repetida = doMesmoAlvo.some(
    (o) => o.id !== f.id && o.status !== 'cancelada' && o.competencia === f.competencia
  );
  if (f.status !== 'cancelada' && repetida) {
    return `Já existe fatura não cancelada para ${rotuloCompetencia(f.competencia)}.`;
  }
  return null;
}
