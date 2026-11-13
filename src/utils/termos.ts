// Lote 1: situação real do termo (a mesma em todas as telas).
import type { ItemTermo, ResponsibilityTerm } from '../types/index.ts';

export type TomSituacao = 'ok' | 'pendente' | 'neutro' | 'cancelado';

export interface SituacaoTermo {
  rotulo: string;
  tom: TomSituacao;
}

type TermoBase = Pick<
  ResponsibilityTerm,
  'statusAssinatura' | 'formaAssinatura' | 'aceiteColaboradorEm' | 'aceiteTiEm' | 'canceladoEm' | 'substituidoPor'
>;

export const termoCancelado = (t: Pick<ResponsibilityTerm, 'canceladoEm'>) => !!t.canceladoEm;

/** Termo que ainda pode ser assinado (nem cancelado, nem encerrado) */
export const termoAberto = (t: TermoBase) =>
  !termoCancelado(t) && t.statusAssinatura !== 'assinado' && (t.formaAssinatura || 'pendente') === 'pendente';

/**
 * @param paraColaborador texto do ponto de vista de quem assina ("sua assinatura")
 * @param codigoSubstituto código do termo que substituiu este, quando houver
 */
export function situacaoTermo(t: TermoBase, paraColaborador = false, codigoSubstituto?: string): SituacaoTermo {
  if (termoCancelado(t)) {
    return {
      rotulo: t.substituidoPor ? `Substituído${codigoSubstituto ? ` por ${codigoSubstituto}` : ''}` : 'Cancelado',
      tom: 'cancelado',
    };
  }
  if (t.formaAssinatura === 'dispensada') return { rotulo: 'Assinatura dispensada', tom: 'neutro' };
  if (t.statusAssinatura === 'assinado') {
    return {
      rotulo: t.formaAssinatura === 'eletronica' ? 'Assinado eletronicamente' : 'Assinado (documento)',
      tom: 'ok',
    };
  }
  if (t.aceiteColaboradorEm && !t.aceiteTiEm) {
    return { rotulo: paraColaborador ? 'Você assinou; falta a T.I.' : 'Falta a assinatura da T.I.', tom: 'pendente' };
  }
  if (t.aceiteTiEm && !t.aceiteColaboradorEm) {
    return { rotulo: paraColaborador ? 'Aguardando sua assinatura' : 'Falta a assinatura do colaborador', tom: 'pendente' };
  }
  return { rotulo: paraColaborador ? 'Aguardando sua assinatura' : 'Pendente de assinatura', tom: 'pendente' };
}

export const CLASSE_TOM: Record<TomSituacao, string> = {
  ok: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  pendente: 'text-amber-700 bg-amber-50 border-amber-200',
  neutro: 'text-slate-700 bg-slate-100 border-slate-200',
  cancelado: 'text-rose-700 bg-rose-50 border-rose-200 line-through decoration-rose-300',
};

/**
 * Conferência antes de gerar o termo: cada item entregue/devolvido precisa da
 * condição escolhida, e a T.I. confirma que conferiu com a pessoa.
 */
export function erroConferenciaTermo(
  linhas: Pick<ItemTermo, 'descricao' | 'condicao' | 'situacao'>[],
  conferido: boolean
): string | null {
  if (linhas.length === 0) return 'O termo não tem itens.';
  const semCondicao = linhas.filter((l) => (l.situacao === 'entregue' || l.situacao === 'devolvido') && !l.condicao);
  if (semCondicao.length) return `Informe a condição de: ${semCondicao.map((l) => l.descricao).join(', ')}.`;
  if (!conferido) return 'Confirme que conferiu os itens com a pessoa.';
  return null;
}

/** Mesma regra do banco (cancelar_termo) */
export function erroCancelarTermo(motivo: string): string | null {
  return motivo.trim().length < 5 ? 'Explique o motivo do cancelamento.' : null;
}
